"use client";

import { useState, useTransition } from "react";
import { PAYMENT_TYPES } from "@/lib/types";
import { useT } from "@/components/I18nProvider";

/**
 * Crew preferred-payment field (M21). Rendered only when the org opted in. A
 * compact method select + free-text detail, saved via a token-scoped server
 * action. Never a headline element — it sits below the header, above the phases,
 * so the board still reads one-handed in 3 seconds (§7).
 */
export function PaymentPrompt({
  type,
  detail,
  onSave,
}: {
  type: string | null;
  detail: string | null;
  onSave: (type: string | null, detail: string | null) => void | Promise<void>;
}) {
  const t = useT();
  const [selType, setSelType] = useState(type ?? "");
  const [detailVal, setDetailVal] = useState(detail ?? "");
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState(0);

  const dirty =
    (selType || "") !== (type ?? "") ||
    (selType ? detailVal.trim() : "") !== (detail ?? "");

  function save() {
    const nextType = selType || null;
    const nextDetail = nextType ? detailVal.trim() || null : null;
    startTransition(async () => {
      await onSave(nextType, nextDetail);
      setSavedAt(Date.now());
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <p className="text-sm font-semibold text-slate-900">
        {t.payment.promptTitle}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{t.payment.promptHint}</p>
      <div className="mt-2.5 flex flex-col gap-2">
        <select
          value={selType}
          onChange={(e) => setSelType(e.target.value)}
          aria-label={t.payment.typeLabel}
          className="rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
        >
          <option value="">{t.payment.choose}</option>
          {PAYMENT_TYPES.map((pt) => (
            <option key={pt} value={pt}>
              {t.payment.types[pt]}
            </option>
          ))}
        </select>
        {selType && (
          <input
            value={detailVal}
            onChange={(e) => setDetailVal(e.target.value)}
            placeholder={t.payment.detailPlaceholder}
            className="rounded-lg border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
          />
        )}
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="self-start rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {savedAt > 0 && !dirty ? t.payment.saved : t.payment.save}
        </button>
      </div>
    </section>
  );
}
