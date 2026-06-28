"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LANG_COOKIE } from "@/lib/i18n/dictionaries";
import { useLang, useT } from "./I18nProvider";

/**
 * EN/ES toggle. Sets the persistent `lang` cookie and refreshes so the
 * server re-renders in the chosen language. Display only.
 */
export function LangToggle() {
  const lang = useLang();
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const next = lang === "en" ? "es" : "en";

  function switchLang() {
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    startTransition(() => router.refresh());
  }

  return (
    <button
      type="button"
      onClick={switchLang}
      disabled={pending}
      aria-label={`Switch to ${t.lang[next]}`}
      className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-600 active:bg-slate-100 disabled:opacity-50"
    >
      {t.lang[next]}
    </button>
  );
}
