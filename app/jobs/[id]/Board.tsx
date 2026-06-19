"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { Phase, PhaseStatus } from "@/lib/types";
import { setPhaseStatus } from "./actions";

type OptimisticUpdate = {
  id: string;
  status: PhaseStatus;
  blocked_reason: string | null;
};

const CONTROLS: { status: PhaseStatus; label: string; active: string }[] = [
  {
    status: "in_progress",
    label: "In progress",
    active: "bg-amber-500 text-white border-amber-500",
  },
  {
    status: "blocked",
    label: "Blocked",
    active: "bg-red-600 text-white border-red-600",
  },
  {
    status: "done",
    label: "Done",
    active: "bg-green-600 text-white border-green-600",
  },
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
  const [blockingId, setBlockingId] = useState<string | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");

  function commit(p: Phase, status: PhaseStatus, reason: string | null) {
    startTransition(async () => {
      applyOptimistic({ id: p.id, status, blocked_reason: reason });
      await setPhaseStatus(p.id, jobId, status, reason);
    });
  }

  function onTapStatus(p: Phase, status: PhaseStatus) {
    if (status === "blocked") {
      // Open the inline "waiting on ___" field instead of committing blindly.
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
    <div className="flex flex-col gap-3">
      {optimisticPhases.map((p) => (
        <div key={p.id} className="rounded-lg border border-gray-200 p-3">
          <div className="mb-2 font-medium">
            {p.sequence_index + 1}. {p.label}
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
                  className={`flex-1 rounded-md border py-3 text-sm font-semibold transition-colors ${
                    isActive
                      ? c.active
                      : "border-gray-300 bg-white text-gray-700 active:bg-gray-100"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          {blockingId === p.id ? (
            <div className="mt-2 flex gap-2">
              <input
                value={reasonDraft}
                onChange={(e) => setReasonDraft(e.target.value)}
                placeholder="Waiting on…"
                autoFocus
                enterKeyHint="done"
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveBlocked(p);
                }}
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-3 text-base outline-none focus:border-gray-900"
              />
              <button
                type="button"
                onClick={() => saveBlocked(p)}
                disabled={!reasonDraft.trim()}
                className="rounded-md bg-red-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-40"
              >
                Save
              </button>
            </div>
          ) : (
            p.status === "blocked" &&
            p.blocked_reason && (
              <p className="mt-2 text-sm font-medium text-red-700">
                ⛔ Waiting on {p.blocked_reason}
              </p>
            )
          )}
        </div>
      ))}
    </div>
  );
}
