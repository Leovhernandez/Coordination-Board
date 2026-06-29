-- ============================================================================
-- M18 — Activity log + blocker duration  (INSTRUCTIONS.md M18; AGENTS.md §9)
--
-- Append-only log of phase changes (status / label / assignment / add / delete)
-- and note changes (add / edit / delete), each with a TWO-SIDED actor (member or
-- crew participant, like notes) + timestamp. Powers a collapsible per-phase
-- "History" disclosure and the at-a-glance "Blocked Nd" duration pill. NOT a
-- global feed (AGENTS §7).
--
-- INTEGRITY MODEL: the log is APPEND-ONLY and SERVER-WRITTEN. `authenticated` is
-- granted ONLY SELECT (no insert/update/delete grant), so any member write attempt
-- fails at the PRIVILEGE layer (SQLSTATE 42501) before RLS is even consulted — a
-- member can read their org's activity (org-wide, per M-VIS — can_read_job) but
-- can't forge or alter log rows via the data API. The server actions append rows
-- via the service-role client (bypasses grants + RLS), attributing the actor they
-- already know (member id for owner/salesman; participant id for crew).
--
-- REALTIME: intentionally NOT published. Every log row is written together with a
-- phase/note change that already drives live-refresh (phases/notes postgres_changes
-- + broadcastJobChange), so the History re-fetches for free on that event.
--
-- WHY actor / phase / note FKs are ON DELETE SET NULL (not cascade): the log must
-- OUTLIVE the thing it describes — a 'phase_deleted' / 'note_deleted' row would
-- erase itself under cascade. The human-readable label/context is copied into
-- `detail` at write time so the entry stays meaningful after the FK nulls.
--
-- VERIFY BEFORE APPLYING — RLS pre-flight (docs/RELEASE-CHECKLIST.md Step 2),
-- pasting both files in ONE run so nothing persists:
--   BEGIN;  <this migration>  supabase/tests/rls-m18-activity-smoke.sql  ROLLBACK;
-- Idempotent. Independent of the Phase 0.5 migration — apply order doesn't matter.
-- ============================================================================

create table if not exists activity_log (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid not null references jobs (id) on delete cascade,
  phase_id             uuid references phases (id) on delete set null,
  note_id              uuid references notes (id) on delete set null,
  event_type           text not null check (event_type in (
                         'status_change', 'label_change', 'assignment_change',
                         'phase_added', 'phase_deleted',
                         'note_added', 'note_edited', 'note_deleted'
                       )),
  -- Two-sided actor (exactly one set in practice; lenient null so an unattributed
  -- system event could be logged without breaking the append-only writer).
  actor_member_id      uuid references org_members (id) on delete set null,
  actor_participant_id uuid references participants (id) on delete set null,
  detail               jsonb not null default '{}'::jsonb,  -- {from,to,reason,label,...}
  created_at           timestamptz not null default now()
);
create index if not exists activity_log_job_id_idx  on activity_log (job_id);
create index if not exists activity_log_phase_idx    on activity_log (phase_id, created_at);

-- Read-only for members; the server (service_role) appends. No write grant to
-- authenticated → with RLS on, insert/update/delete are denied by default.
grant select on activity_log to authenticated;
grant all on activity_log to service_role;
-- anon: nothing.

alter table activity_log enable row level security;

-- READ: any org member reads their org's activity (owner + salesman, per M-VIS).
drop policy if exists "members read org activity" on activity_log;
create policy "members read org activity"
  on activity_log for select to authenticated
  using ( public.can_read_job(job_id) );

-- NO insert/update/delete policy for authenticated — append-only via service role.
