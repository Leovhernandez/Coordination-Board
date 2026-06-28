import "server-only";
import { cookies, headers } from "next/headers";
import {
  dictionaries,
  LANG_COOKIE,
  type Dict,
  type Lang,
} from "./dictionaries";

/**
 * The active language, resolved server-side: the `lang` cookie (a manual
 * override that persists) → else the browser's Accept-Language → else English.
 * Display only — never gates behavior.
 */
export async function getLang(): Promise<Lang> {
  const cookie = (await cookies()).get(LANG_COOKIE)?.value;
  if (cookie === "en" || cookie === "es") return cookie;
  const accept = (await headers()).get("accept-language")?.toLowerCase() ?? "";
  return accept.startsWith("es") ? "es" : "en";
}

/** The message catalog for the active language (server components). */
export async function getDictionary(): Promise<Dict> {
  return dictionaries[await getLang()];
}
