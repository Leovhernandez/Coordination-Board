import { type NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, mapStripeStatus } from "@/lib/stripe";
import { createServiceClient } from "@/lib/supabase/service";

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

  async function setStatusByOrg(orgId: string | undefined, status: string) {
    if (!orgId) return;
    await supabase
      .from("organizations")
      .update({ subscription_status: status })
      .eq("id", orgId);
  }
  async function setStatusByCustomer(
    customer: string | null,
    status: string,
  ) {
    if (!customer) return;
    await supabase
      .from("organizations")
      .update({ subscription_status: status })
      .eq("stripe_customer_id", customer);
  }

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
