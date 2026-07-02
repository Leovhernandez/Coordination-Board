import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import {
  getStripe,
  mapStripeStatus,
  planForPriceId,
  promoPriceId,
  schedulePromoToBase,
} from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";
import { sendCancellationNotice } from "@/lib/invites";

// Stripe webhook: the source of truth for subscription_status. Verifies the
// signature, then updates the org via the service-role client (this route is
// not an authenticated owner session).
export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!secret || !signature) {
    return new NextResponse("Webhook not configured", { status: 400 });
  }

  const body = await request.text(); // raw body required for signature check
  const stripe = getStripe();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return new NextResponse(`Webhook Error: ${message}`, { status: 400 });
  }

  const supabase = createServiceClient();

  // Update subscription_status and manage the cancel-retention clock:
  //  - a non-canceled status (active/trialing/past_due) CLEARS canceled_at — a
  //    reactivation stops any pending purge.
  //  - "canceled" sets the status, then stamps canceled_at exactly ONCE (only
  //    when currently null, so a duplicate Stripe event never extends the 30-day
  //    clock). When we actually stamp it — the first cancel transition — we email
  //    the owner the 30-day export notice.
  async function applyStatus(
    col: "id" | "stripe_customer_id",
    value: string | null | undefined,
    status: string,
    extra: Record<string, unknown> = {},
  ) {
    if (!value) return;
    if (status !== "canceled") {
      await supabase
        .from("organizations")
        .update({ subscription_status: status, canceled_at: null, ...extra })
        .eq(col, value);
      return;
    }
    await supabase
      .from("organizations")
      .update({ subscription_status: "canceled" })
      .eq(col, value);
    const now = new Date();
    const { data: stamped } = await supabase
      .from("organizations")
      .update({ canceled_at: now.toISOString() })
      .eq(col, value)
      .is("canceled_at", null)
      .select("owner_email, name");
    const row = (stamped ?? [])[0] as
      | { owner_email: string | null; name: string }
      | undefined;
    if (row?.owner_email) {
      await sendCancellationNotice(row.owner_email, row.name, now).catch(
        () => {},
      );
    }
  }

  const setStatusByOrg = (
    orgId: string | undefined,
    status: string,
    extra: Record<string, unknown> = {},
  ) => applyStatus("id", orgId, status, extra);
  const setStatusByCustomer = (
    customer: string | null,
    status: string,
    extra: Record<string, unknown> = {},
  ) => applyStatus("stripe_customer_id", customer, status, extra);

  // N2: the stored plan follows the subscription's price (promo + legacy single
  // price map to base; an unknown price leaves the stored plan untouched).
  function planPatch(sub: Stripe.Subscription): Record<string, unknown> {
    const plan = planForPriceId(sub.items?.data?.[0]?.price?.id);
    return plan ? { plan } : {};
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.org_id;
      const customer =
        typeof session.customer === "string" ? session.customer : null;
      if (orgId) {
        // N2: derive the plan from the subscribed price, and if this is a promo
        // checkout, attach the promo→Base schedule + record when the promo ends.
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : (session.subscription?.id ?? null);
        const extra: Record<string, unknown> = {};
        if (subId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subId);
            Object.assign(extra, planPatch(sub));
            if (sub.items?.data?.[0]?.price?.id === promoPriceId()) {
              const promoEnd = await schedulePromoToBase(subId);
              if (promoEnd) extra.promo_ends_at = promoEnd.toISOString();
            }
          } catch (err) {
            // Plan/schedule sync is best-effort here; subscription.updated will
            // re-sync the plan, and the admin can retrofit the schedule.
            console.error("[webhook] promo/plan sync failed:", err);
          }
        }
        await supabase
          .from("organizations")
          .update({
            stripe_customer_id: customer,
            subscription_status: "active",
            canceled_at: null, // re-subscribe stops any pending purge
            ...extra,
          })
          .eq("id", orgId);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const status = mapStripeStatus(sub.status);
      const orgId = sub.metadata?.org_id;
      const extra = planPatch(sub);
      if (orgId) await setStatusByOrg(orgId, status, extra);
      else
        await setStatusByCustomer(
          typeof sub.customer === "string" ? sub.customer : null,
          status,
          extra,
        );
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const orgId = sub.metadata?.org_id;
      if (orgId) await setStatusByOrg(orgId, "canceled");
      else
        await setStatusByCustomer(
          typeof sub.customer === "string" ? sub.customer : null,
          "canceled",
        );
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice & {
        customer: string | { id: string } | null;
      };
      await setStatusByCustomer(
        typeof invoice.customer === "string" ? invoice.customer : null,
        "past_due",
      );
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
