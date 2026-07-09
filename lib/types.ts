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
  // Cancel-retention: stamped on Stripe cancellation; starts the 30-day export
  // window before the purge-canceled cron erases the org. Null = not canceled.
  canceled_at: string | null;
  // M14: max salesmen the owner may invite (admin-adjustable per business).
  salesman_seat_limit: number;
  // M22: capability tier + photo storage cap. `plan` defaults to 'base'; the cap is
  // derived from plan unless storage_cap_bytes overrides it (lib/capabilities.ts).
  plan: string;
  storage_cap_bytes: number | null;
  // M21: owner opt-in — when true, crew are prompted for a preferred payment
  // method and the owner/owning-salesman see it. Default false.
  collect_payment_method: boolean;
  // N2: promo gate (admin-set, "Trinity + one more") + when the $20×3mo promo
  // phase ends (drives the dated banner; past date = no banner).
  promo_eligible: boolean;
  promo_ends_at: string | null;
  // M-MULTI: per-org cap on crew per phase (default 10; raiseable per org
  // without a code change). Enforced in the assign action + a DB trigger.
  max_assignees_per_phase: number;
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
  // Assignment lives in the phase_assignees junction (M-MULTI). The legacy
  // phases.assignee_participant_id column was dropped in the cleanup migration
  // 20260709120000 — a phase now carries a LIST of assignees, never a single FK.
  updated_at: string;
};

// M-MULTI: one crew assignment on a phase (junction row). A phase holds up to
// the org's max_assignees_per_phase; every assignee has identical permissions
// (shared last-writer-wins status; the M18 log attributes who changed it).
export type PhaseAssignee = {
  phase_id: string;
  participant_id: string;
  job_id: string;
  created_at: string;
};

export type Participant = {
  id: string;
  job_id: string;
  name: string;
  phone: string | null;
  invite_token: string;
  revoked: boolean;
  last_seen_at: string | null;
  // M21: preferred payment method (owner opt-in). payment_type ∈ PAYMENT_TYPES or
  // null; payment_detail is free text (phone/@handle/note). Per job/link row.
  payment_type: string | null;
  payment_detail: string | null;
  // M-CLAIM: device binding. The sha-256 hash of the claiming device's secret
  // (never the secret itself) + when the link was first opened. Null = not yet
  // claimed. NEVER send claim_secret_hash to the client.
  claim_secret_hash: string | null;
  claimed_at: string | null;
};

// M21: the allowed preferred-payment methods. Single source of truth shared by the
// crew select, the owner-side label, and the server-action normalizer + DB CHECK.
export const PAYMENT_TYPES = [
  "zelle",
  "venmo",
  "check",
  "cash",
  "other",
] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];

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
  | "note_deleted"
  // M-CLAIM: crew-link device binding — first-open claim + member link reset.
  // Job-level events (phase_id null): they surface in the Crew panel + export,
  // not the per-phase History.
  | "link_claimed"
  | "link_reset";

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

// M22: a status-evidence photo on a phase. Bytes live on R2; this row is the
// metadata + R2 keys. Two-sided uploader (member XOR crew, lenient like
// activity_log so a deleted uploader doesn't orphan-delete the row).
export type StatusContext = "blocked" | "done" | "in_progress";

export type Photo = {
  id: string;
  job_id: string;
  phase_id: string | null;
  org_id: string;
  status_context: StatusContext;
  uploaded_by_member_id: string | null;
  uploaded_by_participant_id: string | null;
  r2_key: string;
  thumb_key: string | null;
  content_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  created_at: string;
};

// A photo shaped for display: CDN urls built + uploader resolved to a name/side.
export type PhotoView = {
  id: string;
  phaseId: string | null;
  url: string;
  thumbUrl: string;
  uploaderName: string;
  uploaderType: "member" | "crew" | "system";
  statusContext: StatusContext;
  width: number | null;
  height: number | null;
  createdAt: string;
};

// Upload action I/O — shared by the member + crew actions and the PhasePhotos UI.
export type PhotoUploadError =
  | "auth"
  | "type"
  | "size"
  | "count"
  | "cap"
  | "config"
  | "phase";

export type CreateUploadInput = {
  phaseId: string;
  statusContext: StatusContext;
  contentType: string;
  byteSize: number;
};

export type CreateUploadResult =
  | {
      ok: true;
      key: string;
      thumbKey: string;
      uploadUrl: string;
      thumbUploadUrl: string;
    }
  | { ok: false; error: PhotoUploadError };

export type ConfirmUploadInput = {
  phaseId: string;
  statusContext: StatusContext;
  key: string;
  thumbKey: string;
  contentType: string;
  width: number | null;
  height: number | null;
};

export type ConfirmUploadResult =
  | { ok: true }
  | { ok: false; error: PhotoUploadError };
