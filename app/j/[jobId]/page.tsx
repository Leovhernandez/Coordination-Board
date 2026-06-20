import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getParticipantByToken,
  participantCookieName,
} from "@/lib/participant";
import { BroadcastRefresh } from "@/components/BroadcastRefresh";
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

  if (!participant) {
    return (
      <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">
          This link isn’t active
        </h1>
        <p className="text-sm text-slate-500">
          It may have been revoked or it’s incorrect. Ask the contractor to text
          you a fresh link.
        </p>
      </main>
    );
  }

  const supabase = createServiceClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, name")
    .eq("id", jobId)
    .maybeSingle();
  // Only this participant's assigned phases ever leave the server.
  const { data: phasesData } = await supabase
    .from("phases")
    .select("*")
    .eq("job_id", jobId)
    .eq("assignee_participant_id", participant.id)
    .order("sequence_index", { ascending: true });
  const myPhases = (phasesData ?? []) as Phase[];

  return (
    <>
      <BroadcastRefresh jobId={jobId} />
      <ParticipantBoard
        jobId={jobId}
        jobName={job?.name ?? "Job"}
        participantName={participant.name}
        phases={myPhases}
      />
    </>
  );
}
