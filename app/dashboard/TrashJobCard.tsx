"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/components/I18nProvider";
import { interpolate } from "@/lib/i18n/interpolate";
import { restoreJob, purgeJob } from "@/app/jobs/[id]/actions";

/**
 * M10 Trash card — a soft-deleted job the viewer owns, with Restore and
 * permanent-Delete actions. Restore is reversible (no confirm); permanent delete
 * is irreversible, so it confirms first. Both call the job server actions (RLS +
 * the purgeJob canEdit re-check enforce who may act); router.refresh() drops the
 * card from the list once the action lands.
 */
export function TrashJobCard({
  id,
  name,
  customerName,
  address,
}: {
  id: string;
  name: string;
  customerName: string | null;
  address: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function onRestore() {
    startTransition(async () => {
      await restoreJob(id);
      router.refresh();
    });
  }

  function onPurge() {
    if (!confirm(interpolate(t.trash.deleteForeverConfirm, { name }))) return;
    startTransition(async () => {
      await purgeJob(id);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">{name}</h3>
      {(customerName || address) && (
        <p className="mt-0.5 text-xs text-slate-500">
          {[customerName, address].filter(Boolean).join(" · ")}
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onRestore}
          disabled={pending}
          className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 active:bg-slate-100 disabled:opacity-50"
        >
          {t.trash.restore}
        </button>
        <button
          type="button"
          onClick={onPurge}
          disabled={pending}
          className="flex-1 rounded-lg border border-red-200 py-2 text-sm font-semibold text-red-600 active:bg-red-50 disabled:opacity-50"
        >
          {t.trash.deleteForever}
        </button>
      </div>
    </div>
  );
}
