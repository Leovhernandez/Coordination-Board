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
