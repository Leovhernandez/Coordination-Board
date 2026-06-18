-- ============================================================================
-- Coordination Board — M1 core schema
-- Mirrors BUILD-PROMPT.md "Data model" exactly. No tables added "for later"
-- (CLAUDE.md §7). Dependencies between phases are the linear sequence_index ONLY.
-- ============================================================================

-- ---------- Enums ----------
create type phase_status as enum ('not_started', 'in_progress', 'blocked', 'done');
create type job_status   as enum ('active', 'archived');

-- ---------- Tables ----------

-- The contractor's account.
create table organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  owner_user_id       uuid not null references auth.users (id),
  stripe_customer_id  text,
  subscription_status text not null default 'trialing', -- trialing | active | past_due | canceled
  created_at          timestamptz not null default now()
);
create unique index organizations_owner_user_id_key on organizations (owner_user_id);

create table jobs (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations (id) on delete cascade,
  name          text not null,
  address       text,
  customer_name text,
  status        job_status not null default 'active',
  created_at    timestamptz not null default now()
);
create index jobs_org_id_idx on jobs (org_id);

-- Lightweight, link-token-only invitees (NOT auth.users). Defined before phases
-- for the assignee FK. Access is via signed invite_token through server actions.
create table participants (
  id           uuid primary key default gen_random_uuid(),
  job_id       uuid not null references jobs (id) on delete cascade,
  name         text not null,
  phone        text,
  invite_token text not null unique,            -- 32-byte cryptographically random, base64url
  revoked      boolean not null default false,
  last_seen_at timestamptz,
  created_at   timestamptz not null default now()
);
create index participants_job_id_idx on participants (job_id);

-- Ordered list of phases per job; dependency is the linear sequence_index ONLY.
create table phases (
  id                      uuid primary key default gen_random_uuid(),
  job_id                  uuid not null references jobs (id) on delete cascade,
  label                   text not null,
  sequence_index          int  not null,
  status                  phase_status not null default 'not_started',
  blocked_reason          text,                 -- the "waiting on ___" line; required when blocked
  assignee_participant_id uuid references participants (id) on delete set null,
  updated_at              timestamptz not null default now(),
  unique (job_id, sequence_index)
);
create index phases_job_id_idx on phases (job_id);

-- A blocked phase must carry a non-empty reason (enforces BUILD-PROMPT's
-- "required when status='blocked'" at the database level).
alter table phases
  add constraint phases_blocked_requires_reason
  check (
    status <> 'blocked'
    or (blocked_reason is not null and length(btrim(blocked_reason)) > 0)
  );

-- ============================================================================
-- Row Level Security
--
-- Owner model only: the Supabase-authed contractor can do everything within
-- THEIR OWN org (CLAUDE.md §5). Participants are NOT auth users — their reads/
-- writes go through Next.js server actions using the service-role client, which
-- bypasses RLS; that path validates the invite token and scopes every query to
-- the token's single job_id in application code. RLS is the owner backstop.
--
-- RLS is deny-by-default once enabled: with no matching policy, the `anon` and
-- other `authenticated` users get nothing.
-- ============================================================================

alter table organizations enable row level security;
alter table jobs          enable row level security;
alter table participants  enable row level security;
alter table phases        enable row level security;

-- organizations: the owner is the auth user who owns the row.
create policy "owner manages own org"
  on organizations
  for all
  to authenticated
  using ( owner_user_id = (select auth.uid()) )
  with check ( owner_user_id = (select auth.uid()) );

-- jobs: owner of the parent org.
create policy "owner manages jobs in own org"
  on jobs
  for all
  to authenticated
  using (
    exists (
      select 1 from organizations o
      where o.id = jobs.org_id
        and o.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from organizations o
      where o.id = jobs.org_id
        and o.owner_user_id = (select auth.uid())
    )
  );

-- participants: owner of the participant's job's org.
create policy "owner manages participants in own jobs"
  on participants
  for all
  to authenticated
  using (
    exists (
      select 1 from jobs j
      join organizations o on o.id = j.org_id
      where j.id = participants.job_id
        and o.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from jobs j
      join organizations o on o.id = j.org_id
      where j.id = participants.job_id
        and o.owner_user_id = (select auth.uid())
    )
  );

-- phases: owner of the phase's job's org.
create policy "owner manages phases in own jobs"
  on phases
  for all
  to authenticated
  using (
    exists (
      select 1 from jobs j
      join organizations o on o.id = j.org_id
      where j.id = phases.job_id
        and o.owner_user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from jobs j
      join organizations o on o.id = j.org_id
      where j.id = phases.job_id
        and o.owner_user_id = (select auth.uid())
    )
  );
