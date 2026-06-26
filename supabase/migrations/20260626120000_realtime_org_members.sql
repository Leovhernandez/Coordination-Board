-- ============================================================================
-- Add `org_members` to the realtime publication so the owner's roll-up live-
-- updates when a salesman renames their own account (the name shown over their
-- jobs). `phases` (20260619120000) and `jobs` (20260624140000) are already in
-- the publication; this completes the set the dashboard subscribes to.
--
-- RLS still applies to delivery: a subscriber only receives change events for
-- rows they can SELECT. The owner can read all of their org's member rows
-- ("owner manages org members"), so a salesman's rename reaches the owner; a
-- salesman only reads their own row. Idempotent / additive — safe to re-run,
-- and the app degrades gracefully if it isn't applied (the name still updates
-- on the owner's next page load, just not instantly).
-- ============================================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'org_members'
  ) then
    alter publication supabase_realtime add table org_members;
  end if;
end $$;
