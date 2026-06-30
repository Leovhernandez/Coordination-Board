import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import type { ActivityEvent, Job, Note, Phase } from "@/lib/types";

/**
 * M-EXPORT — owner data export. Assembles the org's jobs + phases + notes +
 * activity log into CSV files (one per entity) for a ZIP download. Read-only and
 * scoped EXPLICITLY to the owner's org id (the caller is owner-gated in the route
 * handler); uses the service client so co-worker/crew names resolve (a salesman's
 * RLS can't read them) — the same pattern as lib/notes.ts / lib/activity.ts.
 *
 * No data beyond what the owner already owns leaves: every query is filtered to
 * this org's jobs. Job-keyed tables are fetched in chunks so an org with many jobs
 * never blows the query-string limit or times out.
 */

type NameRow = { id: string; name: string };

function csvCell(v: string | number | boolean | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

type Cell = string | number | boolean | null | undefined;

function toCsv(headers: string[], rows: Cell[][]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const r of rows) lines.push(r.map(csvCell).join(","));
  // Leading BOM so Excel reads it as UTF-8 (Spanish accents render correctly).
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

type Svc = ReturnType<typeof createServiceClient>;

async function allByJobIds(
  svc: Svc,
  table: string,
  jobIds: string[],
): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  for (const ids of chunk(jobIds, 100)) {
    const { data } = await svc.from(table).select("*").in("job_id", ids);
    if (data) out.push(...(data as Record<string, unknown>[]));
  }
  return out;
}

export type ExportFile = { name: string; content: string };

/** Build the per-entity CSVs for an org. Always returns all four files (header-only
 *  when empty) so the export is predictable. */
export async function buildOrgCsvs(orgId: string): Promise<ExportFile[]> {
  const svc = createServiceClient();

  const { data: jobsData } = await svc
    .from("jobs")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  const jobs = (jobsData ?? []) as Job[];
  const jobIds = jobs.map((j) => j.id);
  const jobName = new Map(jobs.map((j) => [j.id, j.name]));

  const { data: membersData } = await svc
    .from("org_members")
    .select("id, name")
    .eq("org_id", orgId);
  const memberName = new Map(
    ((membersData ?? []) as NameRow[]).map((m) => [m.id, m.name]),
  );

  let phases: Phase[] = [];
  let notes: Note[] = [];
  let activity: ActivityEvent[] = [];
  const partName = new Map<string, string>();

  if (jobIds.length > 0) {
    const [ph, nt, ac, pt] = await Promise.all([
      allByJobIds(svc, "phases", jobIds),
      allByJobIds(svc, "notes", jobIds),
      allByJobIds(svc, "activity_log", jobIds),
      allByJobIds(svc, "participants", jobIds),
    ]);
    phases = (ph as unknown as Phase[]).sort(
      (a, b) =>
        a.job_id.localeCompare(b.job_id) || a.sequence_index - b.sequence_index,
    );
    notes = (nt as unknown as Note[]).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    activity = (ac as unknown as ActivityEvent[]).sort((a, b) =>
      a.created_at.localeCompare(b.created_at),
    );
    for (const p of pt as NameRow[]) partName.set(p.id, p.name);
  }

  const who = (memberId: string | null, partId: string | null): string =>
    memberId
      ? (memberName.get(memberId) ?? "—")
      : partId
        ? (partName.get(partId) ?? "—")
        : "—";
  const side = (memberId: string | null, partId: string | null): string =>
    memberId ? "member" : partId ? "crew" : "system";

  const jobsCsv = toCsv(
    ["id", "name", "customer_name", "address", "status", "deleted_at", "salesman", "created_at"],
    jobs.map((j) => [
      j.id,
      j.name,
      j.customer_name,
      j.address,
      j.status,
      j.deleted_at,
      j.salesman_member_id ? (memberName.get(j.salesman_member_id) ?? "—") : "",
      j.created_at,
    ]),
  );

  const phasesCsv = toCsv(
    ["id", "job_id", "job_name", "sequence_index", "label", "status", "blocked_reason", "assignee", "updated_at"],
    phases.map((p) => [
      p.id,
      p.job_id,
      jobName.get(p.job_id) ?? "",
      p.sequence_index,
      p.label,
      p.status,
      p.blocked_reason,
      p.assignee_participant_id ? (partName.get(p.assignee_participant_id) ?? "—") : "",
      p.updated_at,
    ]),
  );

  const notesCsv = toCsv(
    ["id", "job_id", "job_name", "phase_id", "author", "author_type", "body", "created_at", "updated_at"],
    notes.map((n) => [
      n.id,
      n.job_id,
      jobName.get(n.job_id) ?? "",
      n.phase_id,
      who(n.author_member_id, n.author_participant_id),
      side(n.author_member_id, n.author_participant_id),
      n.body,
      n.created_at,
      n.updated_at,
    ]),
  );

  const activityCsv = toCsv(
    ["id", "job_id", "job_name", "phase_id", "event_type", "actor", "actor_type", "detail", "created_at"],
    activity.map((e) => [
      e.id,
      e.job_id,
      jobName.get(e.job_id) ?? "",
      e.phase_id,
      e.event_type,
      who(e.actor_member_id, e.actor_participant_id),
      side(e.actor_member_id, e.actor_participant_id),
      JSON.stringify(e.detail ?? {}),
      e.created_at,
    ]),
  );

  return [
    { name: "jobs.csv", content: jobsCsv },
    { name: "phases.csv", content: phasesCsv },
    { name: "notes.csv", content: notesCsv },
    { name: "activity_log.csv", content: activityCsv },
  ];
}
