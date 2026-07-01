-- M21: preferred payment method — owner opt-in, per-participant field.
--
-- Owner toggles organizations.collect_payment_method (default OFF). When ON, crew
-- record a preferred payment method on their board and the owner/owning-salesman
-- see it in the Crew panel. Not invoicing/payments — a light note of how the sub
-- prefers to be paid (AGENTS §9). The field lives on participants (per job/link
-- row): a sub re-enters it per job; a cross-job crew directory is §7 anti-scope.

alter table public.organizations
  add column if not exists collect_payment_method boolean not null default false;

alter table public.participants
  add column if not exists payment_type text,
  add column if not exists payment_detail text;

-- payment_type is constrained to the known set (or null); payment_detail is free text.
alter table public.participants
  drop constraint if exists participants_payment_type_check;
alter table public.participants
  add constraint participants_payment_type_check
  check (payment_type is null or payment_type in ('zelle','venmo','check','cash','other'));

-- Live-refresh (AGENTS §6): the owner/owning-salesman Crew panel shows crew payment
-- and a 2nd session may be watching. participants isn't published today; publish it
-- so the crew's service-role write drives a postgres_changes refresh on the owner
-- board. postgres_changes is RLS-filtered by the participants policy (can_access_job),
-- so only the owner/owning-salesman receive the event — the row carries invite_token
-- but only those who can already SELECT it get it (no new exposure). REPLICA IDENTITY
-- FULL so a revoke/remove DELETE still carries job_id for the filter.
alter table public.participants replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'participants'
  ) then
    alter publication supabase_realtime add table public.participants;
  end if;
end $$;

comment on column public.organizations.collect_payment_method is
  'M21: owner opt-in. When true, crew are prompted for a preferred payment method and the owner/owning-salesman see it. Default false.';
comment on column public.participants.payment_type is
  'M21: crew preferred payment method (zelle|venmo|check|cash|other), or null. Per job/link row.';
comment on column public.participants.payment_detail is
  'M21: free-text detail for the payment method (phone, @handle, note). Per job/link row.';
