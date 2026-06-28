import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionContext } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { participantLink } from "@/lib/participant";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { Board } from "./Board";
import { Crew } from "./Crew";
import { JobName } from "./JobName";
import { archiveJob, unarchiveJob } from "./actions";
import type { Job, Participant, Phase } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function JobBoardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getSessionContext();
  if (!ctx) redirect("/login");

  const supabase = await createClient();
  // RLS (post-M-VIS): any org member can READ any org job; a job in another org
  // returns null → notFound (tenant isolation holds).
  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const job = jobData as Job | null;
  if (!job) notFound();

  // Owner edits all; a salesman edits only their OWN jobs. A salesman viewing
  // another member's job gets the read-only in-depth view.
  const canEdit = ctx.isOwner || job.salesman_member_id === ctx.member.id;

  const { data: phasesData } = await supabase
    .from("phases")
    .select("*")
    .eq("job_id", id)
    .order("sequence_index", { ascending: true });
  const phases = (phasesData ?? []) as Phase[];

  // Crew rows carry the secret invite_token. The owner / owning salesman read
  // them (RLS-allowed) to manage links; a read-only viewer gets assignee NAMES
  // ONLY, resolved server-side via the service client — never a token (§5).
  let crew: { id: string; name: string; phone: string | null; link: string }[] = [];
  let assignees: { id: string; name: string }[] = [];
  if (canEdit) {
    const { data } = await supabase
      .from("participants")
      .select("*")
      .eq("job_id", id)
      .eq("revoked", false)
      .order("created_at", { ascending: true });
    const participants = (data ?? []) as Participant[];
    crew = participants.map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      link: participantLink(id, p.invite_token),
    }));
    assignees = participants.map((p) => ({ id: p.id, name: p.name }));
  } else {
    const svc = createServiceClient();
    const { data } = await svc
      .from("participants")
      .select("id, name")
      .eq("job_id", id)
      .eq("revoked", false)
      .order("created_at", { ascending: true });
    assignees = (data ?? []) as { id: string; name: string }[];
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 p-4">
      <RealtimeRefresh
        channelName={`phases-job-${job.id}`}
        filter={`job_id=eq.${job.id}`}
      />
      <header>
        <div className="flex items-center justify-between">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 shadow-sm active:bg-slate-100"
          >
            ← Jobs
          </Link>
          {canEdit && (
            <form
              action={
                job.status === "archived"
                  ? unarchiveJob.bind(null, job.id)
                  : archiveJob.bind(null, job.id)
              }
            >
              <button className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-500 shadow-sm active:bg-slate-100">
                {job.status === "archived" ? "Unarchive" : "Archive"}
              </button>
            </form>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          {canEdit ? (
            <JobName jobId={job.id} name={job.name} />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {job.name}
            </h1>
          )}
          {job.status === "archived" && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              Archived
            </span>
          )}
          {!canEdit && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              View only
            </span>
          )}
        </div>
        {(job.customer_name || job.address) && (
          <p className="text-sm text-slate-500">
            {[job.customer_name, job.address].filter(Boolean).join(" · ")}
          </p>
        )}
      </header>

      <Board
        jobId={job.id}
        phases={phases}
        participants={assignees}
        readOnly={!canEdit}
      />

      {canEdit && <Crew jobId={job.id} crew={crew} />}
    </main>
  );
}
