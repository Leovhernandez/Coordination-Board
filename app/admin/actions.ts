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

export async function addOversight(formData: FormData) {
  const svc = await guard();
  const overseer = String(formData.get("overseer") ?? "").trim().toLowerCase();
  const gc = String(formData.get("gc") ?? "").trim().toLowerCase();
  if (!overseer || !gc || overseer === gc) return;
  await svc
    .from("company_oversight")
    .upsert({ overseer_email: overseer, gc_email: gc });
  revalidatePath("/admin");
}

export async function removeOversight(overseer: string, gc: string) {
  const svc = await guard();
  await svc
    .from("company_oversight")
    .delete()
    .eq("overseer_email", overseer)
    .eq("gc_email", gc);
  revalidatePath("/admin");
}
