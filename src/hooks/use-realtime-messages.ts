"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { trpc } from "@/lib/trpc";

/**
 * Subscribes to Supabase Realtime for new INSERTs on the `messages` table
 * scoped to a given event, and invalidates the tRPC `messages.byEvent`
 * query so the panel re-fetches with full server-side joins (sender, etc.)
 * instead of trying to reconstruct the row from the realtime payload.
 *
 * The trpc query keeps a slow refetchInterval as a fallback, but the
 * realtime subscription is what makes the panel feel instantaneous.
 *
 * Pass an empty string to disable.
 */
export function useRealtimeMessageSync(eventId: string): void {
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!eventId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`messages:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `event_id=eq.${eventId}`,
        },
        () => {
          utils.messages.byEvent.invalidate({ eventId });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId, utils]);
}
