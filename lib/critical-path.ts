import type { Phase } from "@/lib/types";

// The core value (BUILD-PROMPT §"Critical-path algorithm"): from a job's linear
// phase list, compute the one headline telling the owner what to chase right now.
// Phases are ordered by sequence_index. Assignee names are optional and will be
// wired once participants exist (M5).

export type HeadlineTone = "empty" | "done" | "blocked" | "in_progress" | "ready";

export type Headline = {
  tone: HeadlineTone;
  emoji: string;
  text: string;
  // Downstream phases already flagged blocked (a problem coming) — shown smaller.
  downstreamBlocked: string[];
};

export function computeHeadline(phases: Phase[]): Headline {
  if (phases.length === 0) {
    return {
      tone: "empty",
      emoji: "•",
      text: "No phases yet — add one to start tracking.",
      downstreamBlocked: [],
    };
  }

  const sorted = [...phases].sort(
    (a, b) => a.sequence_index - b.sequence_index,
  );
  const frontierIdx = sorted.findIndex((p) => p.status !== "done");

  if (frontierIdx === -1) {
    return {
      tone: "done",
      emoji: "✅",
      text: "All phases complete.",
      downstreamBlocked: [],
    };
  }

  const frontier = sorted[frontierIdx];
  const next =
    sorted.slice(frontierIdx + 1).find((p) => p.status !== "done") ?? null;

  // Blocked phases past the frontier — surfaced secondarily so the GC sees a
  // problem coming (e.g. inspection blocked while still at rough-in).
  const downstreamBlocked = sorted
    .slice(frontierIdx + 1)
    .filter((p) => p.status === "blocked")
    .map((p) => p.label);

  switch (frontier.status) {
    case "blocked":
      return {
        tone: "blocked",
        emoji: "🔴",
        text:
          `BLOCKED: ${frontier.label} — waiting on ${frontier.blocked_reason ?? "—"}.` +
          (next
            ? ` Next phase (${next.label}) can’t start until this clears.`
            : ""),
        downstreamBlocked,
      };
    case "in_progress":
      return {
        tone: "in_progress",
        emoji: "🟡",
        text:
          `IN PROGRESS: ${frontier.label}` +
          (next ? ` — next up: ${next.label}.` : "."),
        downstreamBlocked,
      };
    default: // not_started
      return {
        tone: "ready",
        emoji: "⚪",
        text: `READY TO START: ${frontier.label} — nothing upstream is blocking.`,
        downstreamBlocked,
      };
  }
}
