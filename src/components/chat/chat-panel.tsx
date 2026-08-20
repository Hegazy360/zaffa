"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Loader2, MessageCircle, SendHorizonal } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { whatsappLink } from "@/lib/contact-channels";
import { Turnstile } from "@/components/security/Turnstile";
import { useIsAnonymous } from "@/lib/use-is-anonymous";
import { useChatStore, type ChatBubble } from "@/stores/chat-store";

/**
 * The chat conversation view. Loaded on first open via next/dynamic.
 *
 * Transport is a non-streaming tRPC mutation — replies are capped at ~350
 * tokens, so the UX problem is a 2–5s wait, solved with an optimistic user
 * bubble + typing placeholder rather than streaming (which would be the
 * codebase's first and only streaming surface).
 *
 * Every failure path lands on the same floor: the WhatsApp handoff row is
 * always visible, so a rate limit, a model outage, or the kill switch all
 * degrade to "talk to a human" instead of a dead end.
 */

const MAX_TURNS_SENT = 8;
const CLIENT_TIMEOUT_MS = 15_000;

export function ChatPanel() {
  const t = useTranslations("chat");
  const locale = useLocale();
  const isAnon = useIsAnonymous();
  const store = useChatStore();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const ask = trpc.chat.ask.useMutation();

  // The Turnstile challenge is needed only for the conversation's first
  // message from a visitor without a permanent account (mirrors the
  // server). `isAnon` is null while unknown — treat unknown as needing it,
  // the server is the judge anyway.
  const needsTurnstile = !store.conversationId && isAnon !== false;

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      setBusy(true);
      setDraft("");

      const history = useChatStore
        .getState()
        .messages.filter((m) => m.status === "ok")
        .slice(-(MAX_TURNS_SENT - 1))
        .map((m) => ({ role: m.role, content: m.content }));

      store.append({ role: "user", content, status: "ok" });
      store.append({ role: "assistant", content: "", status: "pending" });
      scrollToEnd();

      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("CHAT_TIMEOUT")), CLIENT_TIMEOUT_MS),
      );
      try {
        const res = await Promise.race([
          ask.mutateAsync({
            messages: [...history, { role: "user", content }],
            conversationId: useChatStore.getState().conversationId,
            turnstileToken,
            locale,
          }),
          timeout,
        ]);
        store.setConversationId(res.conversationId);
        store.settleLast({ role: "assistant", content: res.reply, status: "ok" });
      } catch (err) {
        // Tokens are single-use; re-arm the challenge for the retry.
        setTurnstileToken(null);
        setTurnstileResetKey((k) => k + 1);
        const message = err instanceof Error ? err.message : "";
        if (message === "CHAT_DISABLED") {
          setUnavailable(true);
          store.removeLast();
        } else {
          const key =
            message === "CHAT_GLOBAL_CAP" || /TOO_MANY|rate/i.test(message)
              ? "rateLimited"
              : "errorFallback";
          store.settleLast({ role: "assistant", content: t(key), status: "error" });
        }
      } finally {
        setBusy(false);
        scrollToEnd();
        composerRef.current?.focus();
      }
    },
    [ask, busy, locale, scrollToEnd, store, t, turnstileToken],
  );

  // A homepage chip queued a question — send it once the panel is up.
  // Guarded by a ref so StrictMode's double effect can't double-send.
  const seedFired = useRef(false);
  useEffect(() => {
    if (seedFired.current) return;
    const seed = store.consumeSeed();
    if (seed) {
      seedFired.current = true;
      // With Turnstile pending the token may not exist yet; the seed still
      // goes through because dev/preview verify passes without a secret,
      // and production Turnstile usually resolves before a human reads
      // the greeting. A failure lands on the standard error bubble.
      void send(seed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  useEffect(() => {
    scrollToEnd();
  }, [scrollToEnd]);

  const suggested = [1, 2, 3, 4].map((i) => t(`suggested${i}`));

  return (
    <div
      role="dialog"
      aria-label={t("title")}
      className={cn(
        // Mobile: full-screen sheet. Desktop: card anchored above the launcher.
        "fixed inset-0 z-40 flex h-dvh flex-col bg-background",
        "sm:inset-auto sm:bottom-20 sm:end-4 sm:h-auto sm:max-h-[min(560px,80dvh)] sm:w-[380px] sm:rounded-3xl sm:border sm:border-brand-line sm:shadow-glow-lg",
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-brand-line px-4 py-3">
        <div>
          <p className="font-display text-base font-medium">{t("title")}</p>
          <p className="text-xs text-muted-foreground">{t("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={store.close}
          aria-label={t("close")}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted sm:hidden"
        >
          ✕
        </button>
      </header>

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {unavailable ? (
          <p className="rounded-2xl bg-muted px-3.5 py-2.5 text-sm text-muted-foreground">
            {t("unavailable")}
          </p>
        ) : store.messages.length === 0 ? (
          <>
            <p className="rounded-2xl bg-rose-50/80 px-3.5 py-2.5 text-sm">
              {t("greeting")}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {suggested.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => void send(q)}
                  className="rounded-full border border-brand-line px-3 py-1.5 text-xs text-brand-strong transition-colors hover:bg-brand-tint"
                >
                  {q}
                </button>
              ))}
            </div>
          </>
        ) : (
          store.messages.map((m, i) => <Bubble key={i} bubble={m} onRetry={send} />)
        )}
      </div>

      {/* The human escape hatch — always visible, every failure lands here. */}
      <div className="flex items-center gap-3 border-t border-brand-line px-4 py-2.5">
        <a
          href={whatsappLink(t("whatsappPrefill"))}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() =>
            track(ANALYTICS_EVENTS.CHAT_HANDOFF_CLICKED, {
              target: "whatsapp",
              surface: "chat_widget",
            })
          }
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-strong hover:underline"
        >
          <MessageCircle className="size-3.5" aria-hidden />
          {t("whatsappCta")}
        </a>
        <Link
          href="/enquire"
          onClick={() => {
            track(ANALYTICS_EVENTS.CHAT_HANDOFF_CLICKED, {
              target: "enquire",
              surface: "chat_widget",
            });
            store.close();
          }}
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-strong hover:underline"
        >
          {t("enquireCta")}
          <ArrowRight className="size-3 rtl:-scale-x-100" aria-hidden />
        </Link>
      </div>

      {!unavailable && (
        <form
          className="border-t border-brand-line px-3 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          {needsTurnstile && (
            <div className="pb-2">
              <Turnstile
                onToken={setTurnstileToken}
                resetKey={turnstileResetKey}
                size="flexible"
              />
            </div>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={composerRef}
              dir="auto"
              rows={1}
              maxLength={2000}
              value={draft}
              disabled={busy}
              placeholder={t("placeholder")}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              className="max-h-28 min-h-10 flex-1 resize-none rounded-2xl border border-brand-line bg-background px-3.5 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              aria-label={t("send")}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-gradient text-white disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <SendHorizonal className="size-4 rtl:-scale-x-100" aria-hidden />
              )}
            </button>
          </div>
          <p className="pt-2 text-center text-xs leading-snug text-muted-foreground">
            {t("disclaimer")}
          </p>
        </form>
      )}
    </div>
  );
}

function Bubble({
  bubble,
  onRetry,
}: {
  bubble: ChatBubble;
  onRetry: (text: string) => void;
}) {
  const t = useTranslations("chat");
  const store = useChatStore();

  if (bubble.role === "user") {
    return (
      <p
        dir="auto"
        className="ms-8 rounded-2xl rounded-ee-md bg-brand-gradient px-3.5 py-2.5 text-sm text-white"
      >
        {bubble.content}
      </p>
    );
  }

  if (bubble.status === "pending") {
    return (
      <p
        aria-label={t("typing")}
        className="me-8 w-fit rounded-2xl rounded-ss-md bg-muted px-3.5 py-2.5 text-sm text-muted-foreground"
      >
        <span className="motion-safe:animate-pulse">…</span>
      </p>
    );
  }

  if (bubble.status === "error") {
    // The failed user message is the one right before this bubble.
    const messages = store.messages;
    const idx = messages.indexOf(bubble);
    const lastUser = [...messages.slice(0, idx)].reverse().find((m) => m.role === "user");
    return (
      <div className="me-8 space-y-1.5">
        <p dir="auto" className="rounded-2xl rounded-ss-md bg-rose-50 px-3.5 py-2.5 text-sm text-rose-800">
          {bubble.content}
        </p>
        {lastUser && (
          <button
            type="button"
            onClick={() => {
              // Drop the error bubble AND the failed user message —
              // `send` re-appends both, so keeping either would duplicate.
              store.removeLast();
              store.removeLast();
              onRetry(lastUser.content);
            }}
            className="text-xs font-medium text-brand-strong hover:underline"
          >
            {t("retry")}
          </button>
        )}
      </div>
    );
  }

  return (
    <p
      dir="auto"
      className="me-8 whitespace-pre-wrap rounded-2xl rounded-ss-md bg-muted px-3.5 py-2.5 text-sm"
    >
      {bubble.content}
    </p>
  );
}
