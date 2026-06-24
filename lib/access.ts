import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/admin";

/**
 * Access control for the multi-seat model (M14).
 *
 * BUSINESS OWNER = an email the admin has approved (the allowlist), or the admin
 * itself, or an email that already owns an org (existing owners aren't locked
 * out). Only business owners get an org + the Team screen. This is what stops an
 * owner from spinning up a second, free business — only the admin grants owner
 * status.
 *
 * A SALESMAN is invited by a business owner (an org_members row) and may sign in
 * on the strength of that invite alone — they never get owner powers.
 */
export async function isBusinessOwnerEmail(email: string): Promise<boolean> {
  if (isAdminEmail(email)) return true;
  const e = email.trim().toLowerCase();
  if (!e) return false;

  const svc = createServiceClient();
  const { data: allowed } = await svc
    .from("allowed_emails")
    .select("email")
    .eq("email", e)
    .maybeSingle();
  if (allowed) return true;

  // Existing owner (signed up before owner-gating) — don't lock them out.
  const { data: org } = await svc
    .from("organizations")
    .select("id")
    .ilike("owner_email", e)
    .maybeSingle();
  return !!org;
}

/**
 * Who may request a sign-in link: business owners (above) OR anyone with a
 * pending/active salesman invite. Everyone else is turned away at the door, so
 * an unapproved, uninvited stranger never even gets a session.
 */
export async function isSignInAllowed(email: string): Promise<boolean> {
  if (await isBusinessOwnerEmail(email)) return true;

  const svc = createServiceClient();
  const { data: invite } = await svc
    .from("org_members")
    .select("id")
    .ilike("email", email.trim().toLowerCase())
    .maybeSingle();
  return !!invite;
}
