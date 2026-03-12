"use client";

import { useRef, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRealtimeMessages } from "@/hooks/use-realtime-messages";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  eventId: string;
  currentUserId: string;
}

export function ChatPanel({ eventId, currentUserId }: ChatPanelProps) {
  const [input, setInput] = useState("");
  const [senderNames, setSenderNames] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const { messages, isLoading } = useRealtimeMessages(eventId);
  const supabase = createClient();

  useEffect(() => {
    const uniqueSenders = [...new Set(messages.map((m) => m.sender_id))];
    if (uniqueSenders.length === 0) return;

    const fetchProfiles = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", uniqueSenders);

      if (data) {
        const map: Record<string, string> = {};
        data.forEach((p) => {
          map[p.id] = p.full_name ?? "Unknown";
        });
        setSenderNames((prev) => ({ ...prev, ...map }));
      }
    };

    fetchProfiles();
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content) return;

    setInput("");
    await supabase.from("messages").insert({
      event_id: eventId,
      sender_id: currentUserId,
      content,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Card className="flex flex-col h-[400px]">
      <CardHeader className="py-3 border-b">
        <CardTitle className="text-base">Event Chat</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Loading messages...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No messages yet. Start the conversation!
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex gap-3",
                  msg.sender_id === currentUserId && "flex-row-reverse"
                )}
              >
                <Avatar size="sm" className="shrink-0">
                  <AvatarImage src={undefined} />
                  <AvatarFallback>
                    {(senderNames[msg.sender_id] ?? "?")
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div
                  className={cn(
                    "max-w-[75%] rounded-lg px-3 py-2",
                    msg.sender_id === currentUserId
                      ? "bg-primary text-primary-foreground ml-auto"
                      : "bg-muted"
                  )}
                >
                  <p className="text-xs font-medium opacity-80 mb-0.5">
                    {senderNames[msg.sender_id] ?? "Loading..."}
                  </p>
                  <p className="text-sm break-words">{msg.content}</p>
                  <p className="text-[10px] opacity-70 mt-1">
                    {new Date(msg.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))
          )}
          <div ref={scrollRef} />
        </div>
        <div className="p-3 border-t flex gap-2">
          <Input
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
          />
          <Button size="icon" onClick={handleSend} disabled={!input.trim()}>
            <Send className="size-4" />
            <span className="sr-only">Send</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
