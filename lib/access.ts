import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { isAdminEmail } from "@/lib/admin";

/**
 * Access control for the multi-seat model (M14).
 *
 * BUSINESS OWNER = the admin, or an email the admin has approved (the Owner List
 * / allowed_emails). That is the SOLE source of truth — only the admin grants
 * owner status. We deliberately do NOT grandfather "an org already exists with
 * this owner_email", because that let a removed/stale account keep owner powers
 * forever (Team, Billing, inviting salesmen) regardless of the Owner List. Owner
 * status is therefore live: add/remove an email in the admin Owner List and it
 * takes effect on that user's next page load.
 *
 * Only business owners get an org + the Team/Billing screens. A SALESMAN is
 * invited by a business owner (an org_members row) and may sign in on the
 * strength of that invite alone — they never get owner powers.
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
  return !!allowed;
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
