"use client";

import { useState, useTransition } from "react";
import { setCollectPaymentMethod } from "./actions";
import { useT } from "@/components/I18nProvider";

/**
 * Owner opt-in switch (M21): "Ask crew for their preferred payment method."
 * Default OFF. Optimistic — flips immediately, then persists via the owner-gated
 * server action. When ON, crew see the prompt on their board and the owner /
 * owning-salesman see the value in the Crew panel.
 */
export function PaymentMethodToggle({ initial }: { initial: boolean }) {
  const t = useT();
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next); // optimistic
    startTransition(() => setCollectPaymentMethod(next));
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {t.team.paymentToggleTitle}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {t.team.paymentToggleHint}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label={t.team.paymentToggleTitle}
          onClick={toggle}
          disabled={pending}
          className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
            on ? "bg-slate-900" : "bg-slate-300"
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
              on ? "translate-x-[22px]" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </section>
  );
}
