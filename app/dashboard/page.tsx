import Link from "next/link";
import { redirect } from "next/navigation";
import { getOrCreateOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { createJob } from "./actions";
import type { Job, Phase, PhaseStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<PhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

const STATUS_CLASS: Record<PhaseStatus, string> = {
  not_started: "bg-gray-100 text-gray-600",
  in_progress: "bg-amber-100 text-amber-800",
  blocked: "bg-red-100 text-red-800",
  done: "bg-green-100 text-green-800",
};

export default async function DashboardPage() {
  const org = await getOrCreateOrg();
  if (!org) redirect("/login");

  const supabase = await createClient();
  const { data: jobsData } = await supabase
    .from("jobs")
    .select("*")
    .eq("org_id", org.id)
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

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-6 p-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{org.name}</h1>
          <p className="text-xs text-gray-500">Jobs</p>
        </div>
        <form action={signOut}>
          <button className="text-sm text-gray-500 underline underline-offset-4">
            Sign out
          </button>
        </form>
      </header>

      <section className="flex flex-col gap-3">
        {jobs.length === 0 && (
          <p className="rounded-md border border-dashed border-gray-300 p-4 text-sm text-gray-500">
            No jobs yet. Create your first one below — it starts with the
            standard phases.
          </p>
        )}

        {jobs.map((job) => (
          <Link
            key={job.id}
            href={`/jobs/${job.id}`}
            className="block rounded-lg border border-gray-200 p-4 active:bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{job.name}</h2>
              <span className="text-sm text-gray-400">Open board →</span>
            </div>
            {(job.address || job.customer_name) && (
              <p className="text-xs text-gray-500">
                {[job.customer_name, job.address].filter(Boolean).join(" · ")}
              </p>
            )}
            <ul className="mt-3 flex flex-col gap-1.5">
              {(phasesByJob.get(job.id) ?? []).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    {p.sequence_index + 1}. {p.label}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[p.status]}`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </li>
              ))}
            </ul>
          </Link>
        ))}
      </section>

      <section className="rounded-lg border border-gray-200 p-4">
        <h2 className="mb-3 text-sm font-semibold">New job</h2>
        <form action={createJob} className="flex flex-col gap-3">
          <input
            name="name"
            required
            placeholder="Job name (e.g. 1428 Oak St kitchen)"
            className="rounded-md border border-gray-300 px-3 py-3 text-base outline-none focus:border-gray-900"
          />
          <input
            name="address"
            placeholder="Address (optional)"
            className="rounded-md border border-gray-300 px-3 py-3 text-base outline-none focus:border-gray-900"
          />
          <input
            name="customer_name"
            placeholder="Customer name (optional)"
            className="rounded-md border border-gray-300 px-3 py-3 text-base outline-none focus:border-gray-900"
          />
          <button
            type="submit"
            className="rounded-md bg-gray-900 px-4 py-3 text-base font-semibold text-white active:bg-gray-700"
          >
            Create job
          </button>
        </form>
      </section>
    </main>
  );
}
