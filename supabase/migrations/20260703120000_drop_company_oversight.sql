-- Drop company_oversight: the M8.5 read-only oversight roll-up was removed
-- end-to-end in 7b4111e (superseded by multi-seat orgs — the owner reads every
-- salesman's jobs via org membership), which left the table "droppable later".
-- Its 2 rows were the owner's own June-22 test pairings. No app code, RLS
-- policy, or realtime publication references it (verified 2026-07-03).
-- The other M8.5 additions (organizations.owner_email, trial_ends_at) are
-- still in use and are NOT touched.
drop table if exists company_oversight;
