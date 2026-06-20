import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateOrg } from "@/lib/auth";
import { isStripeConfigured, isAccessAllowed } from "@/lib/stripe";
import { startCheckout, openBillingPortal } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, string> = {
  trialing: "You're on a free trial.",
  active: "Your subscription is active.",
  past_due: "Your last payment failed — update your card to keep access.",
  canceled: "Your subscription is canceled.",
};

export default async function BillingPage() {
  const org = await getOrCreateOrg();
  if (!org) redirect("/login");

  const active = isAccessAllowed(org.subscription_status, org.trial_ends_at);
  const planLabel = process.env.NEXT_PUBLIC_PLAN_LABEL ?? "Monthly plan";

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 p-4">
      <header>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 shadow-sm active:bg-slate-100"
        >
          ← Dashboard
        </Link>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
          Billing
        </h1>
      </header>

      <div
        className={`rounded-xl border p-4 text-sm font-medium ${
          active
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {STATUS_COPY[org.subscription_status] ??
          `Status: ${org.subscription_status}`}
      </div>

      {!isStripeConfigured() ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          Billing isn&apos;t set up yet. You can keep using the app during the
          trial.
        </p>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">{planLabel}</h2>
          <p className="mt-1 text-sm text-slate-500">
            Owner-only — subcontractors never see billing.
          </p>

          {org.stripe_customer_id ? (
            <form action={openBillingPortal} className="mt-3">
              <button className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white active:bg-slate-700">
                Manage billing
              </button>
            </form>
          ) : (
            <form action={startCheckout} className="mt-3">
              <button className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white active:bg-slate-700">
                Subscribe
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
