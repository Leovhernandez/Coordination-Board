/**
 * The `organizations` columns loaded into `ctx.org` (SessionContext) — the SINGLE
 * source of truth, imported by BOTH the owner path (`getOrCreateOrg`, lib/auth.ts)
 * and the salesman path (`contextFor`, lib/membership.ts) so the two can never
 * drift. Keep in sync with the `Organization` type in lib/types.ts.
 *
 * (Why this exists: a duplicated copy in lib/auth.ts + lib/membership.ts drifted —
 * auth.ts's copy was missing plan/storage_cap_bytes/canceled_at/collect_payment_method,
 * so the owner's ctx.org silently lacked those fields. That made M21's payment
 * method invisible to the owner and stuck the Team-page toggle. One list fixes it.)
 */
export const ORG_COLUMNS =
  "id, name, owner_user_id, owner_email, subscription_status, canceled_at, stripe_customer_id, trial_ends_at, salesman_seat_limit, plan, storage_cap_bytes, collect_payment_method, promo_eligible, promo_ends_at, max_assignees_per_phase";
