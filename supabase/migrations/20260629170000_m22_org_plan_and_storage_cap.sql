-- ============================================================================
-- M22 (part 1) — Org plan + storage cap  (INSTRUCTIONS.md §0 capability flag; AGENTS §9)
--
-- M22 photos are a BASE+PRO feature gated by a STORAGE CAP (owner-confirmed
-- 2026-06-29: the cap is the upsell, not the feature). There was NO tier/plan
-- column before this — `organizations` carried only subscription_status + the
-- salesman_seat_limit, and billing uses a single Stripe price. This adds the
-- minimal capability foundation, additively:
--   * plan: the tier an org is on. DEFAULT 'base' so every existing AND new org
--     gets photos at the Base cap with no backfill. 'pro' = higher cap, set via
--     SQL/connector for now (Stripe price->plan wiring is deferred to a billing
--     milestone). NEVER gate by a hardcoded company name (INSTRUCTIONS §0).
--   * storage_cap_bytes: an OPTIONAL per-org override. NULL = derive the cap from
--     `plan` in app code (lib/capabilities.ts: base 10 GB, pro 100 GB). A real
--     column, not a guess, so a one-off cap can be granted without a code change.
--
-- No grandfather/override is needed for any current customer: Trinity is on Base
-- and gets photos at the Base cap (AGENTS §9 / memory). This is PURELY ADDITIVE
-- (one defaulted column + one nullable column, two CHECKs); NO grant/RLS/policy
-- change, so it touches no read/write path and needs no policy smoke — only the
-- column + constraint pre-flight below.
--
-- VERIFY BEFORE APPLYING — pre-flight wrapped so nothing persists (no separate
-- RLS smoke: this migration changes no policy):
--   BEGIN;  <this migration>  <assert default 'base' + CHECK rejects bad plan>  ROLLBACK;
-- Idempotent (add column if not exists; drop+recreate constraints).
-- ============================================================================

alter table organizations
  add column if not exists plan text not null default 'base';

alter table organizations
  add column if not exists storage_cap_bytes bigint;

-- Constrain plan to the known tiers (drop+recreate so a re-run stays idempotent).
alter table organizations drop constraint if exists organizations_plan_check;
alter table organizations
  add constraint organizations_plan_check check (plan in ('base', 'pro', 'enterprise'));

-- A cap OVERRIDE, when set, must be positive (NULL = derive from plan in app code).
alter table organizations drop constraint if exists organizations_storage_cap_positive;
alter table organizations
  add constraint organizations_storage_cap_positive
  check (storage_cap_bytes is null or storage_cap_bytes > 0);
