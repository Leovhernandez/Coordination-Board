"use client";

import { useState } from "react";

/**
 * Copies a pre-filled sign-in link for an invited salesman, e.g.
 * https://app/login?email=sam@co.com — the owner texts it, the salesman taps it
 * and their email is already filled in, so they sign in in one more tap. (This
 * is the simple flow until auto-email invites land.)
 */
export function CopyInviteLink({ email }: { email: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/login?email=${encodeURIComponent(email)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — fall back to a prompt the owner can copy from.
      window.prompt("Copy this sign-in link to text them:", link);
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 active:bg-slate-100"
    >
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
