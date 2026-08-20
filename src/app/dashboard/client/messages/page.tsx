"use client";

import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

import { useFormatters } from "@/lib/use-formatters";
export default function MessagesInboxPage() {
  const f = useFormatters();
  const tc = useTranslations("client");
  const { data: inbox, isLoading } = trpc.messages.inbox.useQuery();

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />

      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <header className="mb-10 space-y-3">
          <p className="text-eyebrow font-medium text-rose-700/80">
            {tc("conversations")}
          </p>
          <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {tc("messagesTitle")}
          </h1>
          <p className="max-w-lg text-pretty text-sm text-muted-foreground sm:text-base">
            {tc("messagesPageIntro")}
          </p>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="size-6 animate-spin text-rose-500" />
          </div>
        ) : !inbox || inbox.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-6 py-20 text-center backdrop-blur-sm">
            <div className="mb-5 grid size-14 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
              <MessageSquare className="size-6 text-rose-600" />
            </div>
            <h3 className="font-display text-xl font-light tracking-tight">
              {tc("noConversations")}
            </h3>
            <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
              {tc("noConversationsBody")}
            </p>
            <Button
              render={<Link href="/dashboard/client" />}
              className="mt-6 h-10 gap-2 bg-brand-gradient px-5 text-white shadow-glow-sm hover:opacity-90"
            >
              {tc("backToDashboard")}
              <ArrowRight className="size-4 rtl:-scale-x-100" />
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {inbox.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/dashboard/client/event/${row.id}?tab=messages`}
                  className="group flex items-center gap-4 rounded-2xl border border-brand-line bg-white/80 p-4 backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_15px_40px_-20px_rgba(244,63,94,0.25)]"
                >
                  <div className="size-16 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br from-rose-50 to-amber-50/60">
                    {row.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.thumbnail}
                        alt={row.title}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]"
                      />
                    ) : (
                      <div className="grid h-full place-items-center">
                        <ImageIcon className="size-5 text-rose-400/70" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-display truncate text-base font-medium leading-tight tracking-tight">
                        {row.title}
                      </p>
                      {row.lastMessage && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {f.relativeTime(row.lastMessage.created_at)}
                        </span>
                      )}
                    </div>
                    {row.event_date && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="size-3" />
                        {f.date(row.event_date, "long")}
                      </p>
                    )}
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {row.lastMessage ? (
                        <>
                          <span className="font-medium text-foreground/80">
                            {row.lastMessage.sender.full_name}:
                          </span>{" "}
                          {row.lastMessage.content}
                        </>
                      ) : (
                        <span className="italic">
                          {tc("noMessagesYet")}
                        </span>
                      )}
                    </p>
                  </div>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
