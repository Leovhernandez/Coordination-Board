-- ============================================================================
-- M22 (part 2) — Photos (status-evidence)  (INSTRUCTIONS.md M22; AGENTS.md §9)
--
-- Status-evidence photos attached on Blocked / Done / In-progress transitions.
-- NOT document management, NOT video, NOT invoicing (AGENTS §7). Bytes live on
-- Cloudflare R2 (browser uploads via signed PUT; served from a CDN custom domain —
-- NEVER proxied through Vercel). THIS table holds only the METADATA + the R2 keys;
-- the per-org cap is enforced server-side from byte_size (lib/capabilities.ts).
--
-- TWO-SIDED UPLOADER, like notes/activity_log: a member (owner/salesman) OR a crew
-- participant. Both FKs are ON DELETE SET NULL + a LENIENT (<=1) check (NOT the
-- strict =1 notes use): a deleted uploader must NOT cascade-delete the photo row,
-- which would orphan its R2 object (a storage leak the DB cannot clean). An
-- unattributed photo just shows "—" as uploader (exactly like activity_log). The
-- job's R2 objects are freed deterministically by M10 purgeJob (extended in M22),
-- and on job delete the rows cascade via job_id.
--
-- WRITES ARE SERVER-ONLY (like activity_log): `authenticated` gets SELECT ONLY, so
-- a member insert/update/delete fails at the PRIVILEGE layer (42501) before RLS.
-- Every write goes through a server action that has ALREADY validated the actor
-- (member via getSessionContext; crew via token -> participant -> ASSIGNED phase)
-- AND re-checked the org cap — so routing both sides through the service role keeps
-- the cap check in one place. Crew are not auth users, so RLS never grants them
-- anything; their read scoping (assigned phases only) is enforced in lib/photos.ts.
--
-- READ: any org member reads ALL org photos (can_read_job — owner + salesman per
-- M-VIS), mirroring notes/activity_log.
--
-- REALTIME (AGENTS §6 invariant): published + REPLICA IDENTITY FULL so a new
-- thumbnail live-refreshes on a 2nd device AND a DELETE (job purge / future photo
-- delete) carries job_id so the RLS-scoped board subscription can authorize
-- delivery (the M17 R1 / M10 lesson). The photos row's OWN insert drives the member
-- board refresh (no commit-order race); the crew board refreshes via
-- broadcastJobChange fired by the upload action.
--
-- VERIFY BEFORE APPLYING — RLS pre-flight (docs/RELEASE-CHECKLIST.md Step 2), both
-- files in ONE run so nothing persists:
--   BEGIN;  <this migration>  supabase/tests/rls-m22-photos-smoke.sql  ROLLBACK;
-- Idempotent where practical.
-- ============================================================================

create table if not exists photos (
  id                          uuid primary key default gen_random_uuid(),
  -- job_id is the access key (RLS scopes via it); phase_id groups the photo under a
  -- phase card and nulls if the phase is deleted (the photo stays as job evidence).
  job_id                      uuid not null references jobs (id) on delete cascade,
  phase_id                    uuid references phases (id) on delete set null,
  -- org_id denormalized (like notes.job_id) so the per-org cap SUM + RLS need no join.
  org_id                      uuid not null references organizations (id) on delete cascade,
  status_context              text not null
                                check (status_context in ('blocked', 'done', 'in_progress')),
  uploaded_by_member_id       uuid references org_members (id)  on delete set null,
  uploaded_by_participant_id  uuid references participants (id) on delete set null,
  r2_key                      text not null unique,   -- unique: a double-confirm can't double-count bytes
  thumb_key                   text,
  content_type                text not null,
  byte_size                   bigint not null check (byte_size > 0),
  width                       int,
  height                      int,
  created_at                  timestamptz not null default now(),
  constraint photos_one_uploader
    check (num_nonnulls(uploaded_by_member_id, uploaded_by_participant_id) <= 1)
);
create index if not exists photos_phase_id_idx on photos (phase_id);
create index if not exists photos_job_id_idx   on photos (job_id);
-- Cap accounting: SUM(byte_size) WHERE org_id = $1. INCLUDE byte_size for an
-- index-only sum (no heap fetch) as photo volume grows.
create index if not exists photos_org_id_idx   on photos (org_id) include (byte_size);

-- ---- Data API grants (a query needs BOTH a grant and a passing policy) ----
grant select on photos to authenticated;   -- read only; writes are server-side
grant all    on photos to service_role;     -- crew + member upload path; bypasses RLS
-- anon: intentionally granted nothing.

alter table photos enable row level security;

-- READ: any org member reads their org's photos (owner + salesman, per M-VIS).
drop policy if exists "members read org photos" on photos;
create policy "members read org photos"
  on photos for select to authenticated
  using ( public.can_read_job(job_id) );

-- NO insert/update/delete policy for authenticated — writes are server-only.

-- ---- Realtime ----
-- Publish photos so the board/dashboard live-refresh when a thumbnail lands. RLS
-- still gates delivery (a subscriber only receives photos it can SELECT). Crew
-- (anon) boards refresh via broadcastJobChange. Idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='photos'
  ) then
    alter publication supabase_realtime add table photos;
  end if;
end $$;

-- DELETE events (job purge / future photo delete) must carry job_id for the board's
-- RLS-scoped subscription to authorize delivery (M17 R1 / M10 lesson).
alter table photos replica identity full;
