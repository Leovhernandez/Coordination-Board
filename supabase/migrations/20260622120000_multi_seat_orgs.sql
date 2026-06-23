-- ============================================================================
-- M14 — Multi-seat organizations  (AGENTS.md §9)
--
-- One company = one org with one OWNER + many SALESMAN members sharing one crew
-- pool and one subscription. This ADDS a membership layer on top of the existing
-- owner model; it does NOT remove owner_user_id, so the live owner-only app keeps
-- working unchanged after this migration (app-layer wiring comes next, separately).
--
-- Visibility (confirmed): OWNER sees all org jobs; SALESMAN sees only the jobs
-- they own (jobs.salesman_member_id = their membership). To later let all salesmen
-- see all org jobs, widen the "salesman manages own jobs" policy — one place.
--
-- Idempotent where practical so a partial re-run is safe.
-- ============================================================================

-- ---------- Role enum ----------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'org_role') then
    create type org_role as enum ('owner', 'salesman');
  end if;
end $$;

-- ---------- Members ----------
create table if not exists org_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references organizations (id) on delete cascade,
  user_id    uuid references auth.users (id),   -- null until the invited email first signs in
  email      text not null,
  name       text not null,
  role       org_role not null default 'salesman',
  created_at timestamptz not null default now()
);
create unique index if not exists org_members_org_email_key on org_members (org_id, lower(email));
create index if not exists org_members_user_id_idx on org_members (user_id);
create index if not exists org_members_org_id_idx on org_members (org_id);

-- ---------- Job ownership by salesman ----------
alter table jobs
  add column if not exists salesman_member_id uuid references org_members (id) on delete set null;
create index if not exists jobs_salesman_member_id_idx on jobs (salesman_member_id);

-- ---------- Backfill existing data ----------
-- Every existing org's owner becomes its 'owner' member. Email comes from M8.5's
-- organizations.owner_email, falling back to the auth user's email.
insert into org_members (org_id, user_id, email, name, role)
select o.id,
       o.owner_user_id,
       coalesce(nullif(btrim(o.owner_email), ''), u.email, 'owner@unknown'),
       coalesce(nullif(btrim(o.name), ''), 'Owner'),
       'owner'
from organizations o
join auth.users u on u.id = o.owner_user_id
where not exists (
  select 1 from org_members m
  where m.org_id = o.id and m.user_id = o.owner_user_id
);

-- Existing jobs are owned by their org's owner member.
update jobs j
set salesman_member_id = m.id
from organizations o
join org_members m
  on m.org_id = o.id and m.user_id = o.owner_user_id and m.role = 'owner'
where j.org_id = o.id and j.salesman_member_id is null;

-- ============================================================================
-- Grants (same posture as init: authenticated constrained by RLS; service_role
-- full for participant server actions; anon nothing).
-- ============================================================================
grant select, insert, update, delete on org_members to authenticated;
grant all on org_members to service_role;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table org_members enable row level security;

-- Owner of the org manages all of its members (add/rename/remove salesmen).
create policy "owner manages org members"
  on org_members for all to authenticated
  using (
    exists (select 1 from organizations o
            where o.id = org_members.org_id
              and o.owner_user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from organizations o
            where o.id = org_members.org_id
              and o.owner_user_id = (select auth.uid()))
  );

-- A member can read their own membership row (to resolve their member id + name).
create policy "member reads own membership"
  on org_members for select to authenticated
  using ( user_id = (select auth.uid()) );

-- ---------- organizations: let members read their org (name for display) ----------
-- (The init "owner manages own org" policy stays; this only ADDs member read.)
create policy "member reads own org"
  on organizations for select to authenticated
  using (
    exists (select 1 from org_members m
            where m.org_id = organizations.id
              and m.user_id = (select auth.uid()))
  );

-- ---------- jobs: owner sees all; salesman sees only own ----------
drop policy if exists "owner manages jobs in own org" on jobs;

create policy "owner manages org jobs"
  on jobs for all to authenticated
  using (
    exists (select 1 from organizations o
            where o.id = jobs.org_id
              and o.owner_user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from organizations o
            where o.id = jobs.org_id
              and o.owner_user_id = (select auth.uid()))
  );

create policy "salesman manages own jobs"
  on jobs for all to authenticated
  using (
    exists (select 1 from org_members m
            where m.id = jobs.salesman_member_id
              and m.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from org_members m
            where m.id = jobs.salesman_member_id
              and m.user_id = (select auth.uid())
              and m.org_id = jobs.org_id)
  );

-- ---------- phases: accessible iff the parent job is accessible ----------
drop policy if exists "owner manages phases in own jobs" on phases;

create policy "access phases via owned job"
  on phases for all to authenticated
  using (
    exists (
      select 1 from jobs j
      join organizations o on o.id = j.org_id
      where j.id = phases.job_id
        and ( o.owner_user_id = (select auth.uid())
              or exists (select 1 from org_members m
                         where m.id = j.salesman_member_id
                           and m.user_id = (select auth.uid())) )
    )
  )
  with check (
    exists (
      select 1 from jobs j
      join organizations o on o.id = j.org_id
      where j.id = phases.job_id
        and ( o.owner_user_id = (select auth.uid())
              or exists (select 1 from org_members m
                         where m.id = j.salesman_member_id
                           and m.user_id = (select auth.uid())) )
    )
  );

-- ---------- participants: accessible iff the parent job is accessible ----------
drop policy if exists "owner manages participants in own jobs" on participants;

create policy "access participants via owned job"
  on participants for all to authenticated
  using (
    exists (
      select 1 from jobs j
      join organizations o on o.id = j.org_id
      where j.id = participants.job_id
        and ( o.owner_user_id = (select auth.uid())
              or exists (select 1 from org_members m
                         where m.id = j.salesman_member_id
                           and m.user_id = (select auth.uid())) )
    )
  )
  with check (
    exists (
      select 1 from jobs j
      join organizations o on o.id = j.org_id
      where j.id = participants.job_id
        and ( o.owner_user_id = (select auth.uid())
              or exists (select 1 from org_members m
                         where m.id = j.salesman_member_id
                           and m.user_id = (select auth.uid())) )
    )
  );

-- ============================================================================
-- NOTE: app-layer wiring is the NEXT step (not in this migration):
--   - lib/auth.ts: on a salesman's first sign-in, link auth.uid() to their
--     pending org_members row instead of creating a new org.
--   - Team UI for the owner to invite/rename/remove salesmen.
--   - jobs created by a salesman set salesman_member_id = their membership.
--   - add `jobs` to the supabase_realtime publication for the M15 owner grid.
-- ============================================================================
