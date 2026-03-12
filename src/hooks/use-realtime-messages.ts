"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export interface RealtimeMessage {
  id: string;
  event_id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export function useRealtimeMessages(eventId: string) {
  const [messages, setMessages] = useState<RealtimeMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    if (!eventId) {
      setIsLoading(false);
      return;
    }

    const fetchMessages = async () => {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(data as RealtimeMessage[]);
      }
      setIsLoading(false);
    };

    fetchMessages();

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
        (payload) => {
          const newMessage = payload.new as RealtimeMessage;
          setMessages((prev) => [...prev, newMessage]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  return { messages, isLoading };
}
