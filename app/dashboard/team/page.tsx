import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext, listMembers } from "@/lib/membership";
import { getDictionary } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import { inviteSalesman, removeSalesman } from "./actions";
import { PaymentMethodToggle } from "./PaymentMethodToggle";

export const dynamic = "force-dynamic";

/** Owner-only team management: invite salesmen by email, see who's joined. */
export default async function TeamPage() {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.isOwner) redirect("/dashboard"); // salesmen have no team screen
  const t = await getDictionary();

  const members = await listMembers(ctx.org.id);
  const salesmen = members.filter((m) => m.role === "salesman");
  const limit = ctx.org.salesman_seat_limit;
  const seatsFull = salesmen.length >= limit;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 p-4">
      <header>
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 shadow-sm active:bg-slate-100"
        >
          {t.team.back}
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
          {t.nav.team}
        </h1>
        <p className="text-sm text-slate-500">{t.team.description}</p>
      </header>

      {seatsFull ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
          {interpolate(t.team.seatsFull, { limit })}
        </div>
      ) : (
        <form
          action={inviteSalesman}
          className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            {t.team.nameLabel}
            <input
              name="name"
              required
              placeholder={t.team.namePlaceholder}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
            {t.team.emailLabel}
            <input
              name="email"
              type="email"
              required
              inputMode="email"
              autoComplete="off"
              placeholder={t.team.emailPlaceholder}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
          </label>
          <button className="mt-1 rounded-lg bg-slate-900 px-4 py-2.5 text-base font-semibold text-white active:bg-slate-700">
            {t.team.invite}
          </button>
        </form>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-slate-500">
          {interpolate(t.team.salesmenHeading, {
            n: salesmen.length,
            limit,
          })}
        </h2>
        {salesmen.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
            {t.team.empty}
          </p>
        )}
        {salesmen.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-900">{m.name}</p>
              <p className="truncate text-xs text-slate-500">{m.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  m.user_id
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {m.user_id ? t.team.joined : t.team.invited}
              </span>
              <form action={removeSalesman.bind(null, m.id)}>
                <button className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-500 active:bg-slate-100">
                  {t.team.remove}
                </button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <PaymentMethodToggle initial={ctx.org.collect_payment_method} />
    </main>
  );
}
