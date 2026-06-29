import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type {
  ActivityEvent,
  ActivityEventType,
  ActivityView,
} from "@/lib/types";

/**
 * M18 activity log — append + read.
 *
 * WRITE (logActivity): the log is APPEND-ONLY and SERVER-WRITTEN. `authenticated`
 * has no insert grant (a member write fails 42501 before RLS), so every row is
 * appended here via the service-role client, attributing the actor the app already
 * knows: a member id for owner/salesman writes, a participant id for crew writes
 * (two-sided, exactly like notes). Callers log only AFTER confirming their write
 * actually landed, so the log never records a no-op or RLS-denied attempt.
 *
 * READ (activityForJob): same shape as lib/notes.ts — a service-client read scoped
 * EXPLICITLY to the already-authorized job, resolving actor names (a salesman's RLS
 * can't read co-workers'/crew names directly). RLS remains the enforcement for
 * direct data-API access; this only assembles the display view.
 */
export async function logActivity({
  jobId,
  phaseId = null,
  noteId = null,
  eventType,
  actorMemberId = null,
  actorParticipantId = null,
  detail = {},
}: {
  jobId: string;
  phaseId?: string | null;
  noteId?: string | null;
  eventType: ActivityEventType;
  actorMemberId?: string | null;
  actorParticipantId?: string | null;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const svc = createServiceClient();
  await svc.from("activity_log").insert({
    job_id: jobId,
    phase_id: phaseId,
    note_id: noteId,
    event_type: eventType,
    actor_member_id: actorMemberId,
    actor_participant_id: actorParticipantId,
    detail,
  });
}

type NameRow = { id: string; name: string };

function viewOf(
  e: ActivityEvent,
  memberName: Map<string, string>,
  partName: Map<string, string>,
): ActivityView {
  return {
    id: e.id,
    phaseId: e.phase_id,
    eventType: e.event_type,
    actorName: e.actor_member_id
      ? (memberName.get(e.actor_member_id) ?? "—")
      : e.actor_participant_id
        ? (partName.get(e.actor_participant_id) ?? "—")
        : "—",
    actorType: e.actor_member_id
      ? "member"
      : e.actor_participant_id
        ? "crew"
        : "system",
    detail: e.detail ?? {},
    createdAt: e.created_at,
  };
}

/**
 * All activity on a job, grouped by phase id (ascending by time), for the History
 * disclosure + blocker-duration pill. Events whose phase_id was nulled by a delete
 * (e.g. phase_deleted) drop out of the per-phase grouping — there is no phase card
 * to show them under, by design (no global feed, AGENTS §7).
 */
export async function activityForJob(
  jobId: string,
  orgId: string,
): Promise<Record<string, ActivityView[]>> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("activity_log")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  const events = (data ?? []) as ActivityEvent[];
  if (events.length === 0) return {};

  const [members, participants] = await Promise.all([
    svc.from("org_members").select("id, name").eq("org_id", orgId),
    svc.from("participants").select("id, name").eq("job_id", jobId),
  ]);
  const memberName = new Map(
    ((members.data ?? []) as NameRow[]).map((m) => [m.id, m.name]),
  );
  const partName = new Map(
    ((participants.data ?? []) as NameRow[]).map((p) => [p.id, p.name]),
  );

  const out: Record<string, ActivityView[]> = {};
  for (const e of events) {
    if (!e.phase_id) continue; // deleted-phase rows have no card to live under
    (out[e.phase_id] ??= []).push(viewOf(e, memberName, partName));
  }
  return out;
}
