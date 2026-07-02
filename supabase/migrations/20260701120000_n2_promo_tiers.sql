-- N2: tiered pricing + promo→Base transition.
--
-- `organizations.plan` (base|pro|enterprise) already exists (M22) and is now
-- synced from the Stripe subscription's price by the webhook. This migration adds
-- the two promo fields:
--   - promo_eligible: admin-set gate ("Trinity + one more only") — when true, a
--     Base checkout uses the $20/mo promo price and the webhook attaches a
--     Subscription Schedule that auto-flips to Base $49 after 3 months.
--   - promo_ends_at: when the promo phase ends (schedule phase-1 end), synced by
--     the webhook / admin retrofit. Drives the dated "promo ending" banner; a
--     past date simply hides the banner.
--
-- No realtime publication change: these are owner-side billing/config fields
-- (same precedent as collect_payment_method / subscription_status — an owner
-- config change, not live coordination data another session watches).

alter table public.organizations
  add column if not exists promo_eligible boolean not null default false,
  add column if not exists promo_ends_at timestamptz;

comment on column public.organizations.promo_eligible is
  'N2: admin-set. When true, a Base checkout uses the promo price ($20/mo x 3 months via a Stripe Subscription Schedule that then flips to Base). Limited to Trinity + one more; default false.';
comment on column public.organizations.promo_ends_at is
  'N2: when the promo phase ends (Stripe schedule phase-1 end). Set by the webhook on promo checkout or by the admin retrofit. Future date = show the dated promo-ending banner.';
