-- ============================================================================
-- Add `jobs` to the realtime publication so the owner's roll-up grid (M15) live-
-- updates when a salesman creates / archives / deletes a job. `phases` was added
-- in 20260619120000; this completes the set for the grid. Idempotent.
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'jobs'
  ) then
    alter publication supabase_realtime add table jobs;
  end if;
end $$;
