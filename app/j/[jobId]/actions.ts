"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getVerifiedParticipant } from "@/lib/participant";
import { broadcastJobChange } from "@/lib/realtime";
import { logActivity } from "@/lib/activity";
import {
  deleteObjects,
  headObjectSize,
  isR2Configured,
  presignPutUrl,
} from "@/lib/r2";
import {
  isAllowedImageType,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_PHASE,
  storageCapBytes,
} from "@/lib/capabilities";
import { orgStorageUsedBytes } from "@/lib/photos";
import { PAYMENT_TYPES } from "@/lib/types";
import type {
  ConfirmUploadInput,
  ConfirmUploadResult,
  CreateUploadInput,
  CreateUploadResult,
  PhaseStatus,
} from "@/lib/types";

/** Refresh every surface a crew action touches: the crew board, the owner/salesman
 *  job board + dashboard (postgres_changes also covers them), and broadcast so
 *  other anon crew boards on this job refresh live (FIX-1). */
async function revalidateCrew(jobId: string) {
  revalidatePath(`/j/${jobId}`);
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");
  await broadcastJobChange(jobId);
}

/** M-MULTI: is this participant one of the phase's assignees? (Replaces the
 *  legacy single-FK check — assignment lives in the phase_assignees junction;
 *  every co-assignee has identical crew permissions on the phase.) */
async function isAssignedToPhase(
  supabase: ReturnType<typeof createServiceClient>,
  phaseId: string,
  participantId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("phase_assignees")
    .select("phase_id")
    .eq("phase_id", phaseId)
    .eq("participant_id", participantId)
    .maybeSingle();
  return !!data;
}

/**
 * Participant phase update. Enforces the CLAUDE.md §5 invariant end-to-end:
 *   1. read the httpOnly token cookie for THIS job,
 *   2. validate it against a non-revoked participants row AND the M-CLAIM
 *      device claim (or the logged ADMIN_EMAIL test bypass),
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
  const participant = await getVerifiedParticipant(jobId);
  if (!participant) return;

  const supabase = createServiceClient();

  const { data: phase } = await supabase
    .from("phases")
    .select("id, job_id, status")
    .eq("id", phaseId)
    .maybeSingle();
  if (
    !phase ||
    phase.job_id !== jobId ||
    !(await isAssignedToPhase(supabase, phaseId, participant.id))
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

  // Log the change (actor = this crew participant). Skip a no-op re-tap; a
  // (re)block can refresh the reason, so record that.
  if (phase.status !== status || status === "blocked") {
    await logActivity({
      jobId,
      phaseId,
      eventType: "status_change",
      actorParticipantId: participant.id,
      detail: {
        from: phase.status,
        to: status,
        ...(reason ? { reason } : {}),
        ...(participant.adminTest ? { adminTest: true } : {}),
      },
    });
  }

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
  const participant = await getVerifiedParticipant(jobId);
  if (!participant) return;

  const supabase = createServiceClient();
  const { data: phase } = await supabase
    .from("phases")
    .select("id, job_id")
    .eq("id", phaseId)
    .maybeSingle();
  if (
    !phase ||
    phase.job_id !== jobId ||
    !(await isAssignedToPhase(supabase, phaseId, participant.id))
  ) {
    return; // not this participant's phase
  }

  const { data: created } = await supabase
    .from("notes")
    .insert({
      phase_id: phaseId,
      job_id: jobId,
      author_participant_id: participant.id,
      body: text,
    })
    .select("id")
    .single();
  if (created) {
    await logActivity({
      jobId,
      phaseId,
      noteId: created.id,
      eventType: "note_added",
      actorParticipantId: participant.id,
      detail: participant.adminTest ? { adminTest: true } : {},
    });
  }
  await revalidateCrew(jobId);
}

/** Edits a crew note this participant authored. */
export async function editCrewNote(jobId: string, noteId: string, body: string) {
  const text = body.trim();
  if (!text) return;
  const participant = await getVerifiedParticipant(jobId);
  if (!participant) return;

  const supabase = createServiceClient();
  const { data: note } = await supabase
    .from("notes")
    .select("id, job_id, phase_id, author_participant_id")
    .eq("id", noteId)
    .maybeSingle();
  if (!note || note.job_id !== jobId || note.author_participant_id !== participant.id) {
    return; // not this participant's note
  }

  await supabase
    .from("notes")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", noteId);
  await logActivity({
    jobId,
    phaseId: note.phase_id,
    noteId,
    eventType: "note_edited",
    actorParticipantId: participant.id,
    detail: participant.adminTest ? { adminTest: true } : {},
  });
  await revalidateCrew(jobId);
}

/** Deletes a crew note this participant authored. */
export async function deleteCrewNote(jobId: string, noteId: string) {
  const participant = await getVerifiedParticipant(jobId);
  if (!participant) return;

  const supabase = createServiceClient();
  const { data: note } = await supabase
    .from("notes")
    .select("id, job_id, phase_id, author_participant_id")
    .eq("id", noteId)
    .maybeSingle();
  if (!note || note.job_id !== jobId || note.author_participant_id !== participant.id) {
    return; // not this participant's note
  }

  await supabase.from("notes").delete().eq("id", noteId);
  // note_id null (note gone — FK would null it); phase_id kept so it shows under
  // the phase's History.
  await logActivity({
    jobId,
    phaseId: note.phase_id,
    noteId: null,
    eventType: "note_deleted",
    actorParticipantId: participant.id,
    detail: participant.adminTest ? { adminTest: true } : {},
  });
  await revalidateCrew(jobId);
}

// --- Photos (M22, crew side) ---
//
// Same token-scoped enforcement as updateAssignedPhase: validate token ->
// participant, confirm the phase is ASSIGNED to this participant, then write via
// the service role (crew are not auth users). MIME + size + per-phase count + the
// org cap are re-checked server-side. Bytes go browser->R2; this never touches them.

async function crewPhaseForWrite(jobId: string, phaseId: string) {
  const participant = await getVerifiedParticipant(jobId);
  if (!participant) return null;
  const supabase = createServiceClient();
  const { data: phase } = await supabase
    .from("phases")
    .select("id, job_id")
    .eq("id", phaseId)
    .maybeSingle();
  if (
    !phase ||
    phase.job_id !== jobId ||
    !(await isAssignedToPhase(supabase, phaseId, participant.id))
  ) {
    return null; // not this participant's phase
  }
  const { data: job } = await supabase
    .from("jobs")
    .select("id, org_id, deleted_at")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.deleted_at) return null;
  const { data: org } = await supabase
    .from("organizations")
    .select("plan, storage_cap_bytes")
    .eq("id", job.org_id)
    .maybeSingle();
  if (!org) return null;
  return { participant, supabase, orgId: job.org_id as string, org };
}

export async function createCrewUploadUrl(
  input: CreateUploadInput & { jobId: string },
): Promise<CreateUploadResult> {
  if (!isR2Configured()) return { ok: false, error: "config" };
  const { jobId, phaseId, contentType, byteSize } = input;
  const found = await crewPhaseForWrite(jobId, phaseId);
  if (!found) return { ok: false, error: "auth" };
  const { supabase, orgId, org } = found;

  if (!isAllowedImageType(contentType)) return { ok: false, error: "type" };
  if (!(byteSize > 0) || byteSize > MAX_PHOTO_BYTES) {
    return { ok: false, error: "size" };
  }

  const { count } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("phase_id", phaseId);
  if ((count ?? 0) >= MAX_PHOTOS_PER_PHASE) return { ok: false, error: "count" };

  if ((await orgStorageUsedBytes(orgId)) + byteSize > storageCapBytes(org)) {
    return { ok: false, error: "cap" };
  }

  const uuid = randomUUID();
  const key = `org/${orgId}/job/${jobId}/${uuid}.jpg`;
  const thumbKey = `org/${orgId}/job/${jobId}/${uuid}_thumb.jpg`;
  const [uploadUrl, thumbUploadUrl] = await Promise.all([
    presignPutUrl(key, contentType),
    presignPutUrl(thumbKey, contentType),
  ]);
  return { ok: true, key, thumbKey, uploadUrl, thumbUploadUrl };
}

export async function confirmCrewUpload(
  input: ConfirmUploadInput & { jobId: string },
): Promise<ConfirmUploadResult> {
  const { jobId, phaseId, statusContext, key, thumbKey, contentType, width, height } =
    input;
  const found = await crewPhaseForWrite(jobId, phaseId);
  if (!found) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "auth" };
  }
  const { participant, supabase, orgId, org } = found;

  const prefix = `org/${orgId}/job/${jobId}/`;
  if (!key.startsWith(prefix) || (thumbKey && !thumbKey.startsWith(prefix))) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "auth" };
  }

  const size = await headObjectSize(key);
  if (size == null || size <= 0 || size > MAX_PHOTO_BYTES) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "size" };
  }
  if ((await orgStorageUsedBytes(orgId)) + size > storageCapBytes(org)) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "cap" };
  }
  const { count } = await supabase
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("phase_id", phaseId);
  if ((count ?? 0) >= MAX_PHOTOS_PER_PHASE) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "count" };
  }

  const { error } = await supabase.from("photos").insert({
    job_id: jobId,
    phase_id: phaseId,
    org_id: orgId,
    status_context: statusContext,
    uploaded_by_participant_id: participant.id,
    r2_key: key,
    thumb_key: thumbKey || null,
    content_type: contentType,
    byte_size: size,
    width,
    height,
  });
  if (error) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "config" };
  }
  await revalidateCrew(jobId);
  return { ok: true };
}

// --- Preferred payment method (M21, crew side) ---
//
// Owner opt-in (organizations.collect_payment_method). Same token-scoped
// enforcement as the other crew writes: validate token -> participant, then write
// ONLY this participant's own row via the service role. The value is participant-
// level (not phase-scoped), so there is no phase check. The org opt-in is
// re-checked server-side (defense-in-depth; the UI also gates it). Not logged to
// History — it isn't a phase/coordination event.
export async function setCrewPaymentMethod(
  jobId: string,
  paymentType: string | null,
  paymentDetail: string | null,
) {
  const participant = await getVerifiedParticipant(jobId);
  if (!participant) return;

  const supabase = createServiceClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("org_id, deleted_at")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.deleted_at) return;
  const { data: org } = await supabase
    .from("organizations")
    .select("collect_payment_method")
    .eq("id", job.org_id)
    .maybeSingle();
  if (!org?.collect_payment_method) return; // owner hasn't opted in

  const type =
    paymentType && (PAYMENT_TYPES as readonly string[]).includes(paymentType)
      ? paymentType
      : null;
  // Clearing the method clears the detail; cap free-text length defensively.
  const detail = type
    ? paymentDetail?.trim()
      ? paymentDetail.trim().slice(0, 200)
      : null
    : null;

  await supabase
    .from("participants")
    .update({
      payment_type: type,
      payment_detail: detail,
      last_seen_at: new Date().toISOString(),
    })
    .eq("id", participant.id);

  await revalidateCrew(jobId);
}
