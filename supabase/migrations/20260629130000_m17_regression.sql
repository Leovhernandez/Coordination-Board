-- ============================================================================
-- M17 regression fixes (INSTRUCTIONS.md Phase 0.5: R1 + R2)
--
-- R1 — Crew note DELETE didn't live-refresh the member board. `notes` is in the
-- supabase_realtime publication but was at Postgres' DEFAULT replica identity, so
-- a DELETE event's old row carries ONLY the primary key — not job_id. The member
-- board's postgres_changes filter `job_id=eq.<id>` (and RLS `can_read_job(job_id)`)
-- then can't match, so the DELETE event is dropped and the note lingers until the
-- next phase event re-fetches. REPLICA IDENTITY FULL makes DELETE carry all
-- columns (incl. job_id) so the filter matches and delivery is authorized.
--
-- R2 — Owner could ADD/edit notes on a salesman's job; the team roll-up is
-- read-only (ROADMAP §4 / AGENTS §9: "owner reads but never edits a salesman's
-- job"). Decision A: every member is read-only on jobs they don't own, owner
-- included. The UI now sets canEdit accordingly; this tightens the data layer to
-- match — the notes INSERT policy uses a new can_edit_job() that drops the blanket
-- owner-override (is_org_owner on EVERY job) and instead grants write only to the
-- job's owning salesman, or the owner on a legacy null-salesman job. Read stays
-- org-wide (can_read_job); UPDATE/DELETE stay author-only (owns_member).
--
-- VERIFY BEFORE APPLYING — RLS pre-flight (docs/RELEASE-CHECKLIST.md Step 2),
-- pasting both files in ONE run so nothing persists:
--   BEGIN;  <this migration>  supabase/tests/rls-m17-notes-smoke.sql  ROLLBACK;
-- Idempotent.
-- ============================================================================

-- ---------- R1: DELETE events must carry job_id for filter + RLS delivery ----------
alter table notes replica identity full;

-- ---------- R2: "can edit this job" — owning salesman, or owner of a null job ----------
-- SECURITY DEFINER (bypasses RLS on jobs → no recursion), STABLE, self-scoped via
-- the helpers it calls. Distinct from can_access_job(), which keeps the blanket
-- owner-override used by phases/jobs writes; notes deliberately do NOT grant that.
create or replace function public.can_edit_job(p_job_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.jobs j
    where j.id = p_job_id
      and (
        public.owns_member(j.salesman_member_id)
        or (public.is_org_owner(j.org_id) and j.salesman_member_id is null)
      )
  );
$$;

grant execute on function public.can_edit_job(uuid) to authenticated;

-- Re-create the notes INSERT policy to use can_edit_job (was can_access_job).
drop policy if exists "member adds own note" on notes;
create policy "member adds own note"
  on notes for insert to authenticated
  with check (
    public.owns_member(author_member_id)
    and public.can_edit_job(job_id)
  );
