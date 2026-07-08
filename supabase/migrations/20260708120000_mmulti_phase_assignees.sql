-- ============================================================================
-- M-MULTI (M24) — multiple crew per phase  (INSTRUCTIONS.md Round 4; AGENTS.md §9)
--
-- ADDITIVE migration 1 of 2. Creates the phase_assignees junction + RLS +
-- realtime + cap trigger and BACKFILLS one row per currently-assigned phase.
-- phases.assignee_participant_id is KEPT for rollback safety — app code stops
-- reading it after the switch; a later cleanup migration drops it once validated.
--
-- Design decisions (owner-confirmed 2026-07-07):
--   * Status stays ONE per phase, shared, last-writer-wins (no per-person status);
--     the critical-path headline and 3-second glance are unchanged (§2/§7).
--   * Cap: organizations.max_assignees_per_phase (default 10, raiseable per org
--     without a code change) — enforced in the assign server action AND by the
--     DB trigger below (belt-and-suspenders; the constraint can't be bypassed).
--   * Co-assignees on a phase read each other's crew notes; edit stays own-only
--     (M17 rule holds — enforced in the token-scoped server actions, not here).
--
-- RLS (deny-by-default; read vs write SPLIT per §5 / M-VIS):
--   SELECT : any org member reads assignments on org jobs (can_read_job).
--   WRITE  : only a member who can edit the job (can_access_job) — mirrors the
--            phases write layer exactly (blanket-owner at RLS; the UI enforces
--            the R2 owner-read-only boundary, as it does for phases today).
--   Crew NEVER self-assign: assignment is a member action. Crew reads/writes go
--   through the token-scoped service-role path, which bypasses RLS by design.
--   anon: granted nothing.
--
-- job_id is denormalized (as notes does) so RLS and the realtime filter can
-- scope without a join; the trigger additionally REJECTS a job_id that doesn't
-- match the phase's/participant's actual job (defense-in-depth — an assignment
-- row is crew-write access, so integrity matters more than it did for notes).
--
-- Realtime (FIX-1 + the R1 lesson): unassign is a DELETE that must live-refresh
-- under the job_id filter + RLS, so the table gets REPLICA IDENTITY FULL and is
-- added to the supabase_realtime publication. Assign/unassign server actions
-- also broadcastJobChange so anon crew boards react (phase appears/disappears).
--
-- VERIFY BEFORE APPLYING — RLS pre-flight (docs/RELEASE-CHECKLIST.md Step 2):
--   BEGIN;  <this migration>  supabase/tests/rls-mmulti-smoke.sql  ROLLBACK;
-- Idempotent where practical so a partial re-run is safe.
-- ============================================================================

-- ---------- Org-level cap (config, not code — §0 capability/config model) ----------
alter table organizations
  add column if not exists max_assignees_per_phase int not null default 10;

-- ---------- Junction table ----------
create table if not exists phase_assignees (
  phase_id       uuid not null references phases (id)       on delete cascade,
  participant_id uuid not null references participants (id) on delete cascade,
  job_id         uuid not null references jobs (id)         on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (phase_id, participant_id)
);
create index if not exists phase_assignees_participant_id_idx
  on phase_assignees (participant_id);
create index if not exists phase_assignees_job_id_idx
  on phase_assignees (job_id);

-- ---------- Data API grants (a query needs BOTH a grant and a passing policy) ----------
grant select, insert, update, delete on phase_assignees to authenticated;
grant all on phase_assignees to service_role;  -- crew read path; bypasses RLS
-- anon: intentionally granted nothing.

-- ---------- Row Level Security (deny-by-default; read vs write split) ----------
alter table phase_assignees enable row level security;

drop policy if exists "members read org assignments" on phase_assignees;
create policy "members read org assignments"
  on phase_assignees for select to authenticated
  using ( public.can_read_job(job_id) );

drop policy if exists "job editor adds assignment" on phase_assignees;
create policy "job editor adds assignment"
  on phase_assignees for insert to authenticated
  with check ( public.can_access_job(job_id) );

drop policy if exists "job editor updates assignment" on phase_assignees;
create policy "job editor updates assignment"
  on phase_assignees for update to authenticated
  using ( public.can_access_job(job_id) )
  with check ( public.can_access_job(job_id) );

drop policy if exists "job editor removes assignment" on phase_assignees;
create policy "job editor removes assignment"
  on phase_assignees for delete to authenticated
  using ( public.can_access_job(job_id) );

-- ---------- Cap + integrity trigger (backstop; the server action checks first) ----------
-- SECURITY DEFINER so the lookups bypass RLS (same rationale as the §5 helpers);
-- STABLE lookups only, pinned search_path. The FOR UPDATE lock on the phase row
-- serializes concurrent inserts against the same phase so a race can't overshoot
-- the cap.
create or replace function public.enforce_phase_assignee_cap()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_phase_job uuid;
  v_part_job  uuid;
  v_cap       int;
  v_count     int;
begin
  -- Integrity: the denormalized job_id must match BOTH the phase's job and the
  -- participant's job (an assignment row grants crew write access — never let a
  -- direct data-API write point it across jobs/orgs).
  select job_id into v_phase_job from phases where id = new.phase_id for update;
  if v_phase_job is null or v_phase_job <> new.job_id then
    raise exception 'phase_assignees.job_id does not match the phase''s job';
  end if;
  select job_id into v_part_job from participants where id = new.participant_id;
  if v_part_job is null or v_part_job <> new.job_id then
    raise exception 'participant does not belong to this job';
  end if;

  -- Cap: the org's max_assignees_per_phase (default 10).
  select o.max_assignees_per_phase into v_cap
    from jobs j join organizations o on o.id = j.org_id
    where j.id = new.job_id;
  select count(*) into v_count from phase_assignees where phase_id = new.phase_id;
  if v_count >= coalesce(v_cap, 10) then
    raise exception 'phase assignee cap (%) reached for this phase', coalesce(v_cap, 10)
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists phase_assignees_cap on phase_assignees;
create trigger phase_assignees_cap
  before insert on phase_assignees
  for each row execute function public.enforce_phase_assignee_cap();

-- ---------- Realtime ----------
-- REPLICA IDENTITY FULL: an unassign is a DELETE that must match the member
-- board's job_id filter + RLS to be delivered (the exact R1/M17 failure mode —
-- a default-identity DELETE carries only the PK and is silently dropped).
alter table phase_assignees replica identity full;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'phase_assignees'
  ) then
    alter publication supabase_realtime add table phase_assignees;
  end if;
end $$;

-- ---------- Backfill (one junction row per currently-assigned phase) ----------
-- Mirrors the legacy column exactly (including assignments to since-revoked
-- participants — same semantics the column has today). Idempotent via on conflict.
insert into phase_assignees (phase_id, participant_id, job_id)
select p.id, p.assignee_participant_id, p.job_id
from phases p
where p.assignee_participant_id is not null
on conflict (phase_id, participant_id) do nothing;

-- ---------- Legacy-write compatibility bridge (dropped by the cleanup migration) ----------
-- Between this migration landing in prod and the M-MULTI app code deploying, the
-- DEPLOYED app still writes assignments to phases.assignee_participant_id. This
-- trigger mirrors those legacy single-assignee writes into the junction (swap =
-- delete old pair + insert new) so the two can't drift in the window. After the
-- app switch the column is never written again, so the trigger goes quiet; the
-- cleanup migration drops the trigger with the column.
create or replace function public.mirror_legacy_phase_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.assignee_participant_id is distinct from new.assignee_participant_id then
    if old.assignee_participant_id is not null then
      delete from phase_assignees
        where phase_id = new.id and participant_id = old.assignee_participant_id;
    end if;
    if new.assignee_participant_id is not null then
      insert into phase_assignees (phase_id, participant_id, job_id)
        values (new.id, new.assignee_participant_id, new.job_id)
        on conflict (phase_id, participant_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists phases_mirror_legacy_assignee on phases;
create trigger phases_mirror_legacy_assignee
  after update of assignee_participant_id on phases
  for each row execute function public.mirror_legacy_phase_assignee();

-- phases.assignee_participant_id is intentionally KEPT (rollback safety).
-- App code must not read it after the M-MULTI switch; a follow-up cleanup
-- migration drops it (and the bridge trigger above) once the milestone is
-- validated (grep for zero references first — INSTRUCTIONS.md M-MULTI step 3).
