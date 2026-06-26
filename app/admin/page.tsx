import Link from "next/link";
import { requireAdmin, isAdminEmail } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import {
  addAllowedEmail,
  addSalesmanToOrg,
  deleteAccount,
  removeAllowedEmail,
  setOrgStatus,
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
  const svc = createServiceClient();

  const { data: orgsData } = await svc
    .from("organizations")
    .select("id, name, owner_email, subscription_status, trial_ends_at")
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
          Admin
        </h1>
        <Link href="/dashboard" className={chipBtn}>
          ← Dashboard
        </Link>
      </header>

      {/* Accounts + trials */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-slate-900">
          Accounts ({orgs.length})
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
                  {o.subscription_status}
                  {o.subscription_status === "trialing" && dl !== null
                    ? ` · ${dl}d left`
                    : ""}
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <form action={setTrialDays.bind(null, o.id, 14)}>
                  <button className={chipBtn}>Trial +14d</button>
                </form>
                <form action={setOrgStatus.bind(null, o.id, "active")}>
                  <button className={chipBtn}>Comp (active)</button>
                </form>
                <form action={setTrialDays.bind(null, o.id, 0)}>
                  <button className={chipBtn}>End trial</button>
                </form>
                <form action={setOrgStatus.bind(null, o.id, "canceled")}>
                  <button className={chipBtn}>Cancel</button>
                </form>
                <form action={deleteAccount.bind(null, o.id)}>
                  <ConfirmSubmit
                    message={`Permanently delete ${o.owner_email ?? o.name} and ALL their jobs? This cannot be undone.`}
                    className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-600 active:bg-red-50"
                  >
                    Delete
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
                    placeholder="Salesman name"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900"
                  />
                  <input
                    name="email"
                    type="email"
                    placeholder="salesman@email.com"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-slate-900"
                  />
                  <button className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white">
                    Add salesman
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
          Owner List ({allowed.length})
        </h2>
        <p className="text-xs text-slate-500">
          Approved <strong>business owners</strong>. An email here can sign in,
          gets its own company, and can invite its own salesmen. Salesmen are
          invited by their owner — they are <em>not</em> added here.
        </p>
        {allowed.map((a) => (
          <div
            key={a.email}
            className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <span className="truncate">{a.email}</span>
            <form action={removeAllowedEmail.bind(null, a.email)}>
              <button className="text-xs font-medium text-red-600">
                Remove
              </button>
            </form>
          </div>
        ))}
        <form action={addAllowedEmail} className="flex gap-2">
          <input name="email" type="email" placeholder="owner@company.com" className={inputCls} />
          <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
            Add
          </button>
        </form>
      </section>
    </main>
  );
}
