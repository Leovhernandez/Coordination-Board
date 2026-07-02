import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/membership";
import {
  isStripeConfigured,
  isAccessAllowed,
  priceIdForPlan,
  promoPriceId,
  type Plan,
} from "@/lib/stripe";
import { getDictionary, getLang } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import { startCheckout, openBillingPortal } from "./actions";

export const dynamic = "force-dynamic";

export default async function BillingPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.isOwner) redirect("/dashboard"); // billing is owner-only (salesmen never see it)
  const { org } = ctx;
  const t = await getDictionary();
  const lang = await getLang();

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

  // N2: dated promo banner while the $20×3mo promo is running.
  const promoActive =
    org.promo_ends_at && new Date(org.promo_ends_at).getTime() > Date.now();
  const promoDate = promoActive
    ? new Date(org.promo_ends_at!).toLocaleDateString(
        lang === "es" ? "es-ES" : "en-US",
        { year: "numeric", month: "long", day: "numeric" },
      )
    : "";

  // N2: one card per configured tier (a tier missing its env price is hidden).
  const tiers = (["base", "pro", "enterprise"] as Plan[]).filter((p) =>
    priceIdForPlan(p),
  );
  const tierName: Record<Plan, string> = {
    base: t.billing.tierBase,
    pro: t.billing.tierPro,
    enterprise: t.billing.tierEnterprise,
  };
  const tierPrice: Record<Plan, string> = {
    base: t.billing.tierBasePrice,
    pro: t.billing.tierProPrice,
    enterprise: t.billing.tierEnterprisePrice,
  };
  const tierDesc: Record<Plan, string> = {
    base: t.billing.tierBaseDesc,
    pro: t.billing.tierProDesc,
    enterprise: t.billing.tierEnterpriseDesc,
  };

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

      {promoActive && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          {interpolate(t.billing.promoBanner, { date: promoDate })}
        </div>
      )}

      {!isStripeConfigured() ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          {t.billing.notConfigured}
        </p>
      ) : org.stripe_customer_id ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            {interpolate(t.billing.currentPlan, {
              plan: tierName[(org.plan as Plan) in tierName ? (org.plan as Plan) : "base"],
            })}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{t.billing.ownerOnly}</p>
          <form action={openBillingPortal} className="mt-3">
            <button className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white active:bg-slate-700">
              {t.billing.manage}
            </button>
          </form>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          {tiers.map((p) => (
            <div
              key={p}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-900">
                  {tierName[p]}
                </h2>
                <span className="shrink-0 text-sm font-semibold text-slate-900">
                  {tierPrice[p]}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">{tierDesc[p]}</p>
              {p === "base" && org.promo_eligible && promoPriceId() && (
                <p className="mt-1 text-sm font-medium text-emerald-700">
                  {t.billing.promoOffer}
                </p>
              )}
              <form action={startCheckout.bind(null, p)} className="mt-3">
                <button className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white active:bg-slate-700">
                  {t.billing.subscribe}
                </button>
              </form>
            </div>
          ))}
          <p className="text-xs text-slate-500">{t.billing.ownerOnly}</p>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          {t.billing.exportTitle}
        </h2>
        <p className="mt-1 text-sm text-slate-500">{t.billing.exportDesc}</p>
        <a
          href="/billing/export"
          className="mt-3 block w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-center text-base font-semibold text-slate-900 active:bg-slate-100"
        >
          {t.billing.exportButton}
        </a>
      </section>
    </main>
  );
}
