import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext, listMembers, type Member } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { STATUS_PILL } from "@/lib/status";
import { computeHeadline } from "@/lib/critical-path";
import { Headline } from "@/components/Headline";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { LangToggle } from "@/components/LangToggle";
import { getDictionary, getLang } from "@/lib/i18n/server";
import { interpolate } from "@/lib/i18n/interpolate";
import { isAccessAllowed } from "@/lib/stripe";
import { isAdminEmail } from "@/lib/admin";
import { OrgName } from "./OrgName";
import { MemberName } from "./MemberName";
import { createJob } from "./actions";
import { TrashJobCard } from "./TrashJobCard";
import type { Job, Phase } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");
  const { org, isOwner, email, member } = ctx;
  const t = await getDictionary();
  const lang = await getLang();

  const view = (await searchParams).view;
  const showArchived = view === "archived";
  const showTrash = view === "trash";

  const supabase = await createClient();
  // RLS-scoped: owner sees all org jobs; a salesman sees all org jobs read-only
  // (post-M-VIS) or only their own (pre-migration — degrades gracefully: the
  // team section is simply empty until the migration lands). Trash (M10) lists
  // soft-deleted jobs regardless of status; active/archived hide them.
  let jobsQuery = supabase.from("jobs").select("*").eq("org_id", org.id);
  jobsQuery = showTrash
    ? jobsQuery
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
    : jobsQuery
        .eq("status", showArchived ? "archived" : "active")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
  const { data: jobsData } = await jobsQuery;
  const jobs = (jobsData ?? []) as Job[];

  const jobIds = jobs.map((j) => j.id);
  const { data: phasesData } = jobIds.length
    ? await supabase
        .from("phases")
        .select("*")
        .in("job_id", jobIds)
        .order("sequence_index", { ascending: true })
    : { data: [] as Phase[] };
  const phases = (phasesData ?? []) as Phase[];

  const phasesByJob = new Map<string, Phase[]>();
  for (const p of phases) {
    const list = phasesByJob.get(p.job_id) ?? [];
    list.push(p);
    phasesByJob.set(p.job_id, list);
  }

  // Admin link is for the operator only — gate on the SIGNED-IN user's email.
  const admin = isAdminEmail(email);

  // Symmetric partition for BOTH roles: "my jobs" (the viewer's own, editable)
  // vs "team jobs" (everyone else's, grouped by member, read-only). A job's
  // owning member is its salesman, or the org owner for legacy null rows.
  const members = await listMembers(org.id);
  const memberById = new Map(members.map((m) => [m.id, m] as const));
  const ownerMemberId = members.find((m) => m.role === "owner")?.id ?? null;
  const owningMemberId = (j: Job) => j.salesman_member_id ?? ownerMemberId;

  const myJobs = jobs.filter((j) => owningMemberId(j) === member.id);

  const teamMap = new Map<string, Job[]>();
  for (const j of jobs) {
    const oid = owningMemberId(j);
    if (oid && oid !== member.id) {
      const list = teamMap.get(oid) ?? [];
      list.push(j);
      teamMap.set(oid, list);
    }
  }
  const teamGroups: { member: Member; jobs: Job[] }[] = [];
  for (const [mid, mjobs] of teamMap) {
    const m = memberById.get(mid);
    if (m) teamGroups.push({ member: m, jobs: mjobs });
  }
  teamGroups.sort((a, b) => a.member.name.localeCompare(b.member.name));

  const shelf = "-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1";
  const card =
    "w-[85%] shrink-0 snap-start rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99] active:bg-slate-50";

  // Full card (my jobs): headline + the whole phase list. Editable on tap.
  const fullCard = (job: Job) => (
    <Link key={job.id} href={`/jobs/${job.id}`} className={card}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{job.name}</h3>
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-500">
          {t.dashboard.open}
        </span>
      </div>
      {(job.address || job.customer_name) && (
        <p className="mt-0.5 text-xs text-slate-500">
          {[job.customer_name, job.address].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-3">
        <Headline data={computeHeadline(phasesByJob.get(job.id) ?? [])} compact />
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {(phasesByJob.get(job.id) ?? []).map((p, i) => (
          <li key={p.id} className="flex items-center justify-between text-sm">
            <span className="text-slate-700">
              <span className="text-slate-400">{i + 1}.</span> {p.label}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[p.status]}`}
            >
              {t.status[p.status]}
            </span>
          </li>
        ))}
      </ul>
    </Link>
  );

  // Compact card (team jobs): name + customer/address + headline ONLY — at a
  // glance, no phase list (saves screen space). Tap → read-only in-depth view.
  const compactCard = (job: Job) => (
    <Link key={job.id} href={`/jobs/${job.id}`} className={card}>
      <h4 className="text-base font-semibold text-slate-900">{job.name}</h4>
      {(job.address || job.customer_name) && (
        <p className="mt-0.5 text-xs text-slate-500">
          {[job.customer_name, job.address].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-3">
        <Headline data={computeHeadline(phasesByJob.get(job.id) ?? [])} compact />
      </div>
    </Link>
  );

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 p-4">
      <RealtimeRefresh
        channelName="dashboard"
        tables={["phases", "jobs", "org_members"]}
      />
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {isOwner ? (
            <OrgName name={org.name} />
          ) : (
            <MemberName name={member.name} />
          )}
          <p className="text-sm text-slate-500">
            {interpolate(
              showTrash
                ? myJobs.length === 1
                  ? t.dashboard.deletedOne
                  : t.dashboard.deletedMany
                : showArchived
                  ? myJobs.length === 1
                    ? t.dashboard.archivedOne
                    : t.dashboard.archivedMany
                  : myJobs.length === 1
                    ? t.dashboard.activeOne
                    : t.dashboard.activeMany,
              { n: myJobs.length },
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LangToggle />
          <form action={signOut}>
            <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 active:bg-slate-100">
              {t.common.signOut}
            </button>
          </form>
        </div>
      </header>

      {/* N3: wrap the tab row so longer ES labels (e.g. "Facturación") never push
          it past a narrow viewport and trigger a mobile zoom-out. */}
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/dashboard"
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            !showArchived && !showTrash
              ? "bg-slate-900 text-white"
              : "text-slate-500"
          }`}
        >
          {t.nav.active}
        </Link>
        <Link
          href="/dashboard?view=archived"
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            showArchived ? "bg-slate-900 text-white" : "text-slate-500"
          }`}
        >
          {t.nav.archived}
        </Link>
        <Link
          href="/dashboard?view=trash"
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            showTrash ? "bg-slate-900 text-white" : "text-slate-500"
          }`}
        >
          {t.nav.trash}
        </Link>
        {isOwner && (
          <Link
            href="/dashboard/team"
            className="rounded-full px-3 py-1 text-sm font-medium text-slate-500"
          >
            {t.nav.team}
          </Link>
        )}
        {isOwner && (
          <Link
            href="/billing"
            className="rounded-full px-3 py-1 text-sm font-medium text-slate-500"
          >
            {t.nav.billing}
          </Link>
        )}
        {admin && (
          <Link
            href="/admin"
            className="rounded-full px-3 py-1 text-sm font-medium text-slate-500"
          >
            {t.nav.admin}
          </Link>
        )}
      </div>

      {/* N2: dated promo-ending notice (owner-only — billing concern). */}
      {isOwner &&
        org.promo_ends_at &&
        new Date(org.promo_ends_at).getTime() > Date.now() && (
          <Link
            href="/billing"
            className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900"
          >
            {interpolate(t.billing.promoBanner, {
              date: new Date(org.promo_ends_at).toLocaleDateString(
                lang === "es" ? "es-ES" : "en-US",
                { year: "numeric", month: "long", day: "numeric" },
              ),
            })}
          </Link>
        )}

      {!isAccessAllowed(org.subscription_status, org.trial_ends_at) && (
        <Link
          href="/billing"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900"
        >
          {org.subscription_status === "trialing"
            ? t.dashboard.trialEnded
            : interpolate(t.dashboard.subInactive, {
                status:
                  t.subStatus[
                    org.subscription_status as keyof typeof t.subStatus
                  ] ?? org.subscription_status,
              })}
        </Link>
      )}

      {/* Trash — soft-deleted jobs the viewer owns; restore or purge (M10). */}
      {showTrash && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{t.nav.trash}</h2>
          {myJobs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
              {t.dashboard.trashEmpty}
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {myJobs.map((job) => (
                <TrashJobCard
                  key={job.id}
                  id={job.id}
                  name={job.name}
                  customerName={job.customer_name}
                  address={job.address}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* My jobs — editable, horizontal shelf with full phase detail. */}
      {!showTrash && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            {t.dashboard.myJobs}
          </h2>
          {myJobs.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
              {showArchived
                ? t.dashboard.emptyOwnArchived
                : t.dashboard.emptyOwnActive}
            </p>
          ) : (
            <div className={shelf}>{myJobs.map(fullCard)}</div>
          )}
        </section>
      )}

      {/* New job — directly under My jobs (not pushed to the page bottom). */}
      {!showArchived && !showTrash && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">
            {t.dashboard.newJob}
          </h2>
          <form action={createJob} className="flex flex-col gap-2.5">
            <input
              name="name"
              required
              placeholder={t.dashboard.jobNamePlaceholder}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
            <input
              name="address"
              placeholder={t.dashboard.addressPlaceholder}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
            <input
              name="customer_name"
              placeholder={t.dashboard.customerPlaceholder}
              className="rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white active:bg-slate-700"
            >
              {t.dashboard.createJob}
            </button>
          </form>
        </section>
      )}

      {/* Team jobs — read-only compact shelves, one per other member. */}
      {!showTrash && teamGroups.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              {t.dashboard.teamJobs}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {t.common.readOnly}
            </span>
          </div>
          {teamGroups.map(({ member: tm, jobs: tj }) => (
            <div key={tm.id} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="truncate text-base font-semibold text-slate-900">
                  {tm.name}
                </h3>
                <span className="shrink-0 text-xs text-slate-500">
                  {interpolate(
                    tj.length === 1
                      ? t.dashboard.jobCountOne
                      : t.dashboard.jobCountMany,
                    { n: tj.length },
                  )}
                </span>
              </div>
              <div className={shelf}>{tj.map(compactCard)}</div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
