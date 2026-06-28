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
 * One channel PER table (not one shared channel with several bindings): if a
 * bound table isn't in the supabase_realtime publication, Realtime errors that
 * table's channel — and a SHARED channel would take the healthy bindings down
 * with it, silently killing live refresh for the whole page (this is exactly
 * what an unpublished `org_members` did to the dashboard's phases+jobs). Isolated
 * channels contain the failure to the offending table.
 *
 * RLS-scoped: the authenticated user only receives events for rows they can
 * SELECT, so a participant's edit (written via service-role) is delivered to the
 * owner here. `filter` (e.g. job_id=eq.X) applies to every listed table, so only
 * pass it when every table shares that column (the single-table `phases` board).
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
    const channels = tablesKey.split(",").map((table) => {
      const channel = supabase.channel(`${channelName}-${table}`).on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        () => router.refresh(),
      );
      channel.subscribe((status, err) => {
        // Surface a dead subscription (e.g. table not in the publication) so a
        // silent live-refresh failure is diagnosable instead of invisible.
        if (
          process.env.NODE_ENV === "development" &&
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
        ) {
          console.warn(`RealtimeRefresh ${channelName}-${table}: ${status}`, err);
        }
      });
      return channel;
    });

    return () => {
      for (const channel of channels) supabase.removeChannel(channel);
    };
  }, [channelName, filter, tablesKey, router]);

  return null;
}
