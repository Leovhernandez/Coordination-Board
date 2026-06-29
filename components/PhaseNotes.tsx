"use client";

import { useState, useTransition } from "react";
import type { NoteView } from "@/lib/types";
import { useT, useLang } from "@/components/I18nProvider";
import { relativeTime } from "@/lib/relative-time";

/**
 * M17 phase notes — small, structured notes shown inside a phase (gate codes,
 * lockbox, access). Action-agnostic: the editable board passes the member note
 * actions, the participant board passes the crew note actions, so one component
 * renders all three surfaces (editable board, read-only in-depth view, crew board)
 * and they can't drift. Kept compact so the board still passes the glance test —
 * notes live in phase detail, never the headline (AGENTS.md §7).
 */
export function PhaseNotes({
  phaseId,
  notes,
  canAdd,
  onAdd,
  onEdit,
  onDelete,
}: {
  phaseId: string;
  notes: NoteView[];
  canAdd: boolean;
  onAdd: (phaseId: string, body: string) => void | Promise<void>;
  onEdit: (noteId: string, body: string) => void | Promise<void>;
  onDelete: (noteId: string) => void | Promise<void>;
}) {
  const t = useT();
  const lang = useLang();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Nothing to show and nothing to add → render nothing (keeps cards clean).
  if (notes.length === 0 && !canAdd) return null;

  function submitAdd() {
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    setAdding(false);
    startTransition(() => {
      void onAdd(phaseId, body);
    });
  }

  function submitEdit(id: string) {
    const body = editDraft.trim();
    if (!body) return;
    setEditingId(null);
    startTransition(() => {
      void onEdit(id, body);
    });
  }

  function remove(id: string) {
    if (!confirm(t.notes.deleteConfirm)) return;
    startTransition(() => {
      void onDelete(id);
    });
  }

  const fieldClass =
    "min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10";
  const saveClass =
    "shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40";
  const ghostClass =
    "shrink-0 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 active:bg-slate-100";

  return (
    <div className="mt-2.5 border-t border-slate-100 pt-2.5">
      {notes.length > 0 && (
        <ul className="flex flex-col gap-2">
          {notes.map((n) => (
            <li key={n.id} className="text-sm">
              {editingId === n.id ? (
                <div className="flex items-start gap-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={2}
                    autoFocus
                    className={fieldClass}
                  />
                  <button
                    type="button"
                    onClick={() => submitEdit(n.id)}
                    disabled={!editDraft.trim()}
                    className={saveClass}
                  >
                    {t.notes.save}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className={ghostClass}
                  >
                    {t.notes.cancel}
                  </button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="whitespace-pre-wrap break-words text-slate-700">
                      {n.body}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">
                      {n.authorName}
                      {n.authorType === "crew" && ` · ${t.notes.crewTag}`}
                      {` · ${relativeTime(n.createdAt, lang)}`}
                      {n.updatedAt !== n.createdAt && ` · ${t.notes.edited}`}
                    </span>
                  </div>
                  {n.canEdit && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(n.id);
                          setEditDraft(n.body);
                        }}
                        className="text-xs font-medium text-slate-500 active:text-slate-900"
                      >
                        {t.notes.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(n.id)}
                        className="text-xs font-medium text-red-500 active:text-red-700"
                      >
                        {t.notes.delete}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canAdd &&
        (adding ? (
          <div className="mt-2 flex items-start gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t.notes.placeholder}
              rows={2}
              autoFocus
              className={fieldClass}
            />
            <button
              type="button"
              onClick={submitAdd}
              disabled={!draft.trim()}
              className={saveClass}
            >
              {t.notes.save}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setDraft("");
              }}
              className={ghostClass}
            >
              {t.notes.cancel}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 text-xs font-medium text-slate-500 active:text-slate-900"
          >
            + {t.notes.add}
          </button>
        ))}
    </div>
  );
}
