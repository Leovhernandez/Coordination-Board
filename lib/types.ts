// App-facing row types for the core tables. Kept in sync with
// supabase/migrations by hand for now; once the Supabase CLI is linked we can
// replace these with generated types (supabase gen types typescript).

export type PhaseStatus = "not_started" | "in_progress" | "blocked" | "done";
export type JobStatus = "active" | "archived";

export type Organization = {
  id: string;
  name: string;
  owner_user_id: string;
  owner_email: string | null;
  subscription_status: string;
  stripe_customer_id: string | null;
  trial_ends_at: string | null;
  // M14: max salesmen the owner may invite (admin-adjustable per business).
  salesman_seat_limit: number;
};

export type Job = {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  customer_name: string | null;
  status: JobStatus;
  created_at: string;
  // M14: which salesman member owns this job (null for pre-M14 rows until
  // backfilled). The owner sees all; a salesman sees only their own.
  salesman_member_id: string | null;
  // M10: soft-delete timestamp (null = live). A deleted job is hidden from the
  // active/archived lists and lives in Trash until restored or purged. Orthogonal
  // to `status` (archive) — restore returns the job to its prior status.
  deleted_at: string | null;
};

export type Phase = {
  id: string;
  job_id: string;
  label: string;
  sequence_index: number;
  status: PhaseStatus;
  blocked_reason: string | null;
  assignee_participant_id: string | null;
  updated_at: string;
};

export type Participant = {
  id: string;
  job_id: string;
  name: string;
  phone: string | null;
  invite_token: string;
  revoked: boolean;
  last_seen_at: string | null;
};

// M17: a small, structured note on a phase (gate/lockbox codes, access info, URLs).
// Two-sided author — exactly one of author_member_id / author_participant_id is set
// (DB CHECK). Not chat: no threads/replies (AGENTS.md §7).
export type Note = {
  id: string;
  phase_id: string;
  job_id: string;
  author_member_id: string | null;
  author_participant_id: string | null;
  body: string;
  created_at: string;
  updated_at: string;
};

// A note shaped for display: author resolved to a name, and whether the CURRENT
// viewer may edit it (computed server-side to mirror the RLS / token rules).
export type NoteView = {
  id: string;
  phaseId: string;
  body: string;
  authorName: string;
  authorType: "member" | "crew";
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

// M18: append-only activity log. event_type values are constrained by a CHECK in
// 20260629140000_m18_activity_log.sql — keep this union in sync with it. Two-sided
// actor (member XOR participant, like Note); detail carries the human-readable
// context copied at write time ({from,to,reason,label,...}) so a row stays
// meaningful after its phase/note FK is nulled on delete.
export type ActivityEventType =
  | "status_change"
  | "label_change"
  | "assignment_change"
  | "phase_added"
  | "phase_deleted"
  | "note_added"
  | "note_edited"
  | "note_deleted";

export type ActivityEvent = {
  id: string;
  job_id: string;
  phase_id: string | null;
  note_id: string | null;
  event_type: ActivityEventType;
  actor_member_id: string | null;
  actor_participant_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

// An activity row shaped for display: actor resolved to a name + side. Powers the
// per-phase History disclosure and (via status_change → blocked) the duration pill.
export type ActivityView = {
  id: string;
  phaseId: string | null;
  eventType: ActivityEventType;
  actorName: string;
  actorType: "member" | "crew" | "system";
  detail: Record<string, unknown>;
  createdAt: string;
};
