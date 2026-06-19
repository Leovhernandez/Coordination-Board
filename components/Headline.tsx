import type { Headline as HeadlineData, HeadlineTone } from "@/lib/critical-path";

const TONE_CLASS: Record<HeadlineTone, string> = {
  empty: "border-slate-200 bg-white text-slate-500",
  done: "border-emerald-200 bg-emerald-50 text-emerald-900",
  blocked: "border-red-300 bg-red-50 text-red-900",
  in_progress: "border-amber-200 bg-amber-50 text-amber-900",
  ready: "border-slate-200 bg-white text-slate-900",
};

/**
 * The critical-path headline. `compact` is used on dashboard job cards;
 * the full variant (board page) also lists downstream-blocked phases.
 */
export function Headline({
  data,
  compact = false,
}: {
  data: HeadlineData;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border ${compact ? "p-2.5" : "p-4 shadow-sm"} ${TONE_CLASS[data.tone]}`}
    >
      <p
        className={`font-semibold ${compact ? "text-sm leading-snug" : "text-base leading-snug"}`}
      >
        <span className="mr-1.5">{data.emoji}</span>
        {data.text}
      </p>
      {!compact && data.downstreamBlocked.length > 0 && (
        <p className="mt-2 text-sm font-medium text-red-700">
          ⚠ Also blocked downstream: {data.downstreamBlocked.join(", ")}.
        </p>
      )}
    </div>
  );
}
