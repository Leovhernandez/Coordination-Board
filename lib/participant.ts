import "server-only";
import { createServiceClient } from "@/lib/supabase/service";

// Server-side helpers for link-token participants (NOT Supabase auth users).
// The invite_token is the bearer credential; we validate it against a
// non-revoked participants row scoped to the job before any read/write.

export type ValidatedParticipant = {
  id: string;
  job_id: string;
  name: string;
};

/** Cookie name holding a participant's token, scoped per job. */
export function participantCookieName(jobId: string): string {
  return `cb_pt_${jobId}`;
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
    .select("id, job_id, name")
    .eq("job_id", jobId)
    .eq("invite_token", token)
    .eq("revoked", false)
    .maybeSingle();
  return (data as ValidatedParticipant) ?? null;
}

/** Builds the shareable invite link the owner texts to a sub. */
export function participantLink(jobId: string, token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  return `${base}/j/${jobId}?t=${token}`;
}
