-- Cancel-retention: track when an org's subscription was canceled so the
-- purge-canceled cron can free R2 media + hard-delete the org 30 days later.
--
-- On Stripe customer.subscription.deleted the webhook stamps canceled_at once
-- (idempotent: only when currently null, so duplicate events don't extend the
-- clock). Any non-canceled status (reactivation) clears it back to null.
--
-- No realtime publication / REPLICA IDENTITY change: canceled_at drives a
-- backend cron only; it is never a live-refreshed surface (AGENTS §6 N/A here).

alter table public.organizations
  add column if not exists canceled_at timestamptz;

comment on column public.organizations.canceled_at is
  'When the Stripe subscription was canceled (customer.subscription.deleted). Starts the 30-day export-retention clock; the purge-canceled cron erases the org 30 days after this. Cleared on reactivation. Null = not canceled.';
