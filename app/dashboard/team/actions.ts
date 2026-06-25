"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { getSessionContext, countSalesmen } from "@/lib/membership";
import { sendSalesmanInvite } from "@/lib/invites";

/**
 * Owner invites a salesman by email. Creates a pending org_members row (user_id
 * null) that gets claimed on the salesman's first sign-in. Owner-gated; uses the
 * service-role client for the controlled membership write. No email is sent here
 * — the owner shares the normal sign-in link; the invite is matched by email.
 */
export async function inviteSalesman(formData: FormData) {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.isOwner) return;

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!name || !email) return;

  const svc = createServiceClient();
  // Idempotent on (org_id, lower(email)); ignore if they're already a member.
  const { data: existing } = await svc
    .from("org_members")
    .select("id")
    .eq("org_id", ctx.org.id)
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    revalidatePath("/dashboard/team");
    return;
  }

  // Seat cap (revenue-protection): an owner can't invite past their limit.
  const used = await countSalesmen(ctx.org.id);
  if (used >= ctx.org.salesman_seat_limit) {
    revalidatePath("/dashboard/team");
    return; // the Team page shows "seats full" when used >= limit
  }

  await svc.from("org_members").insert({
    org_id: ctx.org.id,
    email,
    name,
    role: "salesman",
  });

  // Email them a one-tap sign-in link — onboarding is hands-off for the owner.
  await sendSalesmanInvite(email, ctx.org.name);
  revalidatePath("/dashboard/team");
}

/** Owner removes a salesman from the org. Never removes the owner. */
export async function removeSalesman(memberId: string) {
  const ctx = await getSessionContext();
  if (!ctx || !ctx.isOwner) return;

  const svc = createServiceClient();
  await svc
    .from("org_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", ctx.org.id)
    .eq("role", "salesman");
  revalidatePath("/dashboard/team");
}
