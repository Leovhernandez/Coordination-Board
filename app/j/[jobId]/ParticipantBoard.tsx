"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { NoteView, Phase, PhaseStatus, PhotoView } from "@/lib/types";
import { STATUS_ACCENT, STATUS_ACTIVE, STATUS_PILL } from "@/lib/status";
import { useT } from "@/components/I18nProvider";
import { interpolate } from "@/lib/i18n/interpolate";
import { LangToggle } from "@/components/LangToggle";
import { PhaseNotes } from "@/components/PhaseNotes";
import { PhasePhotos } from "@/components/PhasePhotos";
import {
  addCrewNote,
  confirmCrewUpload,
  createCrewUploadUrl,
  deleteCrewNote,
  editCrewNote,
  updateAssignedPhase,
} from "./actions";

type OptimisticUpdate = {
  id: string;
  status: PhaseStatus;
  blocked_reason: string | null;
};

const CONTROLS: PhaseStatus[] = ["in_progress", "blocked", "done"];

/**
 * Crew view: shows ONLY the phases assigned to this participant (`phases` is
 * already filtered server-side, so other trades' work never reaches their
 * browser). No critical-path headline — that would reveal other phases.
 */
export function ParticipantBoard({
  jobId,
  jobName,
  participantName,
  phases,
  notesByPhase = {},
  photosByPhase = {},
}: {
  jobId: string;
  jobName: string;
  participantName: string;
  phases: Phase[];
  /** M17: notes on this crew's assigned phases (member notes + their own). */
  notesByPhase?: Record<string, NoteView[]>;
  /** M22: status-evidence photos on assigned phases (member photos + their own). */
  photosByPhase?: Record<string, PhotoView[]>;
}) {
  const t = useT();
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
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");

  function commit(p: Phase, status: PhaseStatus, reason: string | null) {
    startTransition(async () => {
      applyOptimistic({ id: p.id, status, blocked_reason: reason });
      await updateAssignedPhase(jobId, p.id, status, reason);
    });
  }

  function onTapStatus(p: Phase, status: PhaseStatus) {
    if (status === "blocked") {
      setBlockingId(p.id);
      setReasonDraft(p.blocked_reason ?? "");
      return;
    }
    setBlockingId(null);
    commit(p, status, null);
  }

  function saveBlocked(p: Phase) {
    const reason = reasonDraft.trim();
    if (!reason) return;
    setBlockingId(null);
    commit(p, "blocked", reason);
  }

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 p-4">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            {jobName}
          </h1>
          <p className="text-sm text-slate-500">
            {interpolate(t.participant.greeting, { name: participantName })}
          </p>
        </div>
        <LangToggle />
      </header>

      {optimisticPhases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <p className="text-base font-medium text-slate-700">
            {t.participant.nothingAssigned}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {t.participant.nothingAssignedHint}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {optimisticPhases.map((p) => (
            <div
              key={p.id}
              className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className={`w-1.5 shrink-0 ${STATUS_ACCENT[p.status]}`} />
              <div className="flex-1 p-3.5">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">{p.label}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[p.status]}`}
                  >
                    {t.status[p.status]}
                  </span>
                </div>

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

                {blockingId === p.id ? (
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
                  canAdd
                  onAdd={(phaseId, body) => addCrewNote(jobId, phaseId, body)}
                  onEdit={(noteId, body) => editCrewNote(jobId, noteId, body)}
                  onDelete={(noteId) => deleteCrewNote(jobId, noteId)}
                />

                <PhasePhotos
                  phaseId={p.id}
                  statusContext={p.status === "not_started" ? null : p.status}
                  photos={photosByPhase[p.id] ?? []}
                  canAdd
                  onCreateUploadUrl={(input) =>
                    createCrewUploadUrl({ jobId, ...input })
                  }
                  onConfirm={(input) => confirmCrewUpload({ jobId, ...input })}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
