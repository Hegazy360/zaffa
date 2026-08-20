"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, CheckCheck, Loader2, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tab = "all" | "unread";

export default function NotificationsInboxPage() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const utils = trpc.useUtils();
  const [tab, setTab] = useState<Tab>("all");

  const query = trpc.notifications.list.useInfiniteQuery(
    { limit: 20, unreadOnly: tab === "unread" },
    {
      getNextPageParam: (last) => last.nextCursor,
      initialCursor: undefined,
      retry: false,
    },
  );
  const { data: countData } = trpc.notifications.unreadCount.useQuery(
    undefined,
    { refetchInterval: 60_000, retry: false },
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.recent.invalidate();
    },
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: (res) => {
      if (res.updated > 0) toast.success(t("markAllRead"));
      void utils.notifications.list.invalidate();
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.recent.invalidate();
    },
  });

  const unread = countData?.count ?? 0;
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-3">
            <p className="text-eyebrow font-medium text-rose-700/80">
              {t("pageEyebrow")}
            </p>
            <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
              {t("pageTitle")}
            </h1>
            {unread > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("unreadCount", { count: unread })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unread > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                <CheckCheck className="size-4" />
                {t("markAllRead")}
              </Button>
            )}
            <Link
              href="/dashboard/notifications/preferences"
              className="inline-flex h-7 items-center gap-1 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2.5 text-[0.8rem] font-medium text-foreground transition-colors hover:bg-muted"
            >
              <Settings2 className="size-3.5" />
              {t("settingsTitle")}
            </Link>
          </div>
        </header>

        <div className="mb-4 inline-flex rounded-full border border-brand-line bg-white/70 p-1 backdrop-blur-sm">
          <TabButton
            active={tab === "all"}
            onClick={() => setTab("all")}
            label={t("allTab")}
          />
          <TabButton
            active={tab === "unread"}
            onClick={() => setTab("unread")}
            label={t("unreadTab")}
            badge={unread > 0 ? unread : undefined}
          />
        </div>

        <section className="overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
          {query.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-5 animate-spin text-rose-500" />
            </div>
          ) : items.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <Bell className="mx-auto size-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                {t("empty")}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-rose-50">
              {items.map((n) => {
                const isUnread = !n.read_at;
                const handleClick = () => {
                  if (isUnread) markRead.mutate({ id: n.id });
                  if (n.link) router.push(n.link);
                };
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={handleClick}
                      className={cn(
                        "group flex w-full items-start gap-4 px-6 py-4 text-start transition-colors hover:bg-rose-50/60",
                        isUnread && "bg-rose-50/30",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "mt-2 inline-block size-2 shrink-0 rounded-full",
                          isUnread
                            ? "bg-gradient-to-br from-rose-600 to-amber-500"
                            : "bg-transparent ring-1 ring-rose-100",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1.5 text-xs text-muted-foreground/80">
                          {formatDateTime(n.created_at)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {query.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              size="sm"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
              className="gap-1"
            >
              {query.isFetchingNextPage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {t("loadMore")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm transition-colors",
        active
          ? "bg-brand-gradient text-white shadow-sm"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      {badge !== undefined && (
        <span
          className={cn(
            "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-xs font-semibold",
            active
              ? "bg-white/25 text-white"
              : "bg-rose-100 text-rose-800",
          )}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

function formatDateTime(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
