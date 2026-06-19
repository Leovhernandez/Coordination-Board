"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PhaseStatus } from "@/lib/types";

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

  revalidatePath(`/jobs/${jobId}`);
  revalidatePath("/dashboard");
}
