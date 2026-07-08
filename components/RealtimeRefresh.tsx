"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

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
 * pass it when every table shares that column.
 *
 * TOKEN-BEFORE-SUBSCRIBE (hardened after the M25-era outage — binding, §6):
 * a channel that joins before the user's session token is on the realtime
 * socket registers with `anon` claims. Realtime REJECTS a filtered
 * postgres_changes subscription whose claims-role cannot SELECT the filter
 * column ("invalid column for filter …"), so the board silently went deaf while
 * the channel still reported SUBSCRIBED. The awaited getSession() (which also
 * refreshes an expired access token) + realtime.setAuth() BEFORE any subscribe
 * is load-bearing. On top of that:
 *   - token refreshes are pushed to the socket (onAuthStateChange → setAuth);
 *   - CHANNEL_ERROR / TIMED_OUT retries with backoff, and a recovered channel
 *     fires one refresh to catch up on anything missed while it was down;
 *   - a tab returning to visibility refreshes once (phones sleep sockets).
 * Member boards ALSO mount BroadcastRefresh as an independent second path —
 * live-refresh must survive either mechanism failing (§6, owner-mandated).
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
    let cancelled = false;
    const channels = new Map<string, RealtimeChannel>();
    const retryTimers = new Map<string, ReturnType<typeof setTimeout>>();
    const attempts = new Map<string, number>();
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleRefresh() {
      if (refreshTimer) clearTimeout(refreshTimer);
      // Coalesce event bursts into one navigation refresh.
      refreshTimer = setTimeout(() => router.refresh(), 150);
    }

    function subscribeTable(table: string) {
      if (cancelled) return;
      const existing = channels.get(table);
      if (existing) supabase.removeChannel(existing);

      const channel = supabase.channel(`${channelName}-${table}`).on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(filter ? { filter } : {}),
        },
        scheduleRefresh,
      );
      channel.subscribe((status, err) => {
        if (cancelled) return;
        if (status === "SUBSCRIBED") {
          // Recovered after an error: refresh once — events during the dead
          // window are gone, so re-fetch rather than trust the gap was quiet.
          if ((attempts.get(table) ?? 0) > 0) {
            attempts.set(table, 0);
            scheduleRefresh();
          }
          return;
        }
        if (status === "CLOSED") return;
        // CHANNEL_ERROR / TIMED_OUT: the join or the server-side subscription
        // failed. Retry with backoff — the rejoin carries the CURRENT socket
        // token, so a channel that raced the session recovers here.
        const attempt = (attempts.get(table) ?? 0) + 1;
        attempts.set(table, attempt);
        const delay = Math.min(1000 * 2 ** attempt, 30_000);
        retryTimers.set(
          table,
          setTimeout(() => subscribeTable(table), delay),
        );
        if (process.env.NODE_ENV === "development") {
          console.warn(`RealtimeRefresh ${channelName}-${table}: ${status}`, err);
        }
      });
      channels.set(table, channel);
    }

    (async () => {
      // Load the cookie session (refreshing an expired access token) and put
      // it on the realtime socket BEFORE any channel joins — see header note.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;
      for (const table of tablesKey.split(",")) subscribeTable(table);
    })();

    // Long-lived pages (a board left open on a counter): keep the socket's
    // token fresh so RLS-gated delivery doesn't die when the JWT expires.
    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void supabase.realtime.setAuth(session.access_token);
    });

    // Catch-up on wake: a phone tab returning from sleep likely dropped the
    // socket and missed events; one refresh restores truth immediately.
    const onVisible = () => {
      if (document.visibilityState === "visible") scheduleRefresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      authSub.unsubscribe();
      document.removeEventListener("visibilitychange", onVisible);
      for (const t of retryTimers.values()) clearTimeout(t);
      if (refreshTimer) clearTimeout(refreshTimer);
      for (const channel of channels.values()) supabase.removeChannel(channel);
    };
  }, [channelName, filter, tablesKey, router]);

  return null;
}
