"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getParticipantByToken,
  participantCookieName,
} from "@/lib/participant";
import { broadcastJobChange } from "@/lib/realtime";
import type { PhaseStatus } from "@/lib/types";

/**
 * Participant phase update. Enforces the CLAUDE.md §5 invariant end-to-end:
 *   1. read the httpOnly token cookie for THIS job,
 *   2. validate it against a non-revoked participants row,
 *   3. confirm the phase belongs to this job AND is assigned to this participant,
 *   4. write via the service-role client (server-side only).
 * Any failure is a silent no-op — a participant can touch no other phase/job.
 */
export async function updateAssignedPhase(
  jobId: string,
  phaseId: string,
  status: PhaseStatus,
  blockedReason: string | null,
) {
  const token = (await cookies()).get(participantCookieName(jobId))?.value;
  const participant = await getParticipantByToken(jobId, token);
  if (!participant) return;

  const supabase = createServiceClient();

  const { data: phase } = await supabase
    .from("phases")
    .select("id, job_id, assignee_participant_id")
    .eq("id", phaseId)
    .maybeSingle();
  if (
    !phase ||
    phase.job_id !== jobId ||
    phase.assignee_participant_id !== participant.id
  ) {
    return; // not this participant's phase
  }

  const reason =
    status === "blocked" ? (blockedReason?.trim() || null) : null;
  if (status === "blocked" && !reason) return;

  await supabase
    .from("phases")
    .update({
      status,
      blocked_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", phaseId);
  await supabase
    .from("participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", participant.id);

  revalidatePath(`/j/${jobId}`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");
  await broadcastJobChange(jobId);
}
