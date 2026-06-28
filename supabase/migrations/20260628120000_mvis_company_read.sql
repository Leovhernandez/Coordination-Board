-- ============================================================================
-- M-VIS — Company-wide READ-ONLY job visibility  (INSTRUCTIONS.md M-VIS; AGENTS.md §9)
--
-- Standing architecture (owner-confirmed): EVERY member (owner AND every salesman)
-- can SELECT ALL jobs + phases in their org. Each member still CREATES/EDITS only
-- their OWN jobs; the owner edits all.
--
-- This SPLITS read from write (§5: read and write are always SEPARATE policies):
-- we ADD dedicated SELECT policies for org-wide read, ON TOP OF the existing write
-- policies — it does NOT widen any write path. RLS policies are permissive (OR'd
-- within a command), so:
--   * SELECT is allowed if ANY policy passes  -> new policy grants read to all members
--   * UPDATE/DELETE/INSERT only via the existing for-all policies whose USING/CHECK
--     is owner-or-owns -> writes stay restricted to the owner or the job's salesman.
--
-- participants stay RESTRICTED on purpose: a participant row holds a secret
-- `invite_token` (a crew sign-in credential). Exposing other salesmen's participant
-- rows org-wide would leak crew links. The read-only in-depth view (M-DASH) shows
-- phase assignee NAMES resolved server-side, never tokens. So participants RLS is
-- UNCHANGED here. (§5 invariant.)
--
-- Read vs write after this migration:
--   jobs    SELECT: any org member (is_org_member)       | write: owner OR owns the job  (existing)
--   phases  SELECT: member of the phase's job's org       | write: can_access_job          (existing)
--   participants:   UNCHANGED — owner or owning salesman only (secret invite_token)
--
-- VERIFY BEFORE APPLYING: run the RLS pre-flight (docs/RELEASE-CHECKLIST.md Step 2):
--   BEGIN;  <this migration>  supabase/tests/rls-mvis-smoke.sql  ROLLBACK;
-- APPLY-ORDER NOTE: deploy the M-DASH partition app-code BEFORE applying this in
-- prod, or salesmen briefly see all org jobs as editable. Idempotent.
-- ============================================================================

-- Read helper: is the caller an org member of the org that owns this job?
-- SECURITY DEFINER so it bypasses RLS on `jobs` (cannot recurse). Reuses the
-- existing is_org_member helper. STABLE, self-scoped to auth.uid() via that helper.
create or replace function public.can_read_job(p_job_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id and public.is_org_member(j.org_id)
  );
$$;

grant execute on function public.can_read_job(uuid) to authenticated;

-- ---------- jobs: members read ALL org jobs (write policies UNCHANGED) ----------
drop policy if exists "members read all org jobs" on jobs;
create policy "members read all org jobs"
  on jobs for select to authenticated
  using ( public.is_org_member(org_id) );

-- ---------- phases: members read ALL org phases (write policies UNCHANGED) ----------
drop policy if exists "members read all org phases" on phases;
create policy "members read all org phases"
  on phases for select to authenticated
  using ( public.can_read_job(job_id) );

-- ---------- participants: INTENTIONALLY UNCHANGED ----------
-- Do NOT add an org-wide SELECT here. The existing "access participants via owned
-- job" (can_access_job) policy stays, so only the owner or the OWNING salesman can
-- read a crew row + its secret invite_token. M-DASH resolves assignee names
-- server-side instead of exposing participant rows.
