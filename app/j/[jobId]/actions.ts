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

/** Refresh every surface a crew action touches: the crew board, the owner/salesman
 *  job board + dashboard (postgres_changes also covers them), and broadcast so
 *  other anon crew boards on this job refresh live (FIX-1). */
async function revalidateCrew(jobId: string) {
  revalidatePath(`/j/${jobId}`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");
  await broadcastJobChange(jobId);
}

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

  await revalidateCrew(jobId);
}

// --- Phase notes (M17, crew side) ---
//
// Crew are not auth users, so RLS can't gate them; these enforce the visibility
// matrix in app code, identically to updateAssignedPhase: validate the token ->
// participant, confirm the phase/note belongs to this job AND to this participant,
// then write via the service-role client. Any failure is a silent no-op.

/** Adds a crew note on a phase ASSIGNED to this participant. */
export async function addCrewNote(jobId: string, phaseId: string, body: string) {
  const text = body.trim();
  if (!text) return;
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

  await supabase.from("notes").insert({
    phase_id: phaseId,
    job_id: jobId,
    author_participant_id: participant.id,
    body: text,
  });
  await revalidateCrew(jobId);
}

/** Edits a crew note this participant authored. */
export async function editCrewNote(jobId: string, noteId: string, body: string) {
  const text = body.trim();
  if (!text) return;
  const token = (await cookies()).get(participantCookieName(jobId))?.value;
  const participant = await getParticipantByToken(jobId, token);
  if (!participant) return;

  const supabase = createServiceClient();
  const { data: note } = await supabase
    .from("notes")
    .select("id, job_id, author_participant_id")
    .eq("id", noteId)
    .maybeSingle();
  if (!note || note.job_id !== jobId || note.author_participant_id !== participant.id) {
    return; // not this participant's note
  }

  await supabase
    .from("notes")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", noteId);
  await revalidateCrew(jobId);
}

/** Deletes a crew note this participant authored. */
export async function deleteCrewNote(jobId: string, noteId: string) {
  const token = (await cookies()).get(participantCookieName(jobId))?.value;
  const participant = await getParticipantByToken(jobId, token);
  if (!participant) return;

  const supabase = createServiceClient();
  const { data: note } = await supabase
    .from("notes")
    .select("id, job_id, author_participant_id")
    .eq("id", noteId)
    .maybeSingle();
  if (!note || note.job_id !== jobId || note.author_participant_id !== participant.id) {
    return; // not this participant's note
  }

  await supabase.from("notes").delete().eq("id", noteId);
  await revalidateCrew(jobId);
}
