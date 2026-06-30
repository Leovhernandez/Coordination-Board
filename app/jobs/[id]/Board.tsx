"use client";

import { useOptimistic, useState, useTransition } from "react";
import type {
  ActivityView,
  NoteView,
  Phase,
  PhaseStatus,
  PhotoView,
} from "@/lib/types";
import { STATUS_ACCENT, STATUS_ACTIVE, STATUS_PILL } from "@/lib/status";
import { computeHeadline } from "@/lib/critical-path";
import { elapsedCompact } from "@/lib/relative-time";
import { Headline } from "@/components/Headline";
import { PhaseNotes } from "@/components/PhaseNotes";
import { PhaseHistory } from "@/components/PhaseHistory";
import { PhasePhotos } from "@/components/PhasePhotos";
import { useT } from "@/components/I18nProvider";
import type { Dict } from "@/lib/i18n/dictionaries";
import { interpolate } from "@/lib/i18n/interpolate";
import {
  addNote,
  addPhase,
  assignPhase,
  confirmUpload,
  createUploadUrl,
  deleteNote,
  deletePhase,
  editNote,
  movePhase,
  renamePhase,
  setPhaseStatus,
} from "./actions";

type CrewOption = { id: string; name: string };

type OptimisticUpdate = {
  id: string;
  status: PhaseStatus;
  blocked_reason: string | null;
};

// Status controls (labels come from the dictionary via t.status[...]).
const CONTROLS: PhaseStatus[] = ["in_progress", "blocked", "done"];

// M18 blocker duration: the "blocked since" instant is the timestamp of the latest
// status_change INTO blocked for this phase (events arrive ascending, so scan from
// the end). Returns null until that event is logged — the pill simply waits.
function blockedSinceOf(events: ActivityView[]): string | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const to = (e.detail as { to?: unknown } | null)?.to;
    if (e.eventType === "status_change" && to === "blocked") return e.createdAt;
  }
  return null;
}

// Compact "3d" / "5h" / "2m" label for the pill, localized via the dictionary.
function durationLabel(sinceIso: string, t: Dict): string {
  const { unit, value } = elapsedCompact(sinceIso);
  const template =
    unit === "day"
      ? t.history.durationDay
      : unit === "hour"
        ? t.history.durationHour
        : t.history.durationMinute;
  return interpolate(template, { n: value });
}

export function Board({
  jobId,
  phases,
  participants,
  notesByPhase = {},
  activityByPhase = {},
  photosByPhase = {},
  readOnly = false,
}: {
  jobId: string;
  phases: Phase[];
  participants: CrewOption[];
  /** M17: notes per phase id, author resolved + canEdit precomputed server-side. */
  notesByPhase?: Record<string, NoteView[]>;
  /** M18: activity events per phase id (actor resolved server-side), newest last.
   *  Powers the History disclosure + the "Blocked Nd" duration pill. */
  activityByPhase?: Record<string, ActivityView[]>;
  /** M22: status-evidence photos per phase id (CDN urls + uploader resolved). */
  photosByPhase?: Record<string, PhotoView[]>;
  /** M-DASH: a member viewing another member's job sees phases + statuses +
   *  headline but NO write controls (no status buttons, no Edit phases). The
   *  SAME component renders both so they can't drift. */
  readOnly?: boolean;
}) {
  const t = useT();
  const nameOf = new Map(participants.map((p) => [p.id, p.name]));
  const [, startTransition] = useTransition();
  const [optimisticPhases, applyOptimistic] = useOptimistic(
    phases,
    (state, u: OptimisticUpdate) =>
      state.map((p) =>
        p.id === u.id
          ? { ...p, status: u.status, blocked_reason: u.blocked_reason }
          : p,
      ),
  );
  const [editMode, setEditMode] = useState(false);
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [addDraft, setAddDraft] = useState("");

  function commitStatus(p: Phase, status: PhaseStatus, reason: string | null) {
    startTransition(async () => {
      applyOptimistic({ id: p.id, status, blocked_reason: reason });
      await setPhaseStatus(p.id, jobId, status, reason);
    });
  }

  function onTapStatus(p: Phase, status: PhaseStatus) {
    if (status === "blocked") {
      setBlockingId(p.id);
      setReasonDraft(p.blocked_reason ?? "");
      return;
    }
    setBlockingId(null);
    commitStatus(p, status, null);
  }

  function saveBlocked(p: Phase) {
    const reason = reasonDraft.trim();
    if (!reason) return;
    setBlockingId(null);
    commitStatus(p, "blocked", reason);
  }

  function onRename(p: Phase, value: string) {
    if (!value.trim() || value.trim() === p.label) return;
    startTransition(() => renamePhase(p.id, jobId, value));
  }

  function onMove(p: Phase, direction: -1 | 1) {
    startTransition(() => movePhase(p.id, jobId, direction));
  }

  function onDelete(p: Phase) {
    if (!confirm(interpolate(t.board.deleteConfirm, { label: p.label }))) return;
    startTransition(() => deletePhase(p.id, jobId));
  }

  function onAdd() {
    const label = addDraft.trim();
    if (!label) return;
    setAddDraft("");
    startTransition(() => addPhase(jobId, label));
  }

  function onAssign(p: Phase, participantId: string | null) {
    startTransition(() => assignPhase(p.id, jobId, participantId));
  }

  return (
    <div className="flex flex-col gap-3">
      {!editMode && <Headline data={computeHeadline(optimisticPhases)} />}

      {!readOnly && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={`rounded-full border px-3 py-1 text-sm font-medium ${
              editMode
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 shadow-sm active:bg-slate-100"
            }`}
          >
            {editMode ? t.board.doneEditing : t.board.edit}
          </button>
        </div>
      )}

      {optimisticPhases.map((p, i) => {
        const phaseEvents = activityByPhase[p.id] ?? [];
        const blockedSince =
          p.status === "blocked" ? blockedSinceOf(phaseEvents) : null;
        return (
        <div
          key={p.id}
          className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
        >
          <div className={`w-1.5 shrink-0 ${STATUS_ACCENT[p.status]}`} />
          <div className="flex-1 p-3.5">
            {editMode ? (
              <div className="flex flex-col gap-2.5">
                <input
                  defaultValue={p.label}
                  onBlur={(e) => onRename(p, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  aria-label={t.board.phaseNameAria}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
                {participants.length > 0 ? (
                  <select
                    value={p.assignee_participant_id ?? ""}
                    onChange={(e) => onAssign(p, e.target.value || null)}
                    aria-label={t.board.assignToAria}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base outline-none focus:border-slate-900"
                  >
                    <option value="">{t.board.unassigned}</option>
                    {participants.map((pt) => (
                      <option key={pt.id} value={pt.id}>
                        {pt.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate-400">{t.board.addCrewHint}</p>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onMove(p, -1)}
                    disabled={i === 0}
                    aria-label={t.board.moveUpAria}
                    className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-30"
                  >
                    {t.board.up}
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(p, 1)}
                    disabled={i === optimisticPhases.length - 1}
                    aria-label={t.board.moveDownAria}
                    className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-30"
                  >
                    {t.board.down}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(p)}
                    className="flex-1 rounded-lg border border-red-200 py-2.5 text-sm font-semibold text-red-600 active:bg-red-50"
                  >
                    {t.board.delete}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-semibold text-slate-900">
                      <span className="text-slate-400">{i + 1}.</span> {p.label}
                    </span>
                    {p.assignee_participant_id &&
                      nameOf.get(p.assignee_participant_id) && (
                        <span className="block text-xs text-slate-400">
                          {nameOf.get(p.assignee_participant_id)}
                        </span>
                      )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {blockedSince && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
                        {interpolate(t.history.blockedFor, {
                          duration: durationLabel(blockedSince, t),
                        })}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[p.status]}`}
                    >
                      {t.status[p.status]}
                    </span>
                  </div>
                </div>

                {!readOnly && (
                  <div className="flex gap-2">
                    {CONTROLS.map((c) => {
                      const isActive = p.status === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          onClick={() => onTapStatus(p, c)}
                          aria-pressed={isActive}
                          className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
                            isActive
                              ? STATUS_ACTIVE[c]
                              : "border-slate-200 bg-white text-slate-600 active:bg-slate-100"
                          }`}
                        >
                          {t.status[c]}
                        </button>
                      );
                    })}
                  </div>
                )}

                {!readOnly && blockingId === p.id ? (
                  <div className="mt-2.5 flex gap-2">
                    <input
                      value={reasonDraft}
                      onChange={(e) => setReasonDraft(e.target.value)}
                      placeholder={t.board.waitingOnPlaceholder}
                      autoFocus
                      enterKeyHint="done"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveBlocked(p);
                      }}
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    />
                    <button
                      type="button"
                      onClick={() => saveBlocked(p)}
                      disabled={!reasonDraft.trim()}
                      className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {t.board.save}
                    </button>
                  </div>
                ) : (
                  p.status === "blocked" &&
                  p.blocked_reason && (
                    <p className="mt-2.5 text-sm font-medium text-red-700">
                      {interpolate(t.board.waitingOn, {
                        reason: p.blocked_reason,
                      })}
                    </p>
                  )
                )}

                <PhaseNotes
                  phaseId={p.id}
                  notes={notesByPhase[p.id] ?? []}
                  canAdd={!readOnly}
                  onAdd={(phaseId, body) => addNote(jobId, phaseId, body)}
                  onEdit={(noteId, body) => editNote(noteId, jobId, body)}
                  onDelete={(noteId) => deleteNote(noteId, jobId)}
                />

                <PhaseHistory events={phaseEvents} />

                <PhasePhotos
                  phaseId={p.id}
                  statusContext={p.status === "not_started" ? null : p.status}
                  photos={photosByPhase[p.id] ?? []}
                  canAdd={!readOnly}
                  onCreateUploadUrl={(input) =>
                    createUploadUrl({ jobId, ...input })
                  }
                  onConfirm={(input) => confirmUpload({ jobId, ...input })}
                />
              </>
            )}
          </div>
        </div>
        );
      })}

      {editMode && (
        <div className="flex gap-2">
          <input
            value={addDraft}
            onChange={(e) => setAddDraft(e.target.value)}
            placeholder={t.board.addPhasePlaceholder}
            enterKeyHint="done"
            onKeyDown={(e) => {
              if (e.key === "Enter") onAdd();
            }}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
          <button
            type="button"
            onClick={onAdd}
            disabled={!addDraft.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {t.board.add}
          </button>
        </div>
      )}
    </div>
  );
}
