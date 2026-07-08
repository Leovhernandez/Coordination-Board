"use server";

import { randomBytes, randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionContext } from "@/lib/membership";
import { broadcastJobChange } from "@/lib/realtime";
import { logActivity } from "@/lib/activity";
import {
  deleteByPrefix,
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
import type {
  ConfirmUploadInput,
  ConfirmUploadResult,
  CreateUploadInput,
  CreateUploadResult,
  PhaseStatus,
} from "@/lib/types";

async function revalidateJob(jobId: string) {
  revalidatePath(`/jobs/${jobId}`);
  revalidatePath(`/j/${jobId}`); // crew board — required so router.refresh() sees new assignments
  revalidatePath("/dashboard");
  await broadcastJobChange(jobId);
}

/** Renames a job (owner). */
export async function renameJob(jobId: string, name: string) {
  const n = name.trim();
  if (!n) return;
  const supabase = await createClient();
  await supabase.from("jobs").update({ name: n }).eq("id", jobId);
  await revalidateJob(jobId);
}

/**
 * Updates a single phase's status. RLS guarantees the caller can only touch
 * phases in their own org. Blocked requires a non-empty reason (also enforced
 * by a DB check constraint); switching away from blocked clears the reason.
 */
export async function setPhaseStatus(
  phaseId: string,
  jobId: string,
  status: PhaseStatus,
  blockedReason: string | null,
) {
  const reason =
    status === "blocked" ? (blockedReason?.trim() || null) : null;
  if (status === "blocked" && !reason) return; // guard; UI prevents this

  const ctx = await getSessionContext();
  if (!ctx) return;

  const supabase = await createClient();
  // Prior status for the log's {from}. A read-only viewer can READ it (RLS allows
  // org reads) but their update below affects 0 rows, so we never log their attempt.
  const { data: before } = await supabase
    .from("phases")
    .select("status")
    .eq("id", phaseId)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("phases")
    .update({
      status,
      blocked_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", phaseId)
    .select("id");
  if (error || !updated || updated.length === 0) return; // no write → no log

  // Skip a no-op re-tap of the current status; a (re)block can refresh the reason,
  // so it's still worth recording.
  if ((before?.status ?? null) !== status || status === "blocked") {
    await logActivity({
      jobId,
      phaseId,
      eventType: "status_change",
      actorMemberId: ctx.member.id,
      detail: {
        from: before?.status ?? null,
        to: status,
        ...(reason ? { reason } : {}),
      },
    });
  }

  await revalidateJob(jobId);
}

/** Appends a new phase to the end of the job's sequence. */
export async function addPhase(jobId: string, label: string) {
  const name = label.trim();
  if (!name) return;
  const ctx = await getSessionContext();
  if (!ctx) return;

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("phases")
    .select("sequence_index")
    .eq("job_id", jobId)
    .order("sequence_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIndex = (last?.sequence_index ?? -1) + 1;

  const { data: created, error } = await supabase
    .from("phases")
    .insert({ job_id: jobId, label: name, sequence_index: nextIndex })
    .select("id")
    .single();
  if (error || !created) return; // RLS-blocked insert errors → no log

  await logActivity({
    jobId,
    phaseId: created.id,
    eventType: "phase_added",
    actorMemberId: ctx.member.id,
    detail: { label: name },
  });
  await revalidateJob(jobId);
}

/** Renames a phase. */
export async function renamePhase(
  phaseId: string,
  jobId: string,
  label: string,
) {
  const name = label.trim();
  if (!name) return;
  const ctx = await getSessionContext();
  if (!ctx) return;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("phases")
    .select("label")
    .eq("id", phaseId)
    .maybeSingle();

  const { data: updated, error } = await supabase
    .from("phases")
    .update({ label: name })
    .eq("id", phaseId)
    .select("id");
  if (error || !updated || updated.length === 0) return;

  if ((before?.label ?? null) !== name) {
    await logActivity({
      jobId,
      phaseId,
      eventType: "label_change",
      actorMemberId: ctx.member.id,
      detail: { from: before?.label ?? null, to: name },
    });
  }
  await revalidateJob(jobId);
}

/** Deletes a phase. Gaps in sequence_index are fine (display numbers by position). */
export async function deletePhase(phaseId: string, jobId: string) {
  const ctx = await getSessionContext();
  if (!ctx) return;

  const supabase = await createClient();
  // Capture the label for the log BEFORE the row is gone, then delete and confirm
  // a row was actually removed (a read-only viewer's delete affects 0 rows).
  const { data: before } = await supabase
    .from("phases")
    .select("label")
    .eq("id", phaseId)
    .maybeSingle();
  const { data: deleted, error } = await supabase
    .from("phases")
    .delete()
    .eq("id", phaseId)
    .select("id");
  if (error || !deleted || deleted.length === 0) return;

  // phase_id is null: the FK would null it on delete anyway, and the phase no
  // longer exists to reference. The label in detail preserves the context.
  await logActivity({
    jobId,
    phaseId: null,
    eventType: "phase_deleted",
    actorMemberId: ctx.member.id,
    detail: { label: before?.label ?? null },
  });
  await revalidateJob(jobId);
}

/**
 * Moves a phase one slot up (-1) or down (+1) by swapping sequence_index with
 * its neighbor. Uses a temporary -1 to step around the unique(job_id,
 * sequence_index) constraint; self-healing if interrupted (re-run fixes it).
 */
export async function movePhase(
  phaseId: string,
  jobId: string,
  direction: -1 | 1,
) {
  const supabase = await createClient();

  const { data: current } = await supabase
    .from("phases")
    .select("id, sequence_index")
    .eq("id", phaseId)
    .maybeSingle();
  if (!current) return;

  const neighborQuery = supabase
    .from("phases")
    .select("id, sequence_index")
    .eq("job_id", jobId);
  const { data: neighbor } =
    direction < 0
      ? await neighborQuery
          .lt("sequence_index", current.sequence_index)
          .order("sequence_index", { ascending: false })
          .limit(1)
          .maybeSingle()
      : await neighborQuery
          .gt("sequence_index", current.sequence_index)
          .order("sequence_index", { ascending: true })
          .limit(1)
          .maybeSingle();
  if (!neighbor) return; // already at the edge

  await supabase.from("phases").update({ sequence_index: -1 }).eq("id", phaseId);
  await supabase
    .from("phases")
    .update({ sequence_index: current.sequence_index })
    .eq("id", neighbor.id);
  await supabase
    .from("phases")
    .update({ sequence_index: neighbor.sequence_index })
    .eq("id", phaseId);

  await revalidateJob(jobId);
}

// --- Crew (link-token participants) ---

/** Adds a participant and mints a 32-byte base64url invite token. */
export async function addParticipant(
  jobId: string,
  name: string,
  phone: string | null,
) {
  const n = name.trim();
  if (!n) return;

  const supabase = await createClient();
  const token = randomBytes(32).toString("base64url");
  await supabase.from("participants").insert({
    job_id: jobId,
    name: n,
    phone: phone?.trim() || null,
    invite_token: token,
  });
  await revalidateJob(jobId);
}

/** Revokes a participant's link (their token stops working immediately). */
export async function revokeParticipant(participantId: string, jobId: string) {
  const supabase = await createClient();
  await supabase
    .from("participants")
    .update({ revoked: true })
    .eq("id", participantId);
  await revalidateJob(jobId);
}

/** Assigns (or clears) the participant who may update a phase. */
/**
 * M-MULTI: toggles ONE crew assignment on a phase. `assigned=true` adds the
 * participant (up to the org's max_assignees_per_phase), false removes them.
 * Writes go to the phase_assignees junction — never the legacy
 * phases.assignee_participant_id column. RLS (can_access_job) decides who may
 * write; the DB trigger backstops the cap + cross-job integrity, so a stale or
 * hostile client can't overshoot either. Failures are silent no-ops (RLS denial
 * returns an error / zero rows, same treatment as every other member action).
 */
export async function setPhaseAssignee(
  phaseId: string,
  jobId: string,
  participantId: string,
  assigned: boolean,
) {
  const ctx = await getSessionContext();
  if (!ctx) return;

  const supabase = await createClient();
  if (assigned) {
    // The UI disables adding past the cap; re-check so a stale client is a
    // clean no-op before the trigger would reject it.
    const { count } = await supabase
      .from("phase_assignees")
      .select("participant_id", { count: "exact", head: true })
      .eq("phase_id", phaseId);
    if ((count ?? 0) >= ctx.org.max_assignees_per_phase) return;

    const { error } = await supabase.from("phase_assignees").insert({
      phase_id: phaseId,
      participant_id: participantId,
      job_id: jobId,
    });
    if (error) return; // RLS denial, duplicate re-tap, or trigger reject
  } else {
    const { data: deleted, error } = await supabase
      .from("phase_assignees")
      .delete()
      .eq("phase_id", phaseId)
      .eq("participant_id", participantId)
      .select("participant_id");
    if (error || !deleted || deleted.length === 0) return; // nothing to remove
  }

  // Human-readable log entry (RLS lets the writer read this job's crew names).
  const { data: pt } = await supabase
    .from("participants")
    .select("name")
    .eq("id", participantId)
    .maybeSingle();
  await logActivity({
    jobId,
    phaseId,
    eventType: "assignment_change",
    actorMemberId: ctx.member.id,
    detail: assigned
      ? { to: pt?.name ?? null }
      : { from: pt?.name ?? null },
  });
  await revalidateJob(jobId);
}

// --- Phase notes (M17) ---

/**
 * Adds a member note to a phase. author_member_id is set to the caller's own
 * membership; RLS (with check owns_member AND can_access_job) guarantees a member
 * can only author their OWN note on a job they can edit — a read-only viewer's
 * insert fails the policy and is a no-op.
 */
export async function addNote(jobId: string, phaseId: string, body: string) {
  const text = body.trim();
  if (!text) return;
  const ctx = await getSessionContext();
  if (!ctx) return;

  const supabase = await createClient();
  const { data: created, error } = await supabase
    .from("notes")
    .insert({
      phase_id: phaseId,
      job_id: jobId,
      author_member_id: ctx.member.id,
      body: text,
    })
    .select("id")
    .single();
  if (error || !created) return;

  await logActivity({
    jobId,
    phaseId,
    noteId: created.id,
    eventType: "note_added",
    actorMemberId: ctx.member.id,
  });
  await revalidateJob(jobId);
}

/** Edits a member's OWN note. RLS (owns_member) limits this to the author — an
 *  attempt on another's note updates 0 rows (no-op). */
export async function editNote(noteId: string, jobId: string, body: string) {
  const text = body.trim();
  if (!text) return;
  const ctx = await getSessionContext();
  if (!ctx) return;

  const supabase = await createClient();
  // .select("id, phase_id") both confirms the write landed (RLS no-op → 0 rows)
  // and gives the phase to group the log entry under.
  const { data: updated, error } = await supabase
    .from("notes")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .select("id, phase_id");
  if (error || !updated || updated.length === 0) return;

  await logActivity({
    jobId,
    phaseId: updated[0].phase_id as string,
    noteId,
    eventType: "note_edited",
    actorMemberId: ctx.member.id,
  });
  await revalidateJob(jobId);
}

/** Deletes a member's OWN note (RLS owns_member; no-op on another's note). */
export async function deleteNote(noteId: string, jobId: string) {
  const ctx = await getSessionContext();
  if (!ctx) return;

  const supabase = await createClient();
  // Capture the phase to group the log under, then delete and confirm a row went.
  const { data: before } = await supabase
    .from("notes")
    .select("phase_id")
    .eq("id", noteId)
    .maybeSingle();
  const { data: deleted, error } = await supabase
    .from("notes")
    .delete()
    .eq("id", noteId)
    .select("id");
  if (error || !deleted || deleted.length === 0) return;

  // note_id null (the note is gone — the FK would null it anyway); phase_id is kept
  // so the entry still shows under its phase's History.
  await logActivity({
    jobId,
    phaseId: (before?.phase_id as string | undefined) ?? null,
    noteId: null,
    eventType: "note_deleted",
    actorMemberId: ctx.member.id,
  });
  await revalidateJob(jobId);
}

// --- Photos (M22) ---
//
// Writes are SERVER-ONLY (photos has no authenticated write grant), so these
// actions ARE the authorization: a member may upload only on a job they can EDIT
// (their own, or the owner on a legacy null-salesman job) — mirroring purgeJob's
// canEdit gate. The org cap + MIME + size are re-checked here; client checks are
// advisory (AGENTS §5). Bytes go browser→R2 via the presigned PUT — never here.

async function memberJobForWrite(jobId: string) {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("id, org_id, salesman_member_id, deleted_at")
    .eq("id", jobId)
    .maybeSingle();
  if (!job || job.deleted_at) return null;
  const canEdit =
    job.salesman_member_id === ctx.member.id ||
    (ctx.isOwner && !job.salesman_member_id);
  if (!canEdit) return null;
  return { ctx, orgId: job.org_id as string };
}

/** Presign a browser→R2 upload after validating actor + MIME + size + count + cap. */
export async function createUploadUrl(
  input: CreateUploadInput & { jobId: string },
): Promise<CreateUploadResult> {
  if (!isR2Configured()) return { ok: false, error: "config" };
  const { jobId, phaseId, contentType, byteSize } = input;
  const found = await memberJobForWrite(jobId);
  if (!found) return { ok: false, error: "auth" };
  const { ctx, orgId } = found;

  if (!isAllowedImageType(contentType)) return { ok: false, error: "type" };
  if (!(byteSize > 0) || byteSize > MAX_PHOTO_BYTES) {
    return { ok: false, error: "size" };
  }

  const svc = createServiceClient();
  const { data: phase } = await svc
    .from("phases")
    .select("id, job_id")
    .eq("id", phaseId)
    .maybeSingle();
  if (!phase || phase.job_id !== jobId) return { ok: false, error: "phase" };

  const { count } = await svc
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("phase_id", phaseId);
  if ((count ?? 0) >= MAX_PHOTOS_PER_PHASE) return { ok: false, error: "count" };

  const used = await orgStorageUsedBytes(orgId);
  if (used + byteSize > storageCapBytes(ctx.org)) return { ok: false, error: "cap" };

  const uuid = randomUUID();
  const key = `org/${orgId}/job/${jobId}/${uuid}.jpg`;
  const thumbKey = `org/${orgId}/job/${jobId}/${uuid}_thumb.jpg`;
  const [uploadUrl, thumbUploadUrl] = await Promise.all([
    presignPutUrl(key, contentType),
    presignPutUrl(thumbKey, contentType),
  ]);
  return { ok: true, key, thumbKey, uploadUrl, thumbUploadUrl };
}

/** Record the metadata after the browser PUT, re-checking everything authoritatively. */
export async function confirmUpload(
  input: ConfirmUploadInput & { jobId: string },
): Promise<ConfirmUploadResult> {
  const { jobId, phaseId, statusContext, key, thumbKey, contentType, width, height } =
    input;
  const found = await memberJobForWrite(jobId);
  if (!found) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "auth" };
  }
  const { ctx, orgId } = found;

  // The key MUST live under this org/job — a client can't point a row at another
  // org's object.
  const prefix = `org/${orgId}/job/${jobId}/`;
  if (!key.startsWith(prefix) || (thumbKey && !thumbKey.startsWith(prefix))) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "auth" };
  }

  const svc = createServiceClient();
  const { data: phase } = await svc
    .from("phases")
    .select("id, job_id")
    .eq("id", phaseId)
    .maybeSingle();
  if (!phase || phase.job_id !== jobId) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "phase" };
  }

  // Authoritative size from R2 (defeats an under-declared byteSize).
  const size = await headObjectSize(key);
  if (size == null || size <= 0 || size > MAX_PHOTO_BYTES) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "size" };
  }
  // Re-check cap + per-phase count with the REAL size (a racing upload counts).
  if ((await orgStorageUsedBytes(orgId)) + size > storageCapBytes(ctx.org)) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "cap" };
  }
  const { count } = await svc
    .from("photos")
    .select("id", { count: "exact", head: true })
    .eq("phase_id", phaseId);
  if ((count ?? 0) >= MAX_PHOTOS_PER_PHASE) {
    await deleteObjects([key, thumbKey]);
    return { ok: false, error: "count" };
  }

  const { error } = await svc.from("photos").insert({
    job_id: jobId,
    phase_id: phaseId,
    org_id: orgId,
    status_context: statusContext,
    uploaded_by_member_id: ctx.member.id,
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
  await revalidateJob(jobId);
  return { ok: true };
}

// --- Archive ---

/** Archives a job (leaves the active list) and returns to the dashboard. */
export async function archiveJob(jobId: string) {
  const supabase = await createClient();
  await supabase.from("jobs").update({ status: "archived" }).eq("id", jobId);
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/** Restores an archived job to active. */
export async function unarchiveJob(jobId: string) {
  const supabase = await createClient();
  await supabase.from("jobs").update({ status: "active" }).eq("id", jobId);
  await revalidateJob(jobId);
}

// --- Soft-delete / restore / purge (M10) ---

/**
 * Soft-deletes a job (moves it to Trash). Mirrors archiveJob's enforcement: the
 * Delete control shows only when canEdit, and the jobs write RLS scopes the UPDATE
 * to the owner / owning salesman. Reversible via restoreJob — so, like archive, no
 * confirm. Refreshes the crew board too (its link goes inactive while trashed).
 */
export async function deleteJob(jobId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("jobs")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", jobId);
  if (error) return;
  revalidatePath("/dashboard");
  revalidatePath(`/j/${jobId}`);
  await broadcastJobChange(jobId);
  redirect("/dashboard");
}

/** Restores a trashed job (clears deleted_at; its prior status is untouched). */
export async function restoreJob(jobId: string) {
  const supabase = await createClient();
  await supabase.from("jobs").update({ deleted_at: null }).eq("id", jobId);
  revalidatePath("/dashboard");
  revalidatePath(`/j/${jobId}`);
  await broadcastJobChange(jobId);
}

/**
 * Permanently deletes a job — hard DELETE, cascading to phases/notes/participants/
 * activity_log via their ON DELETE CASCADE FKs (M22 will extend this to free the
 * job's R2 photos). Irreversible, so it re-checks canEdit server-side rather than
 * trusting the UI: the jobs write RLS would let the OWNER delete a salesman's job,
 * but R2 says the owner is read-only on jobs they don't own — so block that here.
 */
export async function purgeJob(jobId: string) {
  const ctx = await getSessionContext();
  if (!ctx) return;
  const supabase = await createClient();
  const { data: job } = await supabase
    .from("jobs")
    .select("salesman_member_id, org_id")
    .eq("id", jobId)
    .maybeSingle();
  if (!job) return;
  const canEdit =
    job.salesman_member_id === ctx.member.id ||
    (ctx.isOwner && !job.salesman_member_id);
  if (!canEdit) return;
  await supabase.from("jobs").delete().eq("id", jobId);
  // Free the job's R2 photos (the rows already cascade-deleted via job_id). M22.
  // Best-effort: a failure here leaves objects a prefix sweep can reclaim, but must
  // never block the purge.
  try {
    if (isR2Configured() && job.org_id) {
      await deleteByPrefix(`org/${job.org_id}/job/${jobId}/`);
    }
  } catch {
    // swallow — purge already committed; orphaned objects are reclaimable by prefix
  }
  revalidatePath("/dashboard");
}
