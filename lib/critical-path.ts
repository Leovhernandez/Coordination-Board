import type { Phase } from "@/lib/types";

// The core value (BUILD-PROMPT §"Critical-path algorithm"): from a job's linear
// phase list, compute the one headline telling the owner what to chase right now.
// Phases are ordered by sequence_index. Assignee names are optional and will be
// wired once participants exist (M5).

export type HeadlineTone = "empty" | "done" | "blocked" | "in_progress" | "ready";

/**
 * M13: computation is language-agnostic — it returns only the FACTS (tone +
 * phase labels + blocked reason), never a sentence. The localized sentence is
 * built in <Headline> from the active dictionary, so EN and ES share this exact
 * same logic. The emoji is language-neutral and stays here.
 */
export type Headline = {
  tone: HeadlineTone;
  emoji: string;
  frontier: string | null; // the phase to chase right now
  reason: string | null; // blocked_reason, when blocked
  next: string | null; // the phase after the frontier
  // Downstream phases already flagged blocked (a problem coming) — shown smaller.
  downstreamBlocked: string[];
};

export function computeHeadline(phases: Phase[]): Headline {
  if (phases.length === 0) {
    return {
      tone: "empty",
      emoji: "•",
      frontier: null,
      reason: null,
      next: null,
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
      frontier: null,
      reason: null,
      next: null,
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

  const base = {
    frontier: frontier.label,
    next: next?.label ?? null,
    downstreamBlocked,
  };

  switch (frontier.status) {
    case "blocked":
      return {
        tone: "blocked",
        emoji: "🔴",
        reason: frontier.blocked_reason ?? "—",
        ...base,
      };
    case "in_progress":
      return { tone: "in_progress", emoji: "🟡", reason: null, ...base };
    default: // not_started
      return { tone: "ready", emoji: "⚪", reason: null, ...base };
  }
}
