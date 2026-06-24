import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getOrCreateOrg } from "@/lib/auth";
import type { Organization } from "@/lib/types";

/**
 * Multi-seat membership (M14). One org has one OWNER + many SALESMAN members who
 * share a crew pool and one subscription. Every member (owner included) has an
 * org_members row. Salesmen are invited by email and linked to their org on
 * first sign-in.
 */
export type OrgRole = "owner" | "salesman";

export type Member = {
  id: string;
  org_id: string;
  user_id: string | null;
  role: OrgRole;
  name: string;
  email: string;
};

export type SessionContext = {
  userId: string;
  email: string | null;
  org: Organization;
  member: Member;
  isOwner: boolean;
};

const MEMBER_COLUMNS = "id, org_id, user_id, role, name, email";
const ORG_COLUMNS =
  "id, name, owner_user_id, owner_email, subscription_status, stripe_customer_id, trial_ends_at";

type Svc = ReturnType<typeof createServiceClient>;

/**
 * Resolve the caller's membership, claiming a pending invite on first sign-in.
 * Uses the service-role client because a pending invite row (user_id null) is
 * not readable under the member's own RLS. Safe: we match strictly on the
 * authenticated user's verified email.
 */
async function resolveMember(
  svc: Svc,
  userId: string,
  email: string | null,
): Promise<Member | null> {
  const { data: linked } = await svc
    .from("org_members")
    .select(MEMBER_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (linked) return linked as Member;

  if (!email) return null;
  const { data: pending } = await svc
    .from("org_members")
    .select(MEMBER_COLUMNS)
    .is("user_id", null)
    .ilike("email", email)
    .maybeSingle();
  if (!pending) return null;

  const { data: claimed } = await svc
    .from("org_members")
    .update({ user_id: userId })
    .eq("id", (pending as Member).id)
    .select(MEMBER_COLUMNS)
    .single();
  return (claimed as Member) ?? (pending as Member);
}

/** Ensure the owner of a (possibly brand-new) org has an owner membership row. */
async function ensureOwnerMember(
  svc: Svc,
  org: Organization,
  userId: string,
  email: string | null,
): Promise<Member> {
  const { data: existing } = await svc
    .from("org_members")
    .select(MEMBER_COLUMNS)
    .eq("org_id", org.id)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return existing as Member;

  const { data: created } = await svc
    .from("org_members")
    .insert({
      org_id: org.id,
      user_id: userId,
      email: email ?? "owner@unknown",
      name: email?.split("@")[0] ?? "Owner",
      role: "owner",
    })
    .select(MEMBER_COLUMNS)
    .single();
  return created as Member;
}

/**
 * The signed-in user's org + membership. Three cases:
 *  - existing member (owner or salesman) → their org
 *  - invited salesman, first sign-in → claim the invite, their org
 *  - brand-new user → create their own org and become its owner
 * Returns null if not signed in.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const svc = createServiceClient();
  const member = await resolveMember(svc, user.id, user.email ?? null);

  if (member) {
    const { data: org } = await svc
      .from("organizations")
      .select(ORG_COLUMNS)
      .eq("id", member.org_id)
      .maybeSingle();
    if (!org) return null;
    return {
      userId: user.id,
      email: user.email ?? null,
      org: org as Organization,
      member,
      isOwner: member.role === "owner",
    };
  }

  // Brand-new user → owner of a fresh org (reuses the trial/admin logic).
  const org = await getOrCreateOrg();
  if (!org) return null;
  const ownerMember = await ensureOwnerMember(
    svc,
    org,
    user.id,
    user.email ?? null,
  );
  return {
    userId: user.id,
    email: user.email ?? null,
    org,
    member: ownerMember,
    isOwner: true,
  };
}

/** Owner-only: list the org's members (owner first, then salesmen by name). */
export async function listMembers(orgId: string): Promise<Member[]> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("org_members")
    .select(MEMBER_COLUMNS)
    .eq("org_id", orgId)
    .order("role", { ascending: true })
    .order("name", { ascending: true });
  return (data ?? []) as Member[];
}
