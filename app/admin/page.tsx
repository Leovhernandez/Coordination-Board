import Link from "next/link";
import { requireAdmin, isAdminEmail } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  addAllowedEmail,
  addSalesmanToOrg,
  deleteAccount,
  removeAllowedEmail,
  schedulePromoTransition,
  setOrgStatus,
  setPromoEligible,
  setTrialDays,
} from "./actions";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

export const dynamic = "force-dynamic";

function daysLeft(trialEndsAt: string | null): number | null {
  if (!trialEndsAt) return null;
  return Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86400000);
}

const inputCls =
  "min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900";
const chipBtn =
  "rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 active:bg-slate-100";

export default async function AdminPage() {
  await requireAdmin();
  const t = await getDictionary();
  const svc = createServiceClient();

  const { data: orgsData } = await svc
    .from("organizations")
    .select(
      "id, name, owner_email, subscription_status, trial_ends_at, plan, promo_eligible, promo_ends_at, stripe_customer_id",
    )
    .order("created_at", { ascending: true });
  const orgs = orgsData ?? [];

  const { data: allowedData } = await svc
    .from("allowed_emails")
    .select("email")
    .order("email");
  const allowed = allowedData ?? [];

  // An account may invite salesmen only if it's an approved business owner — the
  // admin, or an email on the Owner List below. This mirrors the live owner gate
  // (lib/access.ts), so a salesman/legacy account in the list shows no
  // add-salesman form, and adding an email to the Owner List grants it on refresh.
  const ownerEmails = new Set(allowed.map((a) => a.email.toLowerCase()));
  const isOwnerAccount = (email: string | null) =>
    !!email && (isAdminEmail(email) || ownerEmails.has(email.toLowerCase()));

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {t.nav.admin}
        </h1>
        <Link href="/dashboard" className={chipBtn}>
          {t.admin.back}
        </Link>
      </header>

      {/* Accounts + trials */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-900">
          {interpolate(t.admin.accounts, { n: orgs.length })}
        </h2>
        {orgs.map((o) => {
          const dl = daysLeft(o.trial_ends_at);
          return (
            <div
              key={o.id}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-slate-900">
                  {o.owner_email ?? o.name}
                </span>
                <span className="shrink-0 text-xs font-medium text-slate-500">
                  {o.plan} · {o.subscription_status}
                  {o.subscription_status === "trialing" && dl !== null
                    ? " " + interpolate(t.admin.daysLeft, { d: dl })
                    : ""}
                </span>
              </div>
              {o.promo_ends_at && (
                <p className="mt-1 text-xs text-slate-500">
                  {interpolate(t.admin.promoEnds, {
                    date: new Date(o.promo_ends_at).toLocaleDateString(),
                  })}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={setPromoEligible.bind(null, o.id, !o.promo_eligible)}>
                  <button
                    className={
                      o.promo_eligible
                        ? "rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                        : chipBtn
                    }
                  >
                    {o.promo_eligible ? t.admin.promoOn : t.admin.promoOff}
                  </button>
                </form>
                {o.promo_eligible && o.stripe_customer_id && !o.promo_ends_at && (
                  <form action={schedulePromoTransition.bind(null, o.id)}>
                    <ConfirmSubmit
                      message={interpolate(t.admin.promoScheduleConfirm, {
                        who: o.owner_email ?? o.name,
                      })}
                      className={chipBtn}
                    >
                      {t.admin.promoSchedule}
                    </ConfirmSubmit>
                  </form>
                )}
                <form action={setTrialDays.bind(null, o.id, 14)}>
                  <button className={chipBtn}>{t.admin.trial14}</button>
                </form>
                <form action={setOrgStatus.bind(null, o.id, "active")}>
                  <button className={chipBtn}>{t.admin.comp}</button>
                </form>
                <form action={setTrialDays.bind(null, o.id, 0)}>
                  <button className={chipBtn}>{t.admin.endTrial}</button>
                </form>
                <form action={setOrgStatus.bind(null, o.id, "canceled")}>
                  <button className={chipBtn}>{t.admin.cancel}</button>
                </form>
                <form action={deleteAccount.bind(null, o.id)}>
                  <ConfirmSubmit
                    message={interpolate(t.admin.deleteConfirm, {
                      who: o.owner_email ?? o.name,
                    })}
                    className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 active:bg-red-50"
                  >
                    {t.admin.delete}
                  </ConfirmSubmit>
                </form>
              </div>
              {isOwnerAccount(o.owner_email) && (
                <form
                  action={addSalesmanToOrg.bind(null, o.id)}
                  className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2"
                >
                  <input
                    name="name"
                    placeholder={t.admin.salesmanName}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900"
                  />
                  <input
                    name="email"
                    type="email"
                    placeholder={t.admin.salesmanEmail}
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900"
                  />
                  <button className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white">
                    {t.admin.addSalesman}
                  </button>
                </form>
              )}
            </div>
          );
        })}
      </section>

      {/* Owner List */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          {interpolate(t.admin.ownerList, { n: allowed.length })}
        </h2>
        <p className="text-xs text-slate-500">{t.admin.ownerListDesc}</p>
        {allowed.map((a) => (
          <div
            key={a.email}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <span className="truncate">{a.email}</span>
            <form action={removeAllowedEmail.bind(null, a.email)}>
              <button className="text-xs font-medium text-red-600">
                {t.admin.remove}
              </button>
            </form>
          </div>
        ))}
        <form action={addAllowedEmail} className="flex gap-2">
          <input name="email" type="email" placeholder={t.admin.ownerEmailPlaceholder} className={inputCls} />
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            {t.admin.add}
          </button>
        </form>
      </section>
    </main>
  );
}
