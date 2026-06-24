import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization } from "@/lib/types";

const ORG_COLUMNS =
  "id, name, owner_user_id, owner_email, subscription_status, stripe_customer_id, trial_ends_at, salesman_seat_limit";

const TRIAL_DAYS = 14;

/**
 * Returns the signed-in owner, or redirects to /login. Uses getUser(), which
 * revalidates the token with the auth server (never trust getSession() for
 * authorization).
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The contractor owns exactly one org (created on first login). Returns it,
 * creating it if this is the first sign-in. Org name defaults to the email's
 * local part — there is no org settings screen in v1 (CLAUDE.md §7).
 */
export async function getOrCreateOrg(): Promise<Organization | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: existing } = await supabase
    .from("organizations")
    .select(ORG_COLUMNS)
    .eq("owner_user_id", user.id)
    .maybeSingle();
  if (existing) return existing as Organization;

  const defaultName = user.email?.split("@")[0] ?? "My Company";
  const isAdmin =
    !!process.env.ADMIN_EMAIL &&
    user.email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();

  // Admin (the operator) is comped/active; everyone else starts a finite trial
  // so access is enforced automatically without manual follow-up.
  const insertRow: {
    name: string;
    owner_user_id: string;
    owner_email: string | null;
    subscription_status?: string;
    trial_ends_at?: string;
  } = {
    name: defaultName,
    owner_user_id: user.id,
    owner_email: user.email ?? null,
  };
  if (isAdmin) {
    insertRow.subscription_status = "active";
  } else {
    insertRow.trial_ends_at = new Date(
      Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
  }

  const { data: created, error } = await supabase
    .from("organizations")
    .insert(insertRow)
    .select(ORG_COLUMNS)
    .single();

  if (error) {
    // A concurrent first request may have created it; fall back to a read.
    const { data: race } = await supabase
      .from("organizations")
      .select(ORG_COLUMNS)
      .eq("owner_user_id", user.id)
      .maybeSingle();
    return (race as Organization) ?? null;
  }
  return created as Organization;
}
