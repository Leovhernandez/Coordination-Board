import { randomBytes } from "crypto";
import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  claimCookieName,
  getParticipantByToken,
  hashClaimSecret,
  isAdminSession,
  participantCookieName,
} from "@/lib/participant";
import { logActivity } from "@/lib/activity";
import { broadcastJobChange } from "@/lib/realtime";

/**
 * Entry point for an invite link. The board page redirects here when it sees
 * `?t=`. We validate the token, set an httpOnly job-scoped cookie (so the token
 * leaves the URL and isn't readable by JS), then redirect to the clean board
 * URL. Invalid/revoked tokens fall through to the board's "link not active".
 *
 * M-CLAIM device binding: the FIRST device to arrive claims the link — a random
 * device secret goes into a second httpOnly cookie; only its sha-256 hash is
 * stored on the participants row, and the claim is logged (append-only, so a
 * claim that predates the crew receiving the text is self-evident). A later
 * open of the raw URL on a DIFFERENT device gets no cookies and bounces to the
 * board's "link already in use" state — the owning member resets the link if
 * the crew member genuinely changed devices. An ADMIN_EMAIL session bypasses
 * without claiming (never burns the crew's real first open).
 */

const COOKIE_OPTS = (jobId: string) =>
  ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/j/${jobId}`,
    maxAge: 60 * 60 * 24 * 180, // ~6 months; minimize re-auth friction
  }) as const;

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const jobId = url.pathname.split("/")[2]; // /j/{jobId}/enter

  const participant = await getParticipantByToken(jobId, token);
  if (!participant) {
    return NextResponse.redirect(new URL(`/j/${jobId}`, request.url));
  }

  const supabase = createServiceClient();
  const boardUrl = new URL(`/j/${jobId}`, request.url);

  // Platform-admin test bypass: enter without claiming, so the crew member's
  // real first open still performs the claim.
  if (await isAdminSession()) {
    const res = NextResponse.redirect(boardUrl);
    res.cookies.set(participantCookieName(jobId), token!, COOKIE_OPTS(jobId));
    return res;
  }

  if (!participant.claim_secret_hash) {
    // Unclaimed → THIS device claims it. Guard the update on the hash still
    // being null so two racing first-opens can't both claim (the second one
    // loses and falls through to the in-use path).
    const secret = randomBytes(32).toString("base64url");
    const { data: claimed } = await supabase
      .from("participants")
      .update({
        claim_secret_hash: hashClaimSecret(secret),
        claimed_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      })
      .eq("id", participant.id)
      .is("claim_secret_hash", null)
      .select("id");
    if (claimed && claimed.length === 1) {
      await logActivity({
        jobId,
        eventType: "link_claimed",
        actorParticipantId: participant.id,
        detail: { name: participant.name },
      });
      // Broadcast so the owner's open Crew panel flips "Not opened yet" →
      // "In use since {date}" live via the broadcast path too (§6: the claim
      // is a data-bearing change another session may be watching).
      await broadcastJobChange(jobId);
      const res = NextResponse.redirect(boardUrl);
      res.cookies.set(participantCookieName(jobId), token!, COOKIE_OPTS(jobId));
      res.cookies.set(claimCookieName(jobId), secret, COOKIE_OPTS(jobId));
      return res;
    }
    // Lost the race — another device claimed between read and update.
    boardUrl.searchParams.set("inuse", "1");
    return NextResponse.redirect(boardUrl);
  }

  // Already claimed: only the claiming device (matching claim cookie) re-enters.
  const existing = request.cookies.get(claimCookieName(jobId))?.value;
  if (existing && hashClaimSecret(existing) === participant.claim_secret_hash) {
    await supabase
      .from("participants")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", participant.id);
    const res = NextResponse.redirect(boardUrl);
    res.cookies.set(participantCookieName(jobId), token!, COOKIE_OPTS(jobId));
    return res;
  }

  // Claimed by a different device: full block (reads too — notes carry gate
  // codes). No cookies are set or cleared; the board shows "link in use".
  boardUrl.searchParams.set("inuse", "1");
  return NextResponse.redirect(boardUrl);
}
