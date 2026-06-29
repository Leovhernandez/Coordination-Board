"use client";

import { useState } from "react";
import type { ActivityView } from "@/lib/types";
import type { Dict } from "@/lib/i18n/dictionaries";
import { useT, useLang } from "@/components/I18nProvider";
import { relativeTime } from "@/lib/relative-time";
import { interpolate } from "@/lib/i18n/interpolate";

/**
 * M18 per-phase History — a collapsible, COLLAPSED-BY-DEFAULT disclosure of who
 * changed what and when (status/label/assignment/note events), so the audit trail
 * never collides with the card or the critical-path headline (AGENTS §7 glance
 * test). Display-only: it renders identically on the editable board and the
 * read-only in-depth view (no write controls either way). The crew board
 * deliberately omits it (owner decision — keep that surface lean). Event wording is
 * localized through the dictionary so EN/ES stay in sync (M13 carry-forward).
 */
function describe(e: ActivityView, t: Dict): string {
  const d = (e.detail ?? {}) as {
    to?: unknown;
    label?: unknown;
  };
  switch (e.eventType) {
    case "status_change": {
      const to = String(d.to ?? "");
      const status =
        (t.status as Record<string, string>)[to] ?? to;
      return interpolate(t.history.statusSet, { actor: e.actorName, status });
    }
    case "label_change":
      return interpolate(t.history.renamed, {
        actor: e.actorName,
        label: String(d.to ?? ""),
      });
    case "assignment_change":
      return d.to
        ? interpolate(t.history.assigned, {
            actor: e.actorName,
            name: String(d.to),
          })
        : interpolate(t.history.unassigned, { actor: e.actorName });
    case "phase_added":
      return interpolate(t.history.phaseAdded, { actor: e.actorName });
    case "phase_deleted":
      return interpolate(t.history.phaseDeleted, {
        actor: e.actorName,
        label: String(d.label ?? ""),
      });
    case "note_added":
      return interpolate(t.history.noteAdded, { actor: e.actorName });
    case "note_edited":
      return interpolate(t.history.noteEdited, { actor: e.actorName });
    case "note_deleted":
      return interpolate(t.history.noteDeleted, { actor: e.actorName });
    default:
      return e.actorName;
  }
}

export function PhaseHistory({ events }: { events: ActivityView[] }) {
  const t = useT();
  const lang = useLang();
  const [open, setOpen] = useState(false);

  if (events.length === 0) return null;

  return (
    <div className="mt-2.5 border-t border-slate-100 pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-xs font-medium text-slate-500 active:text-slate-900"
      >
        {open ? "▾ " : "▸ "}
        {interpolate(t.history.toggle, { n: events.length })}
      </button>

      {open && (
        <ul className="mt-2 flex flex-col gap-1.5">
          {/* events arrive ascending; show most-recent first */}
          {events
            .slice()
            .reverse()
            .map((e) => (
              <li key={e.id} className="text-xs text-slate-500">
                <span className="text-slate-700">{describe(e, t)}</span>
                {e.actorType === "crew" && ` · ${t.notes.crewTag}`}
                {` · ${relativeTime(e.createdAt, lang)}`}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
