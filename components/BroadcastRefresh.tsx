"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Live-refresh for participant boards. Subscribes to a job's public broadcast
 * channel (anon-friendly — no RLS needed) and refreshes when the GC assigns or
 * anyone updates a phase, so the crew's view updates without manual refresh.
 */
export function BroadcastRefresh({ jobId }: { jobId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`job-${jobId}`)
      .on("broadcast", { event: "change" }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, router]);

  return null;
}
