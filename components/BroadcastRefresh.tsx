"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Live-refresh for participant boards. Subscribes to a job's public broadcast
 * channel (anon-friendly — no RLS needed) and refreshes when the GC assigns or
 * anyone updates a phase, so the crew's view updates without manual refresh.
 */
export function BroadcastRefresh({ jobId }: { jobId: string }) {
  const router = useRouter();
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const topic = `job-${jobId}`;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel = supabase.channel(topic);

    function scheduleRefresh() {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      // Coalesce bursts (e.g. reorder + assign) into one navigation refresh.
      refreshTimer.current = setTimeout(() => router.refresh(), 150);
    }

    function subscribe(attempt = 0) {
      if (cancelled) return;
      supabase.removeChannel(channel);
      channel = supabase.channel(topic).on(
        "broadcast",
        { event: "change" },
        scheduleRefresh,
      );

      channel.subscribe((status, err) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") return;
        if (status === "CLOSED") return;
        // CHANNEL_ERROR / TIMED_OUT — retry with backoff (mobile networks).
        const delay = Math.min(1000 * 2 ** attempt, 30_000);
        retryTimer = setTimeout(() => subscribe(attempt + 1), delay);
        if (process.env.NODE_ENV === "development") {
          console.warn(`BroadcastRefresh ${topic}: ${status}`, err);
        }
      });
    }

    subscribe();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      supabase.removeChannel(channel);
    };
  }, [jobId, router]);

  return null;
}