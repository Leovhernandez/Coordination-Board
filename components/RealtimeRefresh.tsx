"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to Postgres Changes on `phases` and refreshes the server-rendered
 * route when a relevant change lands, so the board/dashboard (and the
 * critical-path headline) update live without a manual refresh.
 *
 * RLS-scoped: the authenticated owner only receives events for rows they can
 * SELECT, so a participant's edit (written via service-role) is delivered to
 * the owner here. Requires `phases` to be in the supabase_realtime publication.
 */
export function RealtimeRefresh({
  channelName,
  filter,
}: {
  channelName: string;
  filter?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "phases",
          ...(filter ? { filter } : {}),
        },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [channelName, filter, router]);

  return null;
}
