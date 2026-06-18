"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateOrg } from "@/lib/auth";
import { DEFAULT_PHASES } from "@/lib/phases";

/**
 * Creates a job in the owner's org and auto-seeds the default trade phases in
 * sequence. RLS guarantees the job/phases land only in the caller's own org.
 * (M2-grade: silent early-return on bad input/failure; the form's `required`
 * attribute prevents empty names. Inline error UX can come with the board.)
 */
export async function createJob(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const address = String(formData.get("address") ?? "").trim() || null;
  const customerName = String(formData.get("customer_name") ?? "").trim() || null;

  const org = await getOrCreateOrg();
  if (!org) return;

  const supabase = await createClient();
  const { data: job, error } = await supabase
    .from("jobs")
    .insert({ org_id: org.id, name, address, customer_name: customerName })
    .select("id")
    .single();
  if (error || !job) return;

  const phaseRows = DEFAULT_PHASES.map((label, i) => ({
    job_id: job.id,
    label,
    sequence_index: i,
  }));
  await supabase.from("phases").insert(phaseRows);

  revalidatePath("/dashboard");
}
