-- ============================================================================
-- M18 fix — publish `activity_log` to the realtime publication.
--
-- WHY (reverses the "intentionally NOT published" note in 20260629140000): the
-- History disclosure is backed by `activity_log`, but a write to it is COMMITTED A
-- ROUND-TRIP AFTER the phase/note change it accompanies. A passive viewer (e.g. a
-- salesman watching a job a crew member is updating) refreshes off the phases/notes
-- postgres_changes event, which fires on the EARLIER commit — so the re-fetch of
-- activityForJob runs BEFORE the log row exists. The status pill updates but the
-- History entry is missed, and since `activity_log` wasn't published, no later event
-- re-triggered the refresh. Publishing it makes the log's OWN insert (fired after it
-- commits) drive a refresh that reliably sees the new entry.
--
-- Insert-only table, so DEFAULT replica identity is fine: an INSERT event carries
-- the full new row (incl. job_id), so the board's `job_id=eq.X` filter matches.
-- REPLICA IDENTITY FULL (needed for DELETE filter matching — see M17 R1) is N/A.
--
-- RLS still gates delivery: a subscriber only receives rows it can SELECT (members
-- read org-wide via can_read_job), exactly like `notes`/`phases`. One channel per
-- table (FIX-1) isolates this — if it weren't published, only its channel errors.
-- Idempotent. Apply before/with the app change that adds "activity_log" to the
-- board's RealtimeRefresh tables.
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'activity_log'
  ) then
    alter publication supabase_realtime add table activity_log;
  end if;
end $$;
