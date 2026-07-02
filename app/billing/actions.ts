"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateOrg } from "@/lib/auth";
import { getStripe, isPlan, priceIdForPlan, promoPriceId } from "@/lib/stripe";

function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

/**
 * Starts a Stripe Checkout subscription for the chosen tier and redirects the
 * owner to it (N2). A promo-eligible org subscribing to Base checks out at the
 * promo price instead; the webhook then attaches the Subscription Schedule that
 * flips it to Base $49 after 3 months (Stripe changes the price, not us).
 */
export async function startCheckout(plan: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const org = await getOrCreateOrg();
  if (!org) redirect("/login");

  if (!isPlan(plan)) redirect("/billing?error=1");
  let price = priceIdForPlan(plan);
  if (plan === "base" && org.promo_eligible && promoPriceId()) {
    price = promoPriceId();
  }
  if (!price) redirect("/billing?error=1"); // tier not configured in env

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    customer: org.stripe_customer_id ?? undefined,
    customer_email: org.stripe_customer_id ? undefined : (user.email ?? undefined),
    success_url: `${siteUrl()}/dashboard?subscribed=1`,
    cancel_url: `${siteUrl()}/billing`,
    metadata: { org_id: org.id },
    subscription_data: { metadata: { org_id: org.id } },
  });

  if (session.url) redirect(session.url);
  redirect("/billing?error=1");
}

/** Opens the Stripe customer portal to manage/cancel the subscription. */
export async function openBillingPortal() {
  const org = await getOrCreateOrg();
  if (!org?.stripe_customer_id) redirect("/billing");

  const stripe = getStripe();
  const session = await stripe.billingPortal.sessions.create({
    customer: org.stripe_customer_id,
    return_url: `${siteUrl()}/billing`,
  });
  redirect(session.url);
}
