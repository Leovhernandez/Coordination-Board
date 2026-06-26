import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionContext, listMembers, type Member } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { STATUS_LABEL, STATUS_PILL } from "@/lib/status";
import { computeHeadline } from "@/lib/critical-path";
import { Headline } from "@/components/Headline";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { isAccessAllowed } from "@/lib/stripe";
import { isAdminEmail } from "@/lib/admin";
import { OrgName } from "./OrgName";
import { MemberName } from "./MemberName";
import { createJob } from "./actions";
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

  const showArchived = (await searchParams).view === "archived";

  const supabase = await createClient();
  // RLS-scoped: an owner gets every job in the org (their own + all salesmen's);
  // a salesman gets only their own. We partition the owner's set below.
  const { data: jobsData } = await supabase
    .from("jobs")
    .select("*")
    .eq("org_id", org.id)
    .eq("status", showArchived ? "archived" : "active")
    .order("created_at", { ascending: false });
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

  // Admin link is for the operator only — gate on the SIGNED-IN user's email,
  // never the org owner's (a salesman in the admin's org must not see it).
  const admin = isAdminEmail(email);

  // Owner view splits into "my jobs" (editable) and a read-only roll-up of each
  // salesman's jobs. A salesman only ever sees their own jobs (no roll-up).
  const ownJobs = isOwner
    ? jobs.filter((j) => !j.salesman_member_id || j.salesman_member_id === member.id)
    : jobs;

  const salesmenGroups: { member: Member; jobs: Job[] }[] = [];
  if (isOwner) {
    const members = await listMembers(org.id);
    const memberById = new Map(members.map((m) => [m.id, m] as const));
    const grouped = new Map<string, Job[]>();
    for (const j of jobs) {
      if (j.salesman_member_id && j.salesman_member_id !== member.id) {
        const list = grouped.get(j.salesman_member_id) ?? [];
        list.push(j);
        grouped.set(j.salesman_member_id, list);
      }
    }
    for (const [mid, mjobs] of grouped) {
      const m = memberById.get(mid);
      if (m) salesmenGroups.push({ member: m, jobs: mjobs });
    }
    salesmenGroups.sort((a, b) => a.member.name.localeCompare(b.member.name));
  }

  // Shared read-only summary used by both my-jobs cards and roll-up cards.
  const summary = (job: Job) => (
    <>
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
              {STATUS_LABEL[p.status]}
            </span>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-5 p-4">
      {/* Live updates from crew + salesmen: phases (status), jobs (new/archive),
          org_members (a salesman renaming themselves). RLS-scoped per user. */}
      <RealtimeRefresh
        channelName="dashboard"
        tables={["phases", "jobs", "org_members"]}
      />
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {isOwner ? (
            <OrgName name={org.name} />
          ) : (
            <MemberName name={member.name} />
          )}
          <p className="text-sm text-slate-500">
            {ownJobs.length} {showArchived ? "archived" : "active"}{" "}
            {ownJobs.length === 1 ? "job" : "jobs"}
          </p>
        </div>
        <form action={signOut}>
          <button className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 active:bg-slate-100">
            Sign out
          </button>
        </form>
      </header>

      <div className="flex items-center gap-2">
        <Link
          href="/dashboard"
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            showArchived ? "text-slate-500" : "bg-slate-900 text-white"
          }`}
        >
          Active
        </Link>
        <Link
          href="/dashboard?view=archived"
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            showArchived ? "bg-slate-900 text-white" : "text-slate-500"
          }`}
        >
          Archived
        </Link>
        {isOwner && (
          <Link
            href="/dashboard/team"
            className="ml-auto rounded-full px-3 py-1 text-sm font-medium text-slate-500"
          >
            Team
          </Link>
        )}
        {isOwner && (
          <Link
            href="/billing"
            className="rounded-full px-3 py-1 text-sm font-medium text-slate-500"
          >
            Billing
          </Link>
        )}
        {admin && (
          <Link
            href="/admin"
            className="rounded-full px-3 py-1 text-sm font-medium text-slate-500"
          >
            Admin
          </Link>
        )}
      </div>

      {!isAccessAllowed(org.subscription_status, org.trial_ends_at) && (
        <Link
          href="/billing"
          className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900"
        >
          Your {org.subscription_status === "trialing" ? "trial has ended" : `subscription is ${org.subscription_status}`}{" "}
          — subscribe to create jobs →
        </Link>
      )}

      <section className="flex flex-col gap-3">
        {ownJobs.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500">
            {showArchived
              ? "No archived jobs."
              : "No jobs yet. Create your first one below — it starts with the standard phases."}
          </p>
        )}

        {ownJobs.map((job) => (
          <Link
            key={job.id}
            href={`/jobs/${job.id}`}
            className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99] active:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                {job.name}
              </h2>
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-sm font-medium text-slate-500">
                Open →
              </span>
            </div>
            {summary(job)}
          </Link>
        ))}
      </section>

      {/* Read-only roll-up: each salesman's live jobs, one swipeable shelf per
          person. Glance-only — the owner reads but never edits a salesman's job. */}
      {isOwner && salesmenGroups.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Team jobs</h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              read-only
            </span>
          </div>
          {salesmenGroups.map(({ member: sm, jobs: smJobs }) => (
            <div key={sm.id} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="truncate text-base font-semibold text-slate-900">
                  {sm.name}
                </h3>
                <span className="shrink-0 text-xs text-slate-500">
                  {smJobs.length} {smJobs.length === 1 ? "job" : "jobs"}
                </span>
              </div>
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
                {smJobs.map((job) => (
                  <article
                    key={job.id}
                    className="w-[85%] shrink-0 snap-start rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <h4 className="text-base font-semibold text-slate-900">
                      {job.name}
                    </h4>
                    {summary(job)}
                  </article>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {!showArchived && (
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">New job</h2>
        <form action={createJob} className="flex flex-col gap-2.5">
          <input
            name="name"
            required
            placeholder="Job name (e.g. 1428 Oak St kitchen)"
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
          <input
            name="address"
            placeholder="Address (optional)"
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
          <input
            name="customer_name"
            placeholder="Customer name (optional)"
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-3 text-base font-semibold text-white active:bg-slate-700"
          >
            Create job
          </button>
        </form>
      </section>
      )}
    </main>
  );
}
