"use client";

import { useState, useTransition } from "react";
import { renameMember } from "./actions";
import { cleanMemberName } from "@/lib/names";
import { useT } from "@/components/I18nProvider";

/**
 * A salesman taps their name to rename their own account — inline, no settings
 * screen. Letter-only (filtered as they type); the owner sees this name over
 * the salesman's jobs in the roll-up. Mirrors OrgName but writes the member's
 * own name, never the owner's org name.
 */
export function MemberName({ name }: { name: string }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [, startTransition] = useTransition();

  function save() {
    const n = cleanMemberName(draft).trim();
    setEditing(false);
    if (n && n !== name) startTransition(() => renameMember(n));
  }

  if (editing) {
    return (
      <input
        value={draft}
        autoFocus
        onChange={(e) => setDraft(cleanMemberName(e.target.value))}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(name);
            setEditing(false);
          }
        }}
        inputMode="text"
        placeholder={t.dashboard.yourName}
        aria-label={t.dashboard.yourName}
        className="w-full min-w-0 rounded-lg border border-slate-300 px-2 py-1 text-2xl font-bold tracking-tight text-slate-900 outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
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
      className="group flex min-w-0 max-w-full items-center gap-1.5 text-left"
    >
      <span className="truncate text-2xl font-bold tracking-tight text-slate-900">
        {name}
      </span>
      <span className="shrink-0 text-sm text-slate-300 group-active:text-slate-500">
        ✎
      </span>
    </button>
  );
}
