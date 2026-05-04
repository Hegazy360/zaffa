"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc";

/**
 * Subscribes the current browser session to Supabase Realtime INSERT events
 * on the `notifications` table, filtered to this user's rows. On each
 * event:
 *
 *   1. Invalidate the bell badge + recent-list queries so the dropdown
 *      re-renders without a manual refresh.
 *   2. Pop a transient Sonner toast surfacing the same title/body so the
 *      user sees it even while on another page.
 *
 * The hook is idempotent — mount it once anywhere in the dashboard tree
 * (typically in Navbar) and it handles teardown on unmount.
 */
export function useNotificationsRealtime(userId: string | null | undefined) {
  const utils = trpc.useUtils();
  // We hold onto the latest invalidators in a ref so the realtime callback
  // never captures a stale closure after utils change identity.
  const invalidateRef = useRef(() => {
    void utils.notifications.unreadCount.invalidate();
    void utils.notifications.recent.invalidate();
    void utils.notifications.list.invalidate();
  });
  invalidateRef.current = () => {
    void utils.notifications.unreadCount.invalidate();
    void utils.notifications.recent.invalidate();
    void utils.notifications.list.invalidate();
  };

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          invalidateRef.current();
          const row = payload.new as {
            title?: string;
            body?: string | null;
          };
          if (row?.title) {
            toast(row.title, {
              description: row.body ?? undefined,
            });
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);
}
