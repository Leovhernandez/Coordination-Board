-- ============================================================================
-- M17 — Phase notes  (INSTRUCTIONS.md M17; AGENTS.md §9)
--
-- Small, structured notes per phase (gate/lockbox codes, URLs, short context).
-- NOT chat: no threads, no @mentions, no replies (AGENTS.md §7).
--
-- TWO-SIDED AUTHOR. Exactly one of author_member_id (a Supabase-authed owner/
-- salesman) or author_participant_id (a link-token crew member) is set, enforced
-- by a CHECK. Crew are NOT auth users, so their note reads/writes go through the
-- service-role server-action path (token -> participant -> assigned phase), which
-- BYPASSES RLS — exactly like phases today. The RLS below therefore governs only
-- the AUTHENTICATED members; it never grants crew anything.
--
-- PK is `id` (not the spec's illustrative `note_id`) to match every other table
-- in this schema and lib/types.ts.
--
-- READ vs WRITE are SEPARATE policies (§5), mirroring M-VIS:
--   SELECT : any org member reads ALL notes on jobs in their org (owner = all org;
--            salesman = all org read per M-VIS). Covers member- AND crew-authored
--            notes — members READ crew notes but can never edit them.
--   INSERT : a member may add their OWN note (author_member_id = self) on a job
--            they can EDIT (owner = all org; salesman = own jobs). A salesman is
--            read-only on another salesman's job, so no note-writes there.
--   UPDATE : edit ONLY notes you authored. No one edits another person's note
--            (not even the owner — owner edits only their own; reads all).
--   DELETE : delete ONLY notes you authored.
--
-- VERIFY BEFORE APPLYING — run the RLS pre-flight (docs/RELEASE-CHECKLIST.md
-- Step 2), pasting both files in ONE run so nothing persists:
--   BEGIN;  <this migration>  supabase/tests/rls-m17-notes-smoke.sql  ROLLBACK;
--
-- Idempotent where practical so a partial re-run is safe.
-- ============================================================================

-- ---------- Table ----------
create table if not exists notes (
  id                    uuid primary key default gen_random_uuid(),
  -- phase_id is the access key; job_id is denormalized so RLS can scope to the
  -- org without a join (and kept consistent with the phase by app code).
  phase_id              uuid not null references phases (id) on delete cascade,
  job_id                uuid not null references jobs (id)   on delete cascade,
  -- Exactly one author. on delete cascade keeps the XOR invariant valid if a
  -- member/participant row is ever removed (M18's activity_log is the durable
  -- record; a note is live data, not history).
  author_member_id      uuid references org_members (id)  on delete cascade,
  author_participant_id uuid references participants (id) on delete cascade,
  body                  text not null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint notes_one_author
    check (num_nonnulls(author_member_id, author_participant_id) = 1),
  constraint notes_body_not_blank
    check (length(btrim(body)) > 0)
);
create index if not exists notes_phase_id_idx on notes (phase_id);
create index if not exists notes_job_id_idx   on notes (job_id);

-- ---------- Data API grants (a query needs BOTH a grant and a passing policy) ----------
grant select, insert, update, delete on notes to authenticated;
grant all on notes to service_role;   -- crew server-action path; bypasses RLS
-- anon: intentionally granted nothing.

-- ---------- Row Level Security (deny-by-default) ----------
alter table notes enable row level security;

-- READ: any org member reads all notes on jobs in their org.
drop policy if exists "members read org notes" on notes;
create policy "members read org notes"
  on notes for select to authenticated
  using ( public.can_read_job(job_id) );

-- INSERT: author your OWN note on a job you can edit.
drop policy if exists "member adds own note" on notes;
create policy "member adds own note"
  on notes for insert to authenticated
  with check (
    public.owns_member(author_member_id)
    and public.can_access_job(job_id)
  );

-- UPDATE: edit ONLY notes you authored (and keep them yours).
drop policy if exists "member edits own note" on notes;
create policy "member edits own note"
  on notes for update to authenticated
  using ( public.owns_member(author_member_id) )
  with check ( public.owns_member(author_member_id) );

-- DELETE: delete ONLY notes you authored.
drop policy if exists "member deletes own note" on notes;
create policy "member deletes own note"
  on notes for delete to authenticated
  using ( public.owns_member(author_member_id) );

-- ---------- Realtime ----------
-- Publish `notes` so the board/dashboard live-refresh when a note lands (FIX-1
-- carry-forward). RLS still gates delivery: a subscriber only receives events for
-- notes it can SELECT. The participant (crew) board refreshes via the existing
-- broadcastJobChange path, driven by the note server actions. Idempotent.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table notes;
  end if;
end $$;
