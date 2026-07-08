import "server-only";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

// Server-side helpers for link-token participants (NOT Supabase auth users).
// The invite_token is the bearer credential; we validate it against a
// non-revoked participants row scoped to the job before any read/write.
//
// M-CLAIM device binding: the token alone is no longer enough. The FIRST device
// to open the link claims it (the enter route mints a device secret → httpOnly
// cookie; only its sha-256 hash is stored). Reads AND writes then require the
// matching claim cookie — an issuer pasting the raw URL into another browser is
// fully blocked. Exception: a session signed in as ADMIN_EMAIL (the platform
// operator's test account) may act without claiming, and its actions carry an
// {"adminTest": true} History marker.

export type ValidatedParticipant = {
  id: string;
  job_id: string;
  name: string;
  /** sha-256 hash of the claiming device's secret; null = not yet claimed. */
  claim_secret_hash: string | null;
};

export type VerifiedParticipant = {
  id: string;
  job_id: string;
  name: string;
  /** True when access is via the ADMIN_EMAIL test bypass (logged in History). */
  adminTest: boolean;
  /** True when the link is not yet claimed (legacy-cookie grace — the board
   *  page redirects through /enter to claim it for the current device). */
  unclaimed: boolean;
};

/** Cookie name holding a participant's token, scoped per job. */
export function participantCookieName(jobId: string): string {
  return `cb_pt_${jobId}`;
}

/** Cookie name holding this device's claim secret, scoped per job (M-CLAIM). */
export function claimCookieName(jobId: string): string {
  return `cb_pc_${jobId}`;
}

/** sha-256 hex of a claim secret — only the hash is ever stored server-side. */
export function hashClaimSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

/** True when the current request carries a signed-in ADMIN_EMAIL session. */
export async function isAdminSession(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdminEmail(user?.email);
}

/** Resolves a token to a non-revoked participant on this job, or null. */
export async function getParticipantByToken(
  jobId: string,
  token: string | undefined | null,
): Promise<ValidatedParticipant | null> {
  if (!token) return null;
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("participants")
    .select("id, job_id, name, claim_secret_hash")
    .eq("job_id", jobId)
    .eq("invite_token", token)
    .eq("revoked", false)
    .maybeSingle();
  return (data as ValidatedParticipant) ?? null;
}

/**
 * The M-CLAIM gate every crew read/write goes through. Verifies, in order:
 *   1. the httpOnly token cookie resolves to a non-revoked participant;
 *   2. the device holds the claim cookie whose hash matches the stored one
 *      (or the link is still unclaimed — legacy grace; the page then routes
 *      through /enter so THIS device claims it);
 *   3. otherwise, an ADMIN_EMAIL session may proceed as a logged test bypass.
 * Returns null when none hold — the caller treats it exactly like a missing/
 * revoked token (silent no-op / "link not active").
 */
export async function getVerifiedParticipant(
  jobId: string,
): Promise<VerifiedParticipant | null> {
  const jar = await cookies();
  const token = jar.get(participantCookieName(jobId))?.value;
  const participant = await getParticipantByToken(jobId, token);
  if (!participant) return null;

  const base = {
    id: participant.id,
    job_id: participant.job_id,
    name: participant.name,
  };

  if (!participant.claim_secret_hash) {
    return { ...base, adminTest: false, unclaimed: true };
  }
  const secret = jar.get(claimCookieName(jobId))?.value;
  if (secret && hashClaimSecret(secret) === participant.claim_secret_hash) {
    return { ...base, adminTest: false, unclaimed: false };
  }
  if (await isAdminSession()) {
    return { ...base, adminTest: true, unclaimed: false };
  }
  return null;
}

/** Builds the shareable invite link the owner texts to a sub. */
export function participantLink(jobId: string, token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return `${base}/j/${jobId}?t=${token}`;
}
