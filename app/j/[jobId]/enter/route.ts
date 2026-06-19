import { type NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  getParticipantByToken,
  participantCookieName,
} from "@/lib/participant";

/**
 * Entry point for an invite link. The board page redirects here when it sees
 * `?t=`. We validate the token, set an httpOnly job-scoped cookie (so the token
 * leaves the URL and isn't readable by JS), then redirect to the clean board
 * URL. Invalid/revoked tokens fall through to the board's "link not active".
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const jobId = url.pathname.split("/")[2]; // /j/{jobId}/enter

  const participant = await getParticipantByToken(jobId, token);
  if (!participant) {
    return NextResponse.redirect(new URL(`/j/${jobId}`, request.url));
  }

  const supabase = createServiceClient();
  await supabase
    .from("participants")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", participant.id);

  const res = NextResponse.redirect(new URL(`/j/${jobId}`, request.url));
  res.cookies.set(participantCookieName(jobId), token!, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/j/${jobId}`,
    maxAge: 60 * 60 * 24 * 180, // ~6 months; minimize re-auth friction
  });
  return res;
}
