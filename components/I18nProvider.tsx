"use client";

import { createContext, useContext } from "react";
import type { Dict, Lang } from "@/lib/i18n/dictionaries";

const I18nContext = createContext<{ dict: Dict; lang: Lang } | null>(null);

/** Makes the active dictionary + language available to client components. The
 *  dictionary is plain strings, so it serializes to the client cleanly. */
export function I18nProvider({
  dict,
  lang,
  children,
}: {
  dict: Dict;
  lang: Lang;
  children: React.ReactNode;
}) {
  return (
    <I18nContext.Provider value={{ dict, lang }}>
      {children}
    </I18nContext.Provider>
  );
}

/** The message catalog inside a client component. */
export function useT(): Dict {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used within I18nProvider");
  return ctx.dict;
}

/** The active language inside a client component. */
export function useLang(): Lang {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useLang must be used within I18nProvider");
  return ctx.lang;
}
