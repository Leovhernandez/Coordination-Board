import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Organization } from "@/lib/types";

const ORG_COLUMNS = "id, name, owner_user_id, subscription_status";

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
  const { data: created, error } = await supabase
    .from("organizations")
    .insert({ name: defaultName, owner_user_id: user.id })
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
