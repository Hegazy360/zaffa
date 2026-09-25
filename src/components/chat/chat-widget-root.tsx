"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageCircleQuestion, X } from "lucide-react";
import { useChatStore } from "@/stores/chat-store";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/**
 * The floating chat entry point, mounted once from the root layout behind
 * the `aiChat` flag (flag off = no markup, no chunk).
 *
 * The launcher is the only thing in the shared bundle; the panel loads via
 * `next/dynamic` on first open so the marketing page pays ~nothing for
 * visitors who never chat.
 *
 * The denylist keeps it off working surfaces: dashboards (admin included),
 * the designer (its own focused flow, plus Turnstile already lives there),
 * auth/checkout (money in motion), the reveal/microsite/family-vote share
 * surfaces, and /enquire (the chat's own handoff target, a chat bubble on the form
 * it points to is a loop).
 */
const HIDDEN_PREFIXES = [
  "/dashboard",
  "/venue-designer",
  "/auth",
  "/checkout",
  "/r/",
  "/v/",
  "/s/",
  "/enquire",
  "/kitchen-sink",
  "/report-bug",
];

const ChatPanel = dynamic(
  () => import("./chat-panel").then((m) => m.ChatPanel),
  { ssr: false },
);

export function ChatWidgetRoot() {
  const pathname = usePathname();
  const t = useTranslations("chat");
  const { isOpen, open, close } = useChatStore();

  if (HIDDEN_PREFIXES.some((p) => pathname === p.replace(/\/$/, "") || pathname.startsWith(p))) {
    return null;
  }

  return (
    <>
      {isOpen && <ChatPanel />}
      <button
        type="button"
        aria-label={isOpen ? t("close") : t("launcherLabel")}
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) {
            close();
          } else {
            open();
            track(ANALYTICS_EVENTS.CHAT_OPENED, { source: "launcher" });
          }
        }}
        // Logical inset so RTL flips it to the bottom-left; z below sonner's
        // toaster; safe-area padding for iOS home-indicator phones.
        className="fixed bottom-4 end-4 z-40 grid size-14 place-items-center rounded-full bg-brand-gradient text-white shadow-glow transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-600 [margin-bottom:env(safe-area-inset-bottom)]"
      >
        {isOpen ? (
          <X className="size-6" aria-hidden />
        ) : (
          <MessageCircleQuestion className="size-6" aria-hidden />
        )}
      </button>
    </>
  );
}
