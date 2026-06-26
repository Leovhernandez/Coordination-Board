/**
 * Salesmen name their own account so the owner's roll-up can track jobs by
 * person. Names are letter-only (plus single spaces) — no numbers/symbols — so
 * the roll-up headings stay clean and predictable. Used both client-side (live
 * input filtering) and server-side (authoritative validation on save).
 */
export function cleanMemberName(raw: string): string {
  return raw
    .replace(/[^A-Za-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trimStart()
    .slice(0, 60);
}
