"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { broadcastJobChange } from "@/lib/realtime";
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

  const supabase = await createClient();
  const { error } = await supabase
    .from("phases")
    .update({
      status,
      blocked_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", phaseId);
  if (error) return;

  await revalidateJob(jobId);
}

/** Appends a new phase to the end of the job's sequence. */
export async function addPhase(jobId: string, label: string) {
  const name = label.trim();
  if (!name) return;

  const supabase = await createClient();
  const { data: last } = await supabase
    .from("phases")
    .select("sequence_index")
    .eq("job_id", jobId)
    .order("sequence_index", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextIndex = (last?.sequence_index ?? -1) + 1;

  await supabase
    .from("phases")
    .insert({ job_id: jobId, label: name, sequence_index: nextIndex });
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

  const supabase = await createClient();
  await supabase.from("phases").update({ label: name }).eq("id", phaseId);
  await revalidateJob(jobId);
}

/** Deletes a phase. Gaps in sequence_index are fine (display numbers by position). */
export async function deletePhase(phaseId: string, jobId: string) {
  const supabase = await createClient();
  await supabase.from("phases").delete().eq("id", phaseId);
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
  const supabase = await createClient();
  await supabase
    .from("phases")
    .update({ assignee_participant_id: participantId })
    .eq("id", phaseId);
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
