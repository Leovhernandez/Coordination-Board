"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";

async function guard() {
  await requireAdmin();
  return createServiceClient();
}

/** Sets/extends an org's trial. days=null → unlimited (comped); 0 → ended now. */
export async function setTrialDays(orgId: string, days: number | null) {
  const svc = await guard();
  const trial_ends_at =
    days === null ? null : new Date(Date.now() + days * 86400000).toISOString();
  await svc
    .from("organizations")
    .update({ trial_ends_at, subscription_status: "trialing" })
    .eq("id", orgId);
  revalidatePath("/admin");
}

export async function setOrgStatus(orgId: string, status: string) {
  const svc = await guard();
  await svc
    .from("organizations")
    .update({ subscription_status: status })
    .eq("id", orgId);
  revalidatePath("/admin");
}

export async function addAllowedEmail(formData: FormData) {
  const svc = await guard();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) return;
  await svc.from("allowed_emails").upsert({ email });
  revalidatePath("/admin");
}

export async function removeAllowedEmail(email: string) {
  const svc = await guard();
  await svc.from("allowed_emails").delete().eq("email", email);
  revalidatePath("/admin");
}

/**
 * Permanently delete an account (org) and everything under it — jobs, phases,
 * participants, and members all cascade. For clearing test/abandoned businesses
 * so the Accounts list doesn't grow forever. Admin-only; the UI confirms first.
 */
export async function deleteAccount(orgId: string) {
  const svc = await guard();
  await svc.from("organizations").delete().eq("id", orgId);
  revalidatePath("/admin");
}
