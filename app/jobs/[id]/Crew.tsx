"use client";

import { useEffect, useState, useTransition } from "react";
import { addParticipant, revokeParticipant } from "./actions";
import { useT } from "@/components/I18nProvider";
import { interpolate } from "@/lib/i18n/interpolate";

export type CrewMember = {
  id: string;
  name: string;
  phone: string | null;
  link: string;
};

export function Crew({
  jobId,
  crew,
}: {
  jobId: string;
  crew: CrewMember[];
}) {
  const t = useT();
  const [, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // sms: links only make sense on a phone — hide "Text it" on desktop.
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    setIsTouch(window.matchMedia("(pointer: coarse)").matches);
  }, []);

  function onAdd() {
    const n = name.trim();
    if (!n) return;
    setName("");
    setPhone("");
    startTransition(() => addParticipant(jobId, n, phone.trim() || null));
  }

  async function onCopy(member: CrewMember) {
    try {
      await navigator.clipboard.writeText(member.link);
      setCopiedId(member.id);
      setTimeout(() => setCopiedId((c) => (c === member.id ? null : c)), 1500);
    } catch {
      // Clipboard blocked — the link is shown below for manual copy.
    }
  }

  function onRevoke(member: CrewMember) {
    if (!confirm(interpolate(t.crew.revokeConfirm, { name: member.name }))) return;
    startTransition(() => revokeParticipant(member.id, jobId));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold text-slate-900">{t.crew.title}</h2>
      <p className="mb-3 text-xs text-slate-500">{t.crew.description}</p>

      <div className="flex flex-col gap-3">
        {crew.map((m) => (
          <div
            key={m.id}
            className="rounded-lg border border-slate-200 p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-900">{m.name}</span>
              <button
                type="button"
                onClick={() => onRevoke(m)}
                className="text-xs font-medium text-red-600"
              >
                {t.crew.revoke}
              </button>
            </div>
            {m.phone && (
              <p className="text-xs text-slate-500">{m.phone}</p>
            )}
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                onClick={() => onCopy(m)}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white active:bg-slate-700"
              >
                {copiedId === m.id ? t.crew.copied : t.crew.copyLink}
              </button>
              {m.phone && isTouch && (
                <a
                  href={`sms:${m.phone}?body=${encodeURIComponent(
                    interpolate(t.crew.textBody, { link: m.link }),
                  )}`}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 active:bg-slate-100"
                >
                  {t.crew.textIt}
                </a>
              )}
            </div>
            <p className="mt-2 break-all text-[11px] text-slate-400">{m.link}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.crew.subName}
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
        />
        <div className="flex gap-2">
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder={t.crew.phonePlaceholder}
            inputMode="tel"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
          <button
            type="button"
            onClick={onAdd}
            disabled={!name.trim()}
            className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {t.crew.add}
          </button>
        </div>
      </div>
    </section>
  );
}
