import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSessionContext } from "@/lib/membership";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { participantLink } from "@/lib/participant";
import { notesForJob } from "@/lib/notes";
import { activityForJob } from "@/lib/activity";
import { photosForJob } from "@/lib/photos";
import { RealtimeRefresh } from "@/components/RealtimeRefresh";
import { getDictionary } from "@/lib/i18n/server";
import { Board } from "./Board";
import { Crew } from "./Crew";
import { JobName } from "./JobName";
import { archiveJob, deleteJob, unarchiveJob } from "./actions";
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
  const t = await getDictionary();

  const supabase = await createClient();
  // RLS (post-M-VIS): any org member can READ any org job; a job in another org
  // returns null → notFound (tenant isolation holds).
  const { data: jobData } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const job = jobData as Job | null;
  // A soft-deleted job lives only in Trash — not viewable as a board. Restore is
  // from the dashboard Trash view (M10).
  if (!job || job.deleted_at) notFound();

  // Every member is READ-ONLY on jobs they don't own — the owner included (R2:
  // honors the read-only team roll-up, ROADMAP §4 / AGENTS §9). You edit only the
  // jobs you own; the owner also owns legacy null-salesman jobs. Anyone viewing a
  // job they don't own gets the read-only in-depth view.
  const canEdit =
    job.salesman_member_id === ctx.member.id ||
    (ctx.isOwner && !job.salesman_member_id);

  const { data: phasesData } = await supabase
    .from("phases")
    .select("*")
    .eq("job_id", id)
    .order("sequence_index", { ascending: true });
  const phases = (phasesData ?? []) as Phase[];

  // M-MULTI: crew assignments come from the phase_assignees junction (the legacy
  // phases.assignee_participant_id is never read). Members read org-wide via RLS.
  const { data: paData } = await supabase
    .from("phase_assignees")
    .select("phase_id, participant_id")
    .eq("job_id", id)
    .order("created_at", { ascending: true });
  const assigneesByPhase: Record<string, string[]> = {};
  for (const r of (paData ?? []) as { phase_id: string; participant_id: string }[]) {
    (assigneesByPhase[r.phase_id] ??= []).push(r.participant_id);
  }

  // M17: notes for every phase, author resolved + per-note canEdit precomputed for
  // this viewer (only their own member notes are editable — mirrors RLS).
  const notesByPhase = await notesForJob(job.id, job.org_id, ctx.member.id);

  // M18: activity per phase (actor names resolved server-side) for the History
  // disclosure + blocker-duration pill. Display-only; same data on the editable
  // board and the read-only in-depth view.
  const activityByPhase = await activityForJob(job.id, job.org_id);

  // M22: status-evidence photos per phase (CDN urls + uploader resolved). Members
  // read org-wide; display-only on both the editable board and read-only view.
  const photosByPhase = await photosForJob(job.id, job.org_id);

  // Crew rows carry the secret invite_token. The owner / owning salesman read
  // them (RLS-allowed) to manage links; a read-only viewer gets assignee NAMES
  // ONLY, resolved server-side via the service client — never a token (§5).
  let crew: {
    id: string;
    name: string;
    phone: string | null;
    link: string;
    paymentType: string | null;
    paymentDetail: string | null;
    claimedAt: string | null;
  }[] = [];
  let assignees: { id: string; name: string }[] = [];
  if (canEdit) {
    const { data } = await supabase
      .from("participants")
      .select("*")
      .eq("job_id", id)
      .eq("revoked", false)
      .order("created_at", { ascending: true });
    const participants = (data ?? []) as Participant[];
    // Explicit field mapping — claim_secret_hash must never reach the client.
    crew = participants.map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      link: participantLink(id, p.invite_token),
      paymentType: p.payment_type,
      paymentDetail: p.payment_detail,
      claimedAt: p.claimed_at,
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
        tables={[
          "phases",
          "phase_assignees",
          "notes",
          "activity_log",
          "photos",
          "participants",
        ]}
      />
      <header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/dashboard"
            className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 shadow-sm active:bg-slate-100"
          >
            {t.job.back}
          </Link>
          {canEdit && (
            <div className="flex items-center gap-2">
              <form
                action={
                  job.status === "archived"
                    ? unarchiveJob.bind(null, job.id)
                    : archiveJob.bind(null, job.id)
                }
              >
                <button className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-500 shadow-sm active:bg-slate-100">
                  {job.status === "archived" ? t.job.unarchive : t.job.archive}
                </button>
              </form>
              <form action={deleteJob.bind(null, job.id)}>
                <button className="inline-flex items-center rounded-full border border-red-200 bg-white px-3 py-1 text-sm font-medium text-red-600 shadow-sm active:bg-red-50">
                  {t.job.delete}
                </button>
              </form>
            </div>
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
              {t.common.archived}
            </span>
          )}
          {!canEdit && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              {t.common.viewOnly}
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
        assigneesByPhase={assigneesByPhase}
        maxAssignees={ctx.org.max_assignees_per_phase}
        notesByPhase={notesByPhase}
        activityByPhase={activityByPhase}
        photosByPhase={photosByPhase}
        readOnly={!canEdit}
      />

      {canEdit && (
        <Crew
          jobId={job.id}
          crew={crew}
          collectPaymentMethod={ctx.org.collect_payment_method}
        />
      )}
    </main>
  );
}
