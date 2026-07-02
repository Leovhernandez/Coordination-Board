import "server-only";
import Stripe from "stripe";

// Lazy Stripe client (server-only). Not constructed until used, so the app
// still builds/runs with billing unconfigured (the Four L pilot is never
// blocked — new orgs default to 'trialing').

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
    client = new Stripe(key);
  }
  return client;
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      (process.env.STRIPE_PRICE_BASE || process.env.STRIPE_PRICE_ID),
  );
}

// --- N2: tiered prices + promo ---------------------------------------------
//
// One recurring monthly price per tier, read from env (owner configures them in
// the Stripe dashboard). STRIPE_PRICE_ID is the legacy single price and is kept
// as the Base fallback so billing never breaks mid-rollout. The promo price
// ($20/mo) is a second price on the Base product, used only as phase 1 of a
// Subscription Schedule that flips to Base automatically.

export const PLANS = ["base", "pro", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];

export function isPlan(v: string): v is Plan {
  return (PLANS as readonly string[]).includes(v);
}

/** The checkout price for a tier, or null if that tier isn't configured. */
export function priceIdForPlan(plan: Plan): string | null {
  switch (plan) {
    case "base":
      return process.env.STRIPE_PRICE_BASE || process.env.STRIPE_PRICE_ID || null;
    case "pro":
      return process.env.STRIPE_PRICE_PRO || null;
    case "enterprise":
      return process.env.STRIPE_PRICE_ENTERPRISE || null;
  }
}

export function promoPriceId(): string | null {
  return process.env.STRIPE_PRICE_PROMO || null;
}

/**
 * Map a subscription's price back to our stored plan. The promo price and the
 * legacy single price are both Base. Unknown price → null (leave the stored plan
 * unchanged rather than clobbering an admin-set value).
 */
export function planForPriceId(priceId: string | null | undefined): Plan | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE) return "enterprise";
  if (
    priceId === process.env.STRIPE_PRICE_BASE ||
    priceId === process.env.STRIPE_PRICE_PROMO ||
    priceId === process.env.STRIPE_PRICE_ID
  ) {
    return "base";
  }
  return null;
}

/** start + n calendar months (UTC), for the promo phase end. */
export function addMonthsUtc(unixSeconds: number, months: number): Date {
  const d = new Date(unixSeconds * 1000);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

export const PROMO_MONTHS = 3;

/**
 * Attach a Subscription Schedule to an active promo subscription so Stripe
 * itself flips the price to Base when the promo ends (N2 — no hand-rolled
 * mid-subscription price change). Phase 1 = promo price until
 * (subscription start + 3 months); phase 2 = Base for one cycle, then
 * end_behavior "release" lets the subscription continue at Base indefinitely.
 *
 * Idempotent: if the subscription already has a schedule, returns that
 * schedule's phase-1 end instead of creating another (webhook deliveries can
 * repeat). Returns the promo end date, or null if not applicable (no promo/Base
 * price configured, or the subscription isn't on the promo price).
 */
export async function schedulePromoToBase(
  subscriptionId: string,
): Promise<Date | null> {
  const stripe = getStripe();
  const promo = promoPriceId();
  const basePrice = priceIdForPlan("base");
  if (!promo || !basePrice) return null;

  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const itemPrice = sub.items.data[0]?.price?.id;
  if (itemPrice !== promo) return null; // not a promo subscription

  // Already scheduled (retry / retrofit re-click): report the existing end.
  if (sub.schedule) {
    const existingId =
      typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id;
    const existing = await stripe.subscriptionSchedules.retrieve(existingId);
    const end = existing.phases[0]?.end_date;
    return end ? new Date(end * 1000) : null;
  }

  // from_subscription: one phase covering the current billing period. We then
  // re-pass phase 0 (required: updates must include ALL phases) stretched to the
  // full promo window, plus the Base phase.
  const schedule = await stripe.subscriptionSchedules.create({
    from_subscription: subscriptionId,
  });
  const phase0 = schedule.phases[0];
  const phase0Start = phase0.start_date;
  // Promo ends 3 months after the ORIGINAL subscription start (honors a
  // retrofit: an already-running promo counts its elapsed months). Never before
  // the current period's end — a phase can't end in the past.
  const target = Math.floor(addMonthsUtc(sub.start_date, PROMO_MONTHS).getTime() / 1000);
  const promoEnd = Math.max(target, phase0.end_date ?? target);

  await stripe.subscriptionSchedules.update(schedule.id, {
    end_behavior: "release",
    phases: [
      {
        items: [{ price: promo, quantity: 1 }],
        start_date: phase0Start,
        end_date: promoEnd,
      },
      {
        items: [{ price: basePrice, quantity: 1 }],
        // One Base cycle, then end_behavior "release" hands the subscription
        // back to run at Base indefinitely. (This SDK/API version uses
        // `duration`, not the older `iterations`.)
        duration: { interval: "month", interval_count: 1 },
      },
    ],
  });

  return new Date(promoEnd * 1000);
}

// Statuses that grant access (job creation). Trial and active both allowed.
export const ACTIVE_STATUSES = ["trialing", "active"] as const;

export function isSubscriptionActive(status: string): boolean {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

/**
 * Whether an org may use the app (create jobs). Active = always; trialing is
 * allowed only until trial_ends_at (null = unlimited, e.g. comped/admin).
 * Hard enforcement: an expired trial is blocked without manual follow-up.
 */
export function isAccessAllowed(
  status: string,
  trialEndsAt: string | null,
): boolean {
  if (status === "active") return true;
  if (status === "trialing") {
    return !trialEndsAt || new Date(trialEndsAt).getTime() > Date.now();
  }
  return false;
}

/** Maps a Stripe subscription status to our stored subscription_status. */
export function mapStripeStatus(status: Stripe.Subscription.Status): string {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    default:
      // canceled, incomplete_expired, incomplete, paused, etc.
      return "canceled";
  }
}
