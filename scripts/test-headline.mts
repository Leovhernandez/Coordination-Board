// Quick algorithm check for the critical-path headline. Run:
//   npx --yes tsx scripts/test-headline.mts
import { computeHeadline } from "../lib/critical-path.ts";

let seq = 0;
const ph = (status: string, blocked_reason: string | null = null) => ({
  id: String(seq),
  job_id: "j",
  label: `P${seq}`,
  sequence_index: seq++,
  status,
  blocked_reason,
  assignee_participant_id: null,
  updated_at: "",
});

function check(name: string, cond: boolean, detail: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : ` -> ${detail}`}`);
  if (!cond) process.exitCode = 1;
}

// M13: assert the structured FACTS (language-agnostic), not the English copy.
// 1. empty
seq = 0;
let h = computeHeadline([] as any);
check("empty", h.tone === "empty", JSON.stringify(h));

// 2. all done
seq = 0;
h = computeHeadline([ph("done"), ph("done")] as any);
check("all done", h.tone === "done", JSON.stringify(h));

// 3. ready (first not_started)
seq = 0;
h = computeHeadline([ph("not_started"), ph("not_started")] as any);
check("ready", h.tone === "ready" && h.frontier === "P0", JSON.stringify(h));

// 4. in progress with a next phase
seq = 0;
h = computeHeadline([ph("done"), ph("in_progress"), ph("not_started")] as any);
check(
  "in_progress + next",
  h.tone === "in_progress" && h.frontier === "P1" && h.next === "P2",
  JSON.stringify(h),
);

// 5. blocked frontier with reason + next
seq = 0;
h = computeHeadline([
  ph("done"),
  ph("blocked", "inspector"),
  ph("not_started"),
] as any);
check(
  "blocked frontier",
  h.tone === "blocked" &&
    h.frontier === "P1" &&
    h.reason === "inspector" &&
    h.next === "P2",
  JSON.stringify(h),
);

// 6. ready frontier but a downstream phase is blocked (problem coming)
seq = 0;
h = computeHeadline([
  ph("in_progress"),
  ph("not_started"),
  ph("blocked", "permit"),
] as any);
check(
  "downstream blocked surfaced",
  h.downstreamBlocked.length === 1 && h.downstreamBlocked[0] === "P2",
  JSON.stringify(h.downstreamBlocked),
);

console.log("done");
