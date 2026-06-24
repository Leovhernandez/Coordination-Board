-- ============================================================================
-- Per-org salesman seat cap (M14 access model). Default 15 (the Base tier). The
-- admin can raise/lower it per business later. Caps how many salesmen one owner
-- can invite — the revenue-protection lever against unlimited sub-users.
-- Idempotent.
-- ============================================================================
alter table organizations
  add column if not exists salesman_seat_limit int not null default 15;
