-- ============================================================================
-- M-MULTI cleanup (migration 2 of 2) — drop the legacy single-assignee column
-- (INSTRUCTIONS.md M-MULTI step 3; AGENTS.md §9)
--
-- The additive migration 20260708120000 introduced the phase_assignees junction
-- and kept phases.assignee_participant_id (+ a bridge trigger mirroring legacy
-- writes) for rollback safety. The milestone is now owner-validated on real
-- devices, and app code stopped reading/writing the column in M-MULTI (PR #12) —
-- a repo grep finds only a type field, a test fixture, and comments, no runtime
-- reference. Integrity was pre-verified before this drop: ZERO phases have a
-- non-null assignee_participant_id without a matching phase_assignees row, so the
-- junction fully supersedes the column and nothing is lost.
--
-- Drop order (dependencies first): the bridge trigger references the column, so
-- it and its function go before the column itself.
--
-- VERIFY BEFORE APPLYING — test-first (docs/RELEASE-CHECKLIST.md Step 2):
--   BEGIN;  <this migration>  <smoke>  ROLLBACK;
-- Idempotent (if exists / cascade-free explicit drops).
-- ============================================================================

-- 1) Bridge trigger + its function (only reason they existed was the column).
drop trigger if exists phases_mirror_legacy_assignee on phases;
drop function if exists public.mirror_legacy_phase_assignee();

-- 2) The legacy column. phase_assignees is now the sole source of assignment.
alter table phases drop column if exists assignee_participant_id;
