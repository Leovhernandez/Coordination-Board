import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/membership";
import { isStripeConfigured, isAccessAllowed } from "@/lib/stripe";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import { startCheckout, openBillingPortal } from "./actions";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.isOwner) redirect("/dashboard"); // billing is owner-only (salesmen never see it)
  const { org } = ctx;
  const t = await getDictionary();

  const statusCopy: Record<string, string> = {
    trialing: t.billing.trialing,
    active: t.billing.active,
    past_due: t.billing.pastDue,
    canceled: t.billing.canceled,
  };
  const statusMessage =
    statusCopy[org.subscription_status] ??
    interpolate(t.billing.statusFallback, { status: org.subscription_status });

  const active = isAccessAllowed(org.subscription_status, org.trial_ends_at);
  const planLabel = process.env.NEXT_PUBLIC_PLAN_LABEL ?? t.billing.planLabel;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 p-4">
      <header>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 shadow-sm active:bg-slate-100"
        >
          {t.billing.back}
        </Link>
        <h1 className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
          {t.nav.billing}
        </h1>
      </header>

      <div
        className={`rounded-xl border p-4 text-sm font-medium ${
          active
            ? "border-emerald-200 bg-emerald-50 text-emerald-900"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}
      >
        {statusMessage}
      </div>

      {!isStripeConfigured() ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          {t.billing.notConfigured}
        </p>
      ) : (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">{planLabel}</h2>
          <p className="mt-1 text-sm text-slate-500">{t.billing.ownerOnly}</p>

          {org.stripe_customer_id ? (
            <form action={openBillingPortal} className="mt-3">
              <button className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white active:bg-slate-700">
                {t.billing.manage}
              </button>
            </form>
          ) : (
            <form action={startCheckout} className="mt-3">
              <button className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white active:bg-slate-700">
                {t.billing.subscribe}
              </button>
            </form>
          )}
        </section>
      )}
    </main>
  );
}
