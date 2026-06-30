import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getParticipantByToken,
  participantCookieName,
} from "@/lib/participant";
import { BroadcastRefresh } from "@/components/BroadcastRefresh";
import { notesForParticipant } from "@/lib/notes";
import { photosForParticipant } from "@/lib/photos";
import { getDictionary } from "@/lib/i18n/server";
import { ParticipantBoard } from "./ParticipantBoard";
import type { Phase } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ParticipantPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { jobId } = await params;
  const sp = await searchParams;

  // First visit carries the token in the URL: hand off to the entry route,
  // which sets the cookie and bounces back here clean.
  if (sp.t) {
    redirect(`/j/${jobId}/enter?t=${encodeURIComponent(sp.t)}`);
  }

  const token = (await cookies()).get(participantCookieName(jobId))?.value;
  const participant = await getParticipantByToken(jobId, token);
  const t = await getDictionary();

  if (!participant) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">
          {t.participant.linkInactive}
        </h1>
        <p className="text-sm text-slate-500">{t.participant.linkInactiveHint}</p>
      </main>
    );
  }

  const supabase = createServiceClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, name, org_id, deleted_at")
    .eq("id", jobId)
    .maybeSingle();

  // A soft-deleted (or missing) job: the crew link is no longer active (M10).
  if (!job || job.deleted_at) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">
          {t.participant.linkInactive}
        </h1>
        <p className="text-sm text-slate-500">{t.participant.linkInactiveHint}</p>
      </main>
    );
  }

  // Only this participant's assigned phases ever leave the server.
  const { data: phasesData } = await supabase
    .from("phases")
    .select("*")
    .eq("job_id", jobId)
    .eq("assignee_participant_id", participant.id)
    .order("sequence_index", { ascending: true });
  const myPhases = (phasesData ?? []) as Phase[];

  // M17: notes on this crew's assigned phases — member notes + their own crew
  // notes only (never another crew's), scoped to the assigned phase ids.
  const notesByPhase = job
    ? await notesForParticipant(
        jobId,
        job.org_id,
        participant.id,
        myPhases.map((p) => p.id),
      )
    : {};

  // M22: status-evidence photos on this crew's assigned phases (member photos +
  // their own), scoped to the assigned phase ids — same boundary as notes.
  const photosByPhase = job
    ? await photosForParticipant(
        jobId,
        job.org_id,
        participant.id,
        myPhases.map((p) => p.id),
      )
    : {};

  return (
    <>
      <BroadcastRefresh jobId={jobId} />
      <ParticipantBoard
        key={myPhases.map((p) => p.id).join(",") || "none"}
        jobId={jobId}
        jobName={job?.name ?? t.participant.jobFallback}
        participantName={participant.name}
        phases={myPhases}
        notesByPhase={notesByPhase}
        photosByPhase={photosByPhase}
      />
    </>
  );
}
