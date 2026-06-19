import type { PhaseStatus } from "@/lib/types";

// Single source of truth for how each phase status looks across the app
// (dashboard summaries, the board controls, and the M4 critical-path headline).

export const STATUS_ORDER: PhaseStatus[] = [
  "not_started",
  "in_progress",
  "blocked",
  "done",
];

export const STATUS_LABEL: Record<PhaseStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

// Small badge / pill.
export const STATUS_PILL: Record<PhaseStatus, string> = {
  not_started: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200",
  in_progress: "bg-amber-100 text-amber-800 ring-1 ring-inset ring-amber-200",
  blocked: "bg-red-100 text-red-800 ring-1 ring-inset ring-red-200",
  done: "bg-emerald-100 text-emerald-800 ring-1 ring-inset ring-emerald-200",
};

// Colored accent bar down the left edge of a phase card.
export const STATUS_ACCENT: Record<PhaseStatus, string> = {
  not_started: "bg-slate-300",
  in_progress: "bg-amber-400",
  blocked: "bg-red-500",
  done: "bg-emerald-500",
};

// A status control button when it is the active/selected status.
export const STATUS_ACTIVE: Record<PhaseStatus, string> = {
  not_started: "bg-slate-600 text-white border-slate-600",
  in_progress: "bg-amber-500 text-white border-amber-500",
  blocked: "bg-red-600 text-white border-red-600",
  done: "bg-emerald-600 text-white border-emerald-600",
};
