-- M6: enable Supabase Realtime for the phases table so the owner's board and
-- dashboard update live. RLS still applies — a subscriber only receives change
-- events for rows it can SELECT. Idempotent (safe to re-run).

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'phases'
  ) then
    alter publication supabase_realtime add table phases;
  end if;
end $$;
