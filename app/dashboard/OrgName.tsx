"use client";

import { useState, useTransition } from "react";
import { renameOrg } from "./actions";
import { useT } from "@/components/I18nProvider";

/** Tap the name to rename your company/yourself — inline, no settings screen. */
export function OrgName({ name }: { name: string }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [, startTransition] = useTransition();

  function save() {
    const n = draft.trim();
    setEditing(false);
    if (n && n !== name) startTransition(() => renameOrg(n));
  }

  if (editing) {
    return (
      <input
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
        aria-label={t.misc.companyNameAria}
        className="w-full rounded-lg border border-slate-300 px-2 py-1 text-2xl font-bold tracking-tight text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      className="group flex items-center gap-1.5 text-left"
    >
      <span className="text-2xl font-bold tracking-tight text-slate-900">
        {name}
      </span>
      <span className="text-sm text-slate-300 group-active:text-slate-500">
        ✎
      </span>
    </button>
  );
}
