/**
 * Fill {placeholders} in a template string. Shared by EN and ES (and by server
 * and client) so the templating logic is identical across languages — the
 * critical-path computation supplies the facts, the dictionary supplies the
 * language, and this combines them.
 */
export function interpolate(
  template: string,
  params: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, k) =>
    k in params ? String(params[k]) : `{${k}}`,
  );
}
