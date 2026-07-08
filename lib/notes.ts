import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { Note, NoteView } from "@/lib/types";

/**
 * M17 note loaders. Reads run through the service client scoped EXPLICITLY to the
 * already-authorized job (the caller proved access before calling: the job board
 * verified org membership via RLS; the participant page validated the invite
 * token). Author names need the service client anyway — a salesman's RLS lets it
 * read only its OWN org_members/participants rows, not co-workers' or crew names.
 * The RLS policies remain the enforcement for direct data-API access and ALL
 * writes; these helpers only assemble the display view.
 */

type NameRow = { id: string; name: string };

function viewOf(
  n: Note,
  memberName: Map<string, string>,
  partName: Map<string, string>,
  canEdit: boolean,
): NoteView {
  return {
    id: n.id,
    phaseId: n.phase_id,
    body: n.body,
    authorName: n.author_member_id
      ? (memberName.get(n.author_member_id) ?? "—")
      : (partName.get(n.author_participant_id ?? "") ?? "—"),
    authorType: n.author_member_id ? "member" : "crew",
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    canEdit,
  };
}

function groupByPhase(views: NoteView[]): Record<string, NoteView[]> {
  const out: Record<string, NoteView[]> = {};
  for (const v of views) (out[v.phaseId] ??= []).push(v);
  return out;
}

/**
 * All notes on a job, grouped by phase, for an authenticated MEMBER (owner or
 * salesman). Every org member reads every note (member- AND crew-authored);
 * canEdit is true only for the viewer's OWN member notes (mirrors RLS: edit own
 * only — not even the owner edits another's note).
 */
export async function notesForJob(
  jobId: string,
  orgId: string,
  viewerMemberId: string,
): Promise<Record<string, NoteView[]>> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("notes")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  const notes = (data ?? []) as Note[];
  if (notes.length === 0) return {};

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

  return groupByPhase(
    notes.map((n) =>
      viewOf(
        n,
        memberName,
        partName,
        n.author_member_id != null && n.author_member_id === viewerMemberId,
      ),
    ),
  );
}

/**
 * Notes a crew PARTICIPANT may see: on phases assigned to them only —
 * member-authored notes plus ALL crew notes on those phases (M-MULTI: co-assignees
 * on a shared phase read each other's notes; a since-unassigned author's note
 * stays visible for context). canEdit is true only for THEIR OWN notes (the M17
 * "no one edits another's note" rule — mirrored by the token-scoped actions).
 * Scope stays strictly the assigned phase ids: notes on other phases never leave
 * the server.
 */
export async function notesForParticipant(
  jobId: string,
  orgId: string,
  participantId: string,
  phaseIds: string[],
): Promise<Record<string, NoteView[]>> {
  if (phaseIds.length === 0) return {};
  const svc = createServiceClient();
  const { data } = await svc
    .from("notes")
    .select("*")
    .eq("job_id", jobId)
    .in("phase_id", phaseIds)
    .order("created_at", { ascending: true });
  const notes = (data ?? []) as Note[];
  if (notes.length === 0) return {};

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

  return groupByPhase(
    notes.map((n) =>
      viewOf(
        n,
        memberName,
        partName,
        n.author_participant_id != null &&
          n.author_participant_id === participantId,
      ),
    ),
  );
}
