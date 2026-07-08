import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { r2PublicUrl } from "@/lib/r2";
import type { Photo, PhotoView } from "@/lib/types";

/**
 * M22 photo loaders + cap accounting. Mirrors lib/notes.ts: a service-client read
 * scoped EXPLICITLY to the already-authorized job (the caller proved access — the
 * member board via RLS, the participant page via the invite token), resolving
 * uploader names (a salesman's own RLS can't read co-workers'/crew names). RLS
 * remains the enforcement for direct data-API access + all writes; these helpers
 * only assemble the display view + the cap total.
 */

type NameRow = { id: string; name: string };

function viewOf(
  p: Photo,
  memberName: Map<string, string>,
  partName: Map<string, string>,
): PhotoView {
  return {
    id: p.id,
    phaseId: p.phase_id,
    url: r2PublicUrl(p.r2_key),
    thumbUrl: r2PublicUrl(p.thumb_key ?? p.r2_key),
    uploaderName: p.uploaded_by_member_id
      ? (memberName.get(p.uploaded_by_member_id) ?? "—")
      : p.uploaded_by_participant_id
        ? (partName.get(p.uploaded_by_participant_id) ?? "—")
        : "—",
    uploaderType: p.uploaded_by_member_id
      ? "member"
      : p.uploaded_by_participant_id
        ? "crew"
        : "system",
    statusContext: p.status_context,
    width: p.width,
    height: p.height,
    createdAt: p.created_at,
  };
}

function groupByPhase(views: PhotoView[]): Record<string, PhotoView[]> {
  const out: Record<string, PhotoView[]> = {};
  for (const v of views) {
    if (!v.phaseId) continue; // a photo orphaned by phase delete has no card to live under
    (out[v.phaseId] ??= []).push(v);
  }
  return out;
}

async function nameMaps(svc: ReturnType<typeof createServiceClient>, orgId: string, jobId: string) {
  const [members, participants] = await Promise.all([
    svc.from("org_members").select("id, name").eq("org_id", orgId),
    svc.from("participants").select("id, name").eq("job_id", jobId),
  ]);
  return {
    memberName: new Map(((members.data ?? []) as NameRow[]).map((m) => [m.id, m.name])),
    partName: new Map(((participants.data ?? []) as NameRow[]).map((p) => [p.id, p.name])),
  };
}

/** All photos on a job, grouped by phase, for an authenticated MEMBER (org-wide read). */
export async function photosForJob(
  jobId: string,
  orgId: string,
): Promise<Record<string, PhotoView[]>> {
  const svc = createServiceClient();
  const { data } = await svc
    .from("photos")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true });
  const photos = (data ?? []) as Photo[];
  if (photos.length === 0) return {};
  const { memberName, partName } = await nameMaps(svc, orgId, jobId);
  return groupByPhase(photos.map((p) => viewOf(p, memberName, partName)));
}

/**
 * Photos a crew PARTICIPANT may see: on phases assigned to them only — member
 * photos plus ALL crew photos on those phases (M-MULTI follow-up, owner-confirmed:
 * co-assignees on a shared phase see each other's status evidence, exactly like
 * notes; a since-unassigned uploader's photo stays visible for context). Scope
 * stays strictly the assigned phase ids — photos on other phases never leave the
 * server. Mirrors notesForParticipant.
 */
export async function photosForParticipant(
  jobId: string,
  orgId: string,
  participantId: string,
  phaseIds: string[],
): Promise<Record<string, PhotoView[]>> {
  if (phaseIds.length === 0) return {};
  const svc = createServiceClient();
  const { data } = await svc
    .from("photos")
    .select("*")
    .eq("job_id", jobId)
    .in("phase_id", phaseIds)
    .order("created_at", { ascending: true });
  const photos = (data ?? []) as Photo[];
  if (photos.length === 0) return {};
  const { memberName, partName } = await nameMaps(svc, orgId, jobId);
  return groupByPhase(photos.map((p) => viewOf(p, memberName, partName)));
}

/**
 * Total bytes stored by an org (the cap accounting). Summed app-side over
 * byte_size; the photos_org_id_idx INCLUDE (byte_size) keeps the underlying scan
 * cheap. Photo counts stay modest for a long time (Trinity ~3–6 GB/yr), and the
 * only time this approaches many rows is at the cap — where uploads are blocked
 * anyway. If volume ever warrants it, swap to a SQL aggregate over that index.
 */
export async function orgStorageUsedBytes(orgId: string): Promise<number> {
  const svc = createServiceClient();
  const { data } = await svc.from("photos").select("byte_size").eq("org_id", orgId);
  const rows = (data ?? []) as { byte_size: number }[];
  return rows.reduce((acc, r) => acc + (r.byte_size ?? 0), 0);
}
