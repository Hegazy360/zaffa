"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export type EventStatus =
  | "draft"
  | "planning"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled";

export function useRealtimeStatus(eventId: string) {
  const [status, setStatus] = useState<EventStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!eventId) {
      setIsLoading(false);
      return;
    }

    const fetchStatus = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select("status")
        .eq("id", eventId)
        .single();

      if (!error && data) {
        setStatus(data.status as EventStatus);
      }
      setIsLoading(false);
    };

    fetchStatus();

    const channel = supabase
      .channel(`events:${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "events",
          filter: `id=eq.${eventId}`,
        },
        (payload) => {
          const updated = payload.new as { status: EventStatus };
          setStatus(updated.status);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  return { status, isLoading };
}
