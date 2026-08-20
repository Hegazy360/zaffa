"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNotificationsRealtime } from "@/hooks/use-notifications";

/**
 * The bell in the Navbar. Renders an unread-count badge, a dropdown with
 * the 10 most recent notifications, and a "mark all read" action. Clicking
 * a notification both marks it read and navigates to its deep-link.
 *
 * Only renders when we know the current user's id — we don't want an
 * empty bell icon next to the "Sign in" button for anonymous visitors.
 */
export function NotificationBell({ userId }: { userId: string }) {
  useNotificationsRealtime(userId);
  const t = useTranslations("notifications");
  const router = useRouter();
  const utils = trpc.useUtils();

  // `retry: false` keeps the bell quiet if the notifications table doesn't
  // exist yet (e.g. before the 00002 migration ran) or the user's DB is
  // temporarily unavailable. We just render an empty bell in that case
  // rather than spamming errors.
  const { data: count } = trpc.notifications.unreadCount.useQuery(undefined, {
    refetchInterval: 60_000,
    retry: false,
  });
  const { data: recent } = trpc.notifications.recent.useQuery(
    { limit: 10 },
    { refetchInterval: 60_000, retry: false },
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => {
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.recent.invalidate();
      void utils.notifications.list.invalidate();
    },
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onSuccess: () => {
      void utils.notifications.unreadCount.invalidate();
      void utils.notifications.recent.invalidate();
      void utils.notifications.list.invalidate();
    },
  });

  const unread = count?.count ?? 0;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("ariaLabel")}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -end-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-gradient-to-br from-rose-600 to-amber-500 px-1 text-xs font-semibold leading-none text-white ring-2 ring-background">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-96 max-w-[calc(100vw-2rem)] p-0"
      >
        <div className="flex items-center justify-between border-b border-brand-line px-4 py-3">
          <div>
            <p className="text-sm font-medium">{t("title")}</p>
            {unread > 0 && (
              <p className="text-xs text-muted-foreground">
                {t("unreadCount", { count: unread })}
              </p>
            )}
          </div>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50"
              disabled={markAllRead.isPending}
            >
              <CheckCheck className="h-3 w-3" />
              {t("markAllRead")}
            </button>
          )}
        </div>

        <div className="max-h-[70vh] overflow-y-auto">
          {recent === undefined ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              {t("loading")}
            </div>
          ) : recent.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <Bell className="mx-auto h-6 w-6 text-muted-foreground/60" />
              <p className="mt-2 text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          ) : (
            <ul className="divide-y divide-rose-50">
              {recent.map((n) => {
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
                        "group flex w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-rose-50/60",
                        isUnread && "bg-rose-50/40",
                      )}
                    >
                      <span
                        className={cn(
                          "mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full",
                          isUnread
                            ? "bg-gradient-to-br from-rose-600 to-amber-500"
                            : "bg-transparent",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {n.title}
                        </p>
                        {n.body && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {n.body}
                          </p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground/80">
                          {formatRelative(n.created_at)}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-brand-line p-2">
          <Link
            href="/dashboard/notifications"
            className="block rounded-lg px-3 py-2 text-center text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50"
          >
            {t("viewAll")}
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Small in-file relative-time formatter. Avoids pulling date-fns just for
// a dropdown that shows approximate recency.
function formatRelative(input: string | Date): string {
  const when = typeof input === "string" ? new Date(input) : input;
  const diffMs = Date.now() - when.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d`;
  return when.toLocaleDateString();
}
