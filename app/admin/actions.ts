"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/service";
import { sendSalesmanInvite } from "@/lib/invites";
import { isBusinessOwnerEmail } from "@/lib/access";
import { getStripe, schedulePromoToBase } from "@/lib/stripe";

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

/**
 * N2: flip an org's promo eligibility ("Trinity + one more only"). When true, a
 * Base checkout uses the $20×3mo promo price; existing subscriptions are NOT
 * touched here — that's the explicit retrofit button below.
 */
export async function setPromoEligible(orgId: string, value: boolean) {
  const svc = await guard();
  await svc
    .from("organizations")
    .update({ promo_eligible: value })
    .eq("id", orgId);
  revalidatePath("/admin");
}

/**
 * N2 retrofit: attach the promo→Base Subscription Schedule to an org's EXISTING
 * active promo-price subscription (Trinity signed before schedules existed).
 * Promo ends 3 months after their original subscription start; Stripe flips the
 * price itself. Idempotent — re-clicking reports the already-scheduled end.
 * No-ops (with a flag in the URL) if the org has no active promo-price sub.
 */
export async function schedulePromoTransition(orgId: string) {
  const svc = await guard();
  const { data: org } = await svc
    .from("organizations")
    .select("stripe_customer_id")
    .eq("id", orgId)
    .maybeSingle();
  if (!org?.stripe_customer_id) {
    revalidatePath("/admin");
    return;
  }

  const stripe = getStripe();
  const subs = await stripe.subscriptions.list({
    customer: org.stripe_customer_id,
    status: "active",
    limit: 1,
  });
  const sub = subs.data[0];
  if (!sub) {
    revalidatePath("/admin");
    return;
  }

  const promoEnd = await schedulePromoToBase(sub.id);
  if (promoEnd) {
    await svc
      .from("organizations")
      .update({ promo_ends_at: promoEnd.toISOString() })
      .eq("id", orgId);
  }
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

/**
 * Admin adds a salesman under an owner's org (for onboarding owners who'd rather
 * hand you the list). Same effect as the owner inviting from Team: respects the
 * seat cap and emails the salesman a sign-in link.
 */
export async function addSalesmanToOrg(orgId: string, formData: FormData) {
  const svc = await guard();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!name || !email) return;

  const { data: org } = await svc
    .from("organizations")
    .select("name, salesman_seat_limit, owner_email")
    .eq("id", orgId)
    .maybeSingle();
  if (!org) return;

  // Only an approved business owner's org can have salesmen. Mirrors the live
  // owner gate, so a forged request against a salesman/legacy account is refused
  // even though the UI already hides the form for it.
  if (!org.owner_email || !(await isBusinessOwnerEmail(org.owner_email))) {
    revalidatePath("/admin");
    return;
  }

  const { data: existing } = await svc
    .from("org_members")
    .select("id")
    .eq("org_id", orgId)
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    revalidatePath("/admin");
    return;
  }

  const { count } = await svc
    .from("org_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "salesman");
  if ((count ?? 0) >= org.salesman_seat_limit) {
    revalidatePath("/admin");
    return; // seat cap reached
  }

  await svc
    .from("org_members")
    .insert({ org_id: orgId, email, name, role: "salesman" });
  await sendSalesmanInvite(email, org.name);
  revalidatePath("/admin");
}
