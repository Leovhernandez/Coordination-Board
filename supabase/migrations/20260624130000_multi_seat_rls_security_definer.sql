-- ============================================================================
-- M14 RLS, done right — replace the inline cross-table subqueries (which
-- recursed) with SECURITY DEFINER helper functions. A SECURITY DEFINER function
-- runs as its owner and BYPASSES RLS on the tables it reads, so a policy that
-- calls it cannot trigger another policy → recursion is structurally impossible.
--
-- Each helper is STABLE, pinned to `search_path = public`, returns only a boolean,
-- and is filtered strictly to the calling user (auth.uid()) — so it leaks nothing.
--
-- Supersedes the inline policies from 20260622120000 and re-enables the salesman
-- org-read that 20260624120000 had to drop to stop the recursion.
--
-- VERIFY BEFORE APPLYING: run this inside BEGIN; ... ROLLBACK; together with
-- supabase/tests/rls-smoke.sql (docs/RELEASE-CHECKLIST.md Step 2).
-- ============================================================================

-- ---------- Helper functions (RLS-bypassing, self-scoped) ----------
create or replace function public.is_org_owner(p_org_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.organizations
    where id = p_org_id and owner_user_id = (select auth.uid())
  );
$$;

create or replace function public.owns_member(p_member_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.org_members
    where id = p_member_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_org_member(p_org_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.org_members
    where org_id = p_org_id and user_id = (select auth.uid())
  ) or exists (
    select 1 from public.organizations
    where id = p_org_id and owner_user_id = (select auth.uid())
  );
$$;

create or replace function public.can_access_job(p_job_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id
      and ( public.is_org_owner(j.org_id) or public.owns_member(j.salesman_member_id) )
  );
$$;

grant execute on function
  public.is_org_owner(uuid),
  public.owns_member(uuid),
  public.is_org_member(uuid),
  public.can_access_job(uuid)
  to authenticated;

-- ---------- organizations ----------
-- "owner manages own org" (from init, owner_user_id = auth.uid()) stays as-is.
drop policy if exists "member reads own org" on organizations;
create policy "member reads own org"
  on organizations for select to authenticated
  using ( public.is_org_member(id) );

-- ---------- org_members ----------
drop policy if exists "owner manages org members" on org_members;
create policy "owner manages org members"
  on org_members for all to authenticated
  using ( public.is_org_owner(org_id) )
  with check ( public.is_org_owner(org_id) );
-- "member reads own membership" (user_id = auth.uid()) stays as-is.

-- ---------- jobs ----------
drop policy if exists "owner manages org jobs" on jobs;
drop policy if exists "salesman manages own jobs" on jobs;
create policy "owner manages org jobs"
  on jobs for all to authenticated
  using ( public.is_org_owner(org_id) )
  with check ( public.is_org_owner(org_id) );
create policy "salesman manages own jobs"
  on jobs for all to authenticated
  using ( public.owns_member(salesman_member_id) )
  with check ( public.owns_member(salesman_member_id) );

-- ---------- phases ----------
drop policy if exists "access phases via owned job" on phases;
create policy "access phases via owned job"
  on phases for all to authenticated
  using ( public.can_access_job(job_id) )
  with check ( public.can_access_job(job_id) );

-- ---------- participants ----------
drop policy if exists "access participants via owned job" on participants;
create policy "access participants via owned job"
  on participants for all to authenticated
  using ( public.can_access_job(job_id) )
  with check ( public.can_access_job(job_id) );
