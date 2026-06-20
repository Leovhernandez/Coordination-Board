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
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
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
