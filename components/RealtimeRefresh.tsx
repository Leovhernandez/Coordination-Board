"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Postgres Changes on one or more tables and refreshes the
 * server-rendered route when a relevant change lands, so the board/dashboard
 * (and the critical-path headline + the owner's roll-up) update live without a
 * manual refresh.
 *
 * RLS-scoped: the authenticated user only receives events for rows they can
 * SELECT, so a participant's edit (written via service-role) is delivered to the
 * owner here. Each table must be in the supabase_realtime publication. `filter`
 * (e.g. job_id=eq.X) applies to every listed table, so only pass it when every
 * table shares that column (the single-table `phases` job board does).
 */
export function RealtimeRefresh({
  channelName,
  filter,
  tables = ["phases"],
}: {
  channelName: string;
  filter?: string;
  tables?: string[];
}) {
  const router = useRouter();
  // Stable across renders so the effect doesn't resubscribe each time.
  const tablesKey = tables.join(",");

  useEffect(() => {
    const supabase = createClient();
    let channel = supabase.channel(channelName);
    for (const table of tablesKey.split(",")) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        () => router.refresh(),
      );
    }
    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, filter, tablesKey, router]);

  return null;
}
