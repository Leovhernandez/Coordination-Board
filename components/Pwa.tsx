"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker app-wide and shows a small, dismissible install
 * hint on iOS (which has no automatic install prompt). Android/Chromium get the
 * browser's own prompt. Install is always optional — never blocks the app.
 */
export function Pwa() {
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {});
    }

    const isIOS =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      !("MSStream" in window);
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    const dismissed = localStorage.getItem("cb_ios_hint") === "dismissed";

    if (isIOS && !isStandalone && !dismissed) setShowIosHint(true);
  }, []);

  if (!showIosHint) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
      <span className="flex-1 text-slate-700">
        Install: tap <span aria-hidden>⎋</span> Share, then{" "}
        <span className="font-medium">Add to Home Screen</span>.
      </span>
      <button
        type="button"
        onClick={() => {
          localStorage.setItem("cb_ios_hint", "dismissed");
          setShowIosHint(false);
        }}
        className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-500"
      >
        Dismiss
      </button>
    </div>
  );
}
