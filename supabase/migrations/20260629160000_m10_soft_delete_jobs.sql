-- ============================================================================
-- M10 — Soft-delete + restore + purge (jobs)  (INSTRUCTIONS.md M10; promoted from
-- M17 R3 "jobs archive but can't delete"). Adds a `deleted_at` so a job can move to
-- a TRASH state (hidden from active/archived lists, restorable) and later be PURGED
-- (hard DELETE, cascading to phases/notes/participants/activity_log via the existing
-- ON DELETE CASCADE FKs — the hook M22 will extend to free a job's R2 photos).
--
-- NO RLS CHANGES — and that is deliberate, not an omission:
--   * The jobs write policies already permit UPDATE/DELETE for the owner
--     (is_org_owner) and the owning salesman (owns_member) — see
--     20260624130000. M17 R3's "can't delete" was a MISSING APP FEATURE, not an
--     RLS block. Soft-delete/restore are ordinary UPDATEs of deleted_at; purge is a
--     DELETE; both are already governed by those policies.
--   * RLS therefore already denies a NON-owning, non-owner salesman (0 rows) and
--     any cross-org actor. The R2 boundary (owner is READ-ONLY on a salesman's job)
--     stays APP-enforced — deleteJob/restoreJob/purgeJob mirror archiveJob's canEdit
--     gating, exactly as archive/rename already do (the jobs write RLS keeps the
--     blanket owner-override; only notes tightened it via can_edit_job in M17 R2).
--     purgeJob additionally re-checks canEdit server-side because it's irreversible.
--
-- REALTIME: jobs is published (20260624140000) at Postgres' DEFAULT replica
-- identity. Set REPLICA IDENTITY FULL so a PURGE (DELETE) event's old row carries
-- org_id — otherwise the dashboard's RLS-scoped jobs subscription (using is_org_member
-- on the OLD row) can't authorize delivery, and a purged job lingers on other
-- members' dashboards until the next refresh (the M17 R1 lesson, applied to DELETE).
-- Soft-delete is an UPDATE whose NEW row already carries org_id, so it live-refreshes
-- without this — but FULL is correct for both and harmless at jobs' low volume.
--
-- VERIFY BEFORE APPLYING — pre-flight (docs/RELEASE-CHECKLIST.md Step 2), pasting
-- both files in ONE run so nothing persists:
--   BEGIN;  <this migration>  supabase/tests/rls-m10-soft-delete-smoke.sql  ROLLBACK;
-- Idempotent. Schema-only (no policy/grant change).
-- ============================================================================

alter table jobs add column if not exists deleted_at timestamptz;

-- Supports the Trash listing (deleted_at is not null) and keeps the active/archived
-- listings (deleted_at is null) cheap within an org.
create index if not exists jobs_org_deleted_idx on jobs (org_id, deleted_at);

-- DELETE events must carry org_id for the dashboard's RLS-scoped jobs subscription.
alter table jobs replica identity full;
