"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export function usePresence(channelName: string, userId: string) {
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    if (!channelName || !userId) return;

    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: userId,
        },
      },
    });

    const updateOnlineUsers = () => {
      const state = channel.presenceState();
      const users = [
        ...new Set(
          Object.values(state)
            .flat()
            .map((p) => (p as { user_id?: string }).user_id)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      setOnlineUsers(users);
    };

    channel
      .on("presence", { event: "sync" }, updateOnlineUsers)
      .on("presence", { event: "join" }, updateOnlineUsers)
      .on("presence", { event: "leave" }, updateOnlineUsers)
      .subscribe(async (status) => {
        setIsConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") {
          await channel.track({ user_id: userId });
        }
      });

    return () => {
      channel.untrack();
      supabase.removeChannel(channel);
    };
  }, [channelName, userId, supabase]);

  return { onlineUsers, isConnected };
}
