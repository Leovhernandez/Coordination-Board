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
