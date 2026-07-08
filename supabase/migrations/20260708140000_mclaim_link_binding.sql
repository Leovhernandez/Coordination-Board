-- ============================================================================
-- M-CLAIM — crew-link device binding (owner-confirmed 2026-07-08)
--
-- WHY. The crew invite link is a bearer credential the issuing member also
-- possesses, so an owner/salesman could open it in a private window and act AS
-- the crew member — an attribution/transparency hole (History would credit the
-- crew). Mitigation: the FIRST device to open the link CLAIMS it. The enter
-- route mints a random device secret, stores only its sha-256 hash here, and
-- sets the secret in an httpOnly cookie on that device. Any other device
-- presenting the raw URL is fully blocked ("link already in use" — no board,
-- no writes; notes hold gate codes, so reads are bound too). Cookie loss / a
-- new phone is recovered by the owning member's "Reset link" (new token, claim
-- cleared, same participant row). Claims and resets are logged to the
-- append-only M18 activity log — members are SELECT-only there, so the trail
-- cannot be scrubbed, which is what makes impersonation attempts LOUD:
-- a claim that predates the crew ever receiving the text is self-evident.
--
-- Platform-admin test bypass (app layer): a session signed in as ADMIN_EMAIL
-- may open any crew link WITHOUT claiming it (never burns the crew's first
-- open); its actions log an {"adminTest": true} detail marker. Scoped to the
-- operator env var — NOT org owners, or the hole reopens.
--
-- Storage: only the HASH lives in the DB. participants RLS is unchanged
-- (owner + owning salesman read the row), and a hash is useless without the
-- device cookie's secret. participants is already published + REPLICA IDENTITY
-- FULL, so the Crew panel's claim pill live-refreshes for free (§6).
--
-- VERIFY BEFORE APPLYING — test-first (docs/RELEASE-CHECKLIST.md Step 2):
--   BEGIN;  <this migration>  <smoke asserts>  ROLLBACK;
-- Idempotent where practical.
-- ============================================================================

-- ---------- Claim state on the participant (link) row ----------
alter table participants
  add column if not exists claim_secret_hash text,
  add column if not exists claimed_at timestamptz;

-- ---------- New activity event types: link_claimed / link_reset ----------
-- The M18 CHECK was inline/unnamed → Postgres auto-named it. Recreate it with
-- the two new types (idempotent: drop-if-exists then add).
alter table activity_log
  drop constraint if exists activity_log_event_type_check;
alter table activity_log
  add constraint activity_log_event_type_check check (event_type in (
    'status_change', 'label_change', 'assignment_change',
    'phase_added', 'phase_deleted',
    'note_added', 'note_edited', 'note_deleted',
    'link_claimed', 'link_reset'
  ));
