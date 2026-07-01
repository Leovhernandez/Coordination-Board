import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, mapStripeStatus } from "@/lib/stripe";
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
  ) {
    if (!value) return;
    if (status !== "canceled") {
      await supabase
        .from("organizations")
        .update({ subscription_status: status, canceled_at: null })
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

  const setStatusByOrg = (orgId: string | undefined, status: string) =>
    applyStatus("id", orgId, status);
  const setStatusByCustomer = (customer: string | null, status: string) =>
    applyStatus("stripe_customer_id", customer, status);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.org_id;
      const customer =
        typeof session.customer === "string" ? session.customer : null;
      if (orgId) {
        await supabase
          .from("organizations")
          .update({
            stripe_customer_id: customer,
            subscription_status: "active",
            canceled_at: null, // re-subscribe stops any pending purge
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
      if (orgId) await setStatusByOrg(orgId, status);
      else
        await setStatusByCustomer(
          typeof sub.customer === "string" ? sub.customer : null,
          status,
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
