import { type NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { deleteByPrefix, isR2Configured } from "@/lib/r2";

/**
 * Cancel-retention purge (daily cron; see vercel.json).
 *
 * On cancellation the Stripe webhook stamps organizations.canceled_at and emails
 * the owner a 30-day export notice. This route, run daily by Vercel Cron, finds
 * orgs canceled > 30 days ago and PERMANENTLY erases them:
 *   1. Frees the org's R2 media (all photos under org/<id>/).
 *   2. Hard-deletes the organizations row — cascades to jobs → phases/notes/
 *      participants/activity_log/photos and to org_members (ON DELETE CASCADE).
 *
 * IRREVERSIBLE. The WHERE clause is the hard guard: only subscription_status
 * 'canceled' AND canceled_at older than the retention window is ever selected —
 * active/trialing/past_due orgs are untouchable here. Access is gated by
 * CRON_SECRET (Vercel Cron sends `Authorization: Bearer $CRON_SECRET`); with no
 * secret set the route refuses every request rather than running open.
 *
 * Service-role only (AGENTS §5): runs with no user session; the service client is
 * server-only and RLS is bypassed by design for this maintenance job.
 */
export const runtime = "nodejs"; // needs node crypto + the R2 (aws-sdk) client
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // no secret configured → never run open
  const provided = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoffIso = new Date(Date.now() - RETENTION_MS).toISOString();

  const { data: orgs, error } = await supabase
    .from("organizations")
    .select("id, name, subscription_status, canceled_at")
    .eq("subscription_status", "canceled")
    .not("canceled_at", "is", null)
    .lt("canceled_at", cutoffIso);

  if (error) {
    console.error("[purge-canceled] candidate query failed:", error.message);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }

  const candidates = orgs ?? [];
  const purged: string[] = [];
  const failed: { id: string; reason: string }[] = [];

  for (const org of candidates) {
    // Defense-in-depth: re-assert the guard on each row, so a future query change
    // can never let an active/not-yet-expired org through.
    if (
      org.subscription_status !== "canceled" ||
      !org.canceled_at ||
      new Date(org.canceled_at).getTime() >= Date.now() - RETENTION_MS
    ) {
      continue;
    }

    try {
      // 1) Free R2 media FIRST. If this throws we skip the DB delete, leaving the
      //    org row for a retry next run — deleting the row first would orphan the
      //    objects with no record to find them by.
      if (isR2Configured()) {
        await deleteByPrefix(`org/${org.id}/`);
      }
      // 2) Hard-delete the org (cascades). The extra status guard defends against
      //    a reactivation racing between the select above and this delete.
      const { error: delErr } = await supabase
        .from("organizations")
        .delete()
        .eq("id", org.id)
        .eq("subscription_status", "canceled");
      if (delErr) throw new Error(delErr.message);
      purged.push(org.id);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`[purge-canceled] org ${org.id} failed:`, reason);
      failed.push({ id: org.id, reason });
    }
  }

  console.log(
    `[purge-canceled] purged ${purged.length}/${candidates.length} org(s); ${failed.length} failed`,
  );
  return NextResponse.json({
    ok: true,
    cutoff: cutoffIso,
    candidates: candidates.length,
    purged: purged.length,
    failed,
  });
}
