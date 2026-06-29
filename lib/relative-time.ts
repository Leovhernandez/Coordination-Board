import type { Lang } from "@/lib/i18n/dictionaries";

// Localized "3 days ago" / "hace 3 días" for note timestamps (M17/M18). Uses the
// platform Intl.RelativeTimeFormat so EN and ES share one implementation — the
// language supplies the wording, this picks the unit. Computed client-side so it
// reflects the reader's clock. NOT server-only.
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

export function relativeTime(iso: string, lang: Lang): string {
  const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(lang, { numeric: "auto" });
  for (const [unit, secs] of UNITS) {
    if (abs >= secs) return rtf.format(Math.round(diffSec / secs), unit);
  }
  return rtf.format(diffSec, "second");
}

// M18: elapsed time since `iso` as a COMPACT {unit, value} for the "Blocked Nd"
// pill — distinct from relativeTime's prose. Returns the largest whole unit (day →
// hour → minute); the caller picks the localized template (history.durationDay/
// Hour/Minute) so the wording stays in the dictionary. Clamped at 0 (never future).
export function elapsedCompact(iso: string): {
  unit: "day" | "hour" | "minute";
  value: number;
} {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (sec >= 86_400) return { unit: "day", value: Math.floor(sec / 86_400) };
  if (sec >= 3_600) return { unit: "hour", value: Math.floor(sec / 3_600) };
  return { unit: "minute", value: Math.floor(sec / 60) };
}
