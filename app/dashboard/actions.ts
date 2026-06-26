"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionContext } from "@/lib/membership";
import { isAccessAllowed } from "@/lib/stripe";
import { DEFAULT_PHASES } from "@/lib/phases";
import { cleanMemberName } from "@/lib/names";

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

  const ctx = await getSessionContext();
  if (!ctx) return;
  const { org, member } = ctx;

  // Billing gate: active, or trialing within the trial window (M8/M8.5).
  if (!isAccessAllowed(org.subscription_status, org.trial_ends_at)) {
    redirect("/billing");
  }

  const supabase = await createClient();
  // Stamp the creating member so multi-seat RLS scopes the job to its salesman
  // (the owner sees all org jobs; a salesman sees only the ones they created).
  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      org_id: org.id,
      name,
      address,
      customer_name: customerName,
      salesman_member_id: member.id,
    })
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

/** Renames the owner's organization (the name shown on the dashboard). */
export async function renameOrg(name: string) {
  const n = name.trim();
  if (!n) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("organizations")
    .update({ name: n })
    .eq("owner_user_id", user.id);
  revalidatePath("/dashboard");
}

/**
 * A salesman renames their OWN account (the name the owner sees over their jobs
 * in the roll-up). Letter-only. Writes only the caller's own org_members row via
 * the service client — there's no member-self UPDATE RLS policy, and we scope
 * strictly to ctx.member.id so a salesman can never touch another member.
 */
export async function renameMember(name: string) {
  const cleaned = cleanMemberName(name).trim();
  if (!cleaned) return;

  const ctx = await getSessionContext();
  if (!ctx) return;

  const svc = createServiceClient();
  await svc
    .from("org_members")
    .update({ name: cleaned })
    .eq("id", ctx.member.id);
  revalidatePath("/dashboard");
}
