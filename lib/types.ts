// App-facing row types for the core tables. Kept in sync with
// supabase/migrations by hand for now; once the Supabase CLI is linked we can
// replace these with generated types (supabase gen types typescript).

export type PhaseStatus = "not_started" | "in_progress" | "blocked" | "done";
export type JobStatus = "active" | "archived";

export type Organization = {
  id: string;
  name: string;
  owner_user_id: string;
  subscription_status: string;
};

export type Job = {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  customer_name: string | null;
  status: JobStatus;
  created_at: string;
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
