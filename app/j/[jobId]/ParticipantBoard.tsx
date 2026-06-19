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
import { updateAssignedPhase } from "./actions";

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

export function ParticipantBoard({
  jobId,
  jobName,
  participantId,
  participantName,
  phases,
}: {
  jobId: string;
  jobName: string;
  participantId: string;
  participantName: string;
  phases: Phase[];
}) {
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

  const mine = optimisticPhases.filter(
    (p) => p.assignee_participant_id === participantId,
  ).length;

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col gap-4 p-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {jobName}
        </h1>
        <p className="text-sm text-slate-500">
          Hi {participantName} — tap to update{" "}
          {mine === 0 ? "your phases" : mine === 1 ? "your phase" : "your phases"}.
        </p>
      </header>

      <Headline data={computeHeadline(optimisticPhases)} />

      <div className="flex flex-col gap-3">
        {optimisticPhases.map((p, i) => {
          const editable = p.assignee_participant_id === participantId;
          return (
            <div
              key={p.id}
              className={`flex overflow-hidden rounded-xl border bg-white shadow-sm ${
                editable ? "border-slate-200" : "border-slate-100"
              }`}
            >
              <div className={`w-1.5 shrink-0 ${STATUS_ACCENT[p.status]}`} />
              <div className={`flex-1 p-3.5 ${editable ? "" : "opacity-60"}`}>
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

                {editable ? (
                  <>
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
                ) : (
                  <p className="text-xs text-slate-400">
                    {p.status === "blocked" && p.blocked_reason
                      ? `⛔ Waiting on ${p.blocked_reason}`
                      : "Not assigned to you"}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
