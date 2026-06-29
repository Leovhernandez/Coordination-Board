"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/membership";
import { broadcastJobChange } from "@/lib/realtime";
import { logActivity } from "@/lib/activity";
import type { PhaseStatus } from "@/lib/types";

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
export async function assignPhase(
  phaseId: string,
  jobId: string,
  participantId: string | null,
) {
  const ctx = await getSessionContext();
  if (!ctx) return;

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("phases")
    .select("assignee_participant_id")
    .eq("id", phaseId)
    .maybeSingle();
  const fromId = before?.assignee_participant_id ?? null;

  const { data: updated, error } = await supabase
    .from("phases")
    .update({ assignee_participant_id: participantId })
    .eq("id", phaseId)
    .select("id");
  if (error || !updated || updated.length === 0) return;

  if (fromId !== participantId) {
    // Resolve participant ids → names for a human-readable log entry.
    const ids = [fromId, participantId].filter((x): x is string => !!x);
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data } = await supabase
        .from("participants")
        .select("id, name")
        .in("id", ids);
      for (const r of (data ?? []) as { id: string; name: string }[]) {
        names.set(r.id, r.name);
      }
    }
    await logActivity({
      jobId,
      phaseId,
      eventType: "assignment_change",
      actorMemberId: ctx.member.id,
      detail: {
        from: fromId ? (names.get(fromId) ?? null) : null,
        to: participantId ? (names.get(participantId) ?? null) : null,
      },
    });
  }
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
