import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getOrCreateOrg } from "@/lib/auth";
import { isBusinessOwnerEmail } from "@/lib/access";
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
  "id, name, owner_user_id, owner_email, subscription_status, stripe_customer_id, trial_ends_at, salesman_seat_limit";

type Svc = ReturnType<typeof createServiceClient>;

/** A membership already linked to this auth user (existing owner or salesman). */
async function findLinkedMember(
  svc: Svc,
  userId: string,
): Promise<Member | null> {
  // A user could be linked to >1 org_members row (e.g. claimed an invite while
  // also holding a legacy self-org owner row), so don't use .maybeSingle() —
  // it errors on multiple rows. Owner rows first so a legacy owner row is the
  // stable pick; isOwner is still decided later by the live Owner List, not role.
  const { data } = await svc
    .from("org_members")
    .select(MEMBER_COLUMNS)
    .eq("user_id", userId)
    .order("role", { ascending: true })
    .limit(1);
  return ((data as Member[]) ?? [])[0] ?? null;
}

/**
 * Claim a pending salesman invite matching this email, linking it to the user.
 * Service-role because a pending row (user_id null) isn't readable under the
 * invitee's own RLS. Safe: matched strictly on the verified email.
 */
async function claimPendingInvite(
  svc: Svc,
  userId: string,
  email: string,
): Promise<Member | null> {
  // An email may have pending invites in several orgs; claim the first (don't
  // use .maybeSingle(), which errors on >1 row). One person = one active org
  // membership in this model, so a single claim is correct.
  const { data: pendingRows } = await svc
    .from("org_members")
    .select(MEMBER_COLUMNS)
    .is("user_id", null)
    .ilike("email", email)
    .limit(1);
  const pending = ((pendingRows as Member[]) ?? [])[0];
  if (!pending) return null;
  const { data: claimed } = await svc
    .from("org_members")
    .update({ user_id: userId })
    .eq("id", pending.id)
    .select(MEMBER_COLUMNS)
    .single();
  return (claimed as Member) ?? pending;
}

/**
 * Build the session context for a NON-owner membership (salesman, or a legacy
 * self-org account that is no longer an approved owner). Owners are resolved
 * earlier in getSessionContext from the live Owner List, so isOwner is always
 * false here — the stored member.role is never trusted to grant owner powers.
 */
async function contextFor(
  svc: Svc,
  userId: string,
  email: string | null,
  member: Member,
): Promise<SessionContext | null> {
  const { data: org } = await svc
    .from("organizations")
    .select(ORG_COLUMNS)
    .eq("id", member.org_id)
    .maybeSingle();
  if (!org) return null;
  return {
    userId,
    email,
    org: org as Organization,
    member,
    isOwner: false,
  };
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
 * The signed-in user's org + membership, resolved in priority order:
 *  1. business owner (admin OR on the admin Owner List) → owner of their OWN org.
 *     Checked FIRST and computed live from the Owner List, so it OUTRANKS any
 *     salesman membership (an approved owner is never captured into another org)
 *     and reflects Owner-List add/remove on the next page load. The ONLY path
 *     that sets isOwner = true.
 *  2. already a member (a salesman linked on a prior sign-in, or a legacy
 *     self-org account that is no longer an approved owner) → their org, as a
 *     non-owner. The stored role is not trusted to grant owner powers.
 *  3. invited salesman, first sign-in → claim the invite, salesman of that org.
 *  4. otherwise (signed in but neither approved nor invited) → null (no access).
 * Returns null if not signed in OR if the user has no access.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const svc = createServiceClient();
  const email = user.email ?? null;

  // 1. Owner precedence (live, admin-granted only). This is the sole source of
  //    owner status — see lib/access.ts isBusinessOwnerEmail.
  if (email && (await isBusinessOwnerEmail(email))) {
    const org = await getOrCreateOrg();
    if (!org) return null;
    const member = await ensureOwnerMember(svc, org, user.id, email);
    return { userId: user.id, email, org, member, isOwner: true };
  }

  // 2. Already a member, but NOT an approved owner → non-owner context.
  const linked = await findLinkedMember(svc, user.id);
  if (linked) return contextFor(svc, user.id, email, linked);

  // 3. Invited salesman → claim on first sign-in.
  if (email) {
    const claimed = await claimPendingInvite(svc, user.id, email);
    if (claimed) return contextFor(svc, user.id, email, claimed);
  }

  // 4. No access.
  return null;
}

/** Count active salesmen in an org (for the per-org seat cap). */
export async function countSalesmen(orgId: string): Promise<number> {
  const svc = createServiceClient();
  const { count } = await svc
    .from("org_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "salesman");
  return count ?? 0;
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
