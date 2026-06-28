"use client";

import type { Headline as HeadlineData } from "@/lib/critical-path";
import { useT } from "@/components/I18nProvider";
import { interpolate } from "@/lib/i18n/interpolate";
import type { Dict } from "@/lib/i18n/dictionaries";

const TONE_CLASS: Record<HeadlineData["tone"], string> = {
  empty: "border-slate-200 bg-white text-slate-500",
  done: "border-emerald-200 bg-emerald-50 text-emerald-900",
  blocked: "border-red-300 bg-red-50 text-red-900",
  in_progress: "border-amber-200 bg-amber-50 text-amber-900",
  ready: "border-slate-200 bg-white text-slate-900",
};

/** Build the localized headline sentence from the structured facts. */
function headlineText(data: HeadlineData, t: Dict): string {
  const frontier = data.frontier ?? "";
  switch (data.tone) {
    case "empty":
      return t.headline.empty;
    case "done":
      return t.headline.done;
    case "blocked":
      return interpolate(data.next ? t.headline.blockedNext : t.headline.blocked, {
        frontier,
        reason: data.reason ?? "—",
        next: data.next ?? "",
      });
    case "in_progress":
      return interpolate(
        data.next ? t.headline.inProgressNext : t.headline.inProgress,
        { frontier, next: data.next ?? "" },
      );
    case "ready":
      return interpolate(t.headline.ready, { frontier });
  }
}

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
  const t = useT();
  return (
    <div
      className={`rounded-xl border ${compact ? "p-2.5" : "p-4 shadow-sm"} ${TONE_CLASS[data.tone]}`}
    >
      <p
        className={`font-semibold ${compact ? "text-sm leading-snug" : "text-base leading-snug"}`}
      >
        <span className="mr-1.5">{data.emoji}</span>
        {headlineText(data, t)}
      </p>
      {!compact && data.downstreamBlocked.length > 0 && (
        <p className="mt-2 text-sm font-medium text-red-700">
          ⚠{" "}
          {interpolate(t.headline.downstream, {
            labels: data.downstreamBlocked.join(", "),
          })}
        </p>
      )}
    </div>
  );
}
