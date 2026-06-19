"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { Phase, PhaseStatus } from "@/lib/types";
import {
  STATUS_ACCENT,
  STATUS_ACTIVE,
  STATUS_LABEL,
  STATUS_PILL,
} from "@/lib/status";
import { computeHeadline } from "@/lib/critical-path";
import { Headline } from "@/components/Headline";
import {
  addPhase,
  deletePhase,
  movePhase,
  renamePhase,
  setPhaseStatus,
} from "./actions";

type OptimisticUpdate = {
  id: string;
  status: PhaseStatus;
  blocked_reason: string | null;
};

const CONTROLS: { status: PhaseStatus; label: string }[] = [
  { status: "in_progress", label: "In progress" },
  { status: "blocked", label: "Blocked" },
  { status: "done", label: "Done" },
];

export function Board({ jobId, phases }: { jobId: string; phases: Phase[] }) {
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
    if (!confirm(`Delete phase "${p.label}"?`)) return;
    startTransition(() => deletePhase(p.id, jobId));
  }

  function onAdd() {
    const label = addDraft.trim();
    if (!label) return;
    setAddDraft("");
    startTransition(() => addPhase(jobId, label));
  }

  return (
    <div className="flex flex-col gap-3">
      {!editMode && <Headline data={computeHeadline(optimisticPhases)} />}

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
          {editMode ? "Done editing" : "Edit phases"}
        </button>
      </div>

      {optimisticPhases.map((p, i) => (
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
                  aria-label="Phase name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-base font-medium outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onMove(p, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-30"
                  >
                    ↑ Up
                  </button>
                  <button
                    type="button"
                    onClick={() => onMove(p, 1)}
                    disabled={i === optimisticPhases.length - 1}
                    aria-label="Move down"
                    className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 active:bg-slate-100 disabled:opacity-30"
                  >
                    ↓ Down
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(p)}
                    className="flex-1 rounded-lg border border-red-200 py-2.5 text-sm font-semibold text-red-600 active:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-900">
                    <span className="text-slate-400">{i + 1}.</span> {p.label}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[p.status]}`}
                  >
                    {STATUS_LABEL[p.status]}
                  </span>
                </div>

                <div className="flex gap-2">
                  {CONTROLS.map((c) => {
                    const isActive = p.status === c.status;
                    return (
                      <button
                        key={c.status}
                        type="button"
                        onClick={() => onTapStatus(p, c.status)}
                        aria-pressed={isActive}
                        className={`flex-1 rounded-lg border py-2.5 text-sm font-semibold transition-colors ${
                          isActive
                            ? STATUS_ACTIVE[c.status]
                            : "border-slate-200 bg-white text-slate-600 active:bg-slate-100"
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>

                {blockingId === p.id ? (
                  <div className="mt-2.5 flex gap-2">
                    <input
                      value={reasonDraft}
                      onChange={(e) => setReasonDraft(e.target.value)}
                      placeholder="Waiting on…"
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
                      Save
                    </button>
                  </div>
                ) : (
                  p.status === "blocked" &&
                  p.blocked_reason && (
                    <p className="mt-2.5 text-sm font-medium text-red-700">
                      ⛔ Waiting on {p.blocked_reason}
                    </p>
                  )
                )}
              </>
            )}
          </div>
        </div>
      ))}

      {editMode && (
        <div className="flex gap-2">
          <input
            value={addDraft}
            onChange={(e) => setAddDraft(e.target.value)}
            placeholder="Add a phase…"
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
            Add
          </button>
        </div>
      )}
    </div>
  );
}
