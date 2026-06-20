import type { Phase } from "@/lib/types";
import { STATUS_ACCENT, STATUS_LABEL, STATUS_PILL } from "@/lib/status";
import { computeHeadline } from "@/lib/critical-path";
import { Headline } from "@/components/Headline";

/** Static, read-only board: the critical-path headline + phases, no controls.
 *  Used for a company owner viewing a GC's job. */
export function ReadOnlyBoard({ phases }: { phases: Phase[] }) {
  const sorted = [...phases].sort(
    (a, b) => a.sequence_index - b.sequence_index,
  );

  return (
    <div className="flex flex-col gap-3">
      <Headline data={computeHeadline(sorted)} />
      {sorted.map((p, i) => (
        <div
          key={p.id}
          className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className={`w-1.5 shrink-0 ${STATUS_ACCENT[p.status]}`} />
          <div className="flex-1 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-900">
                <span className="text-slate-400">{i + 1}.</span> {p.label}
              </span>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[p.status]}`}
              >
                {STATUS_LABEL[p.status]}
              </span>
            </div>
            {p.status === "blocked" && p.blocked_reason && (
              <p className="mt-2 text-sm font-medium text-red-700">
                ⛔ Waiting on {p.blocked_reason}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
