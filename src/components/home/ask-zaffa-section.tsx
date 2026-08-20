"use client";

import { useTranslations } from "next-intl";
import { MessageCircleQuestion, Sparkles } from "lucide-react";
import { Rise } from "@/components/motion/rise";
import { useChatStore } from "@/stores/chat-store";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

/**
 * The homepage's visible invitation to the chat — a floating bubble alone
 * is furniture; this band is the introduction. Pure entry affordance: the
 * chips open the global widget (mounted by the root layout) with the
 * question pre-sent, so there is no second chat instance and this section
 * costs the ISR page nothing.
 *
 * Rendered from page.tsx only when the `aiChat` flag is on, so flag-off
 * removes the section and the launcher together.
 */
export function AskZaffaSection() {
  const t = useTranslations("chat");
  const tm = useTranslations("marketing");
  const suggested = [1, 2, 3, 4].map((i) => t(`suggested${i}`));

  const openWith = (question?: string) => {
    useChatStore.getState().open(question);
    track(ANALYTICS_EVENTS.CHAT_OPENED, {
      source: "home_section",
      ...(question ? { question } : {}),
    });
  };

  return (
    <section
      aria-labelledby="ask-zaffa-title"
      className="relative isolate overflow-clip border-y border-brand-line bg-gradient-to-b from-rose-50/40 via-background to-background"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-25"
      />
      <div className="container mx-auto max-w-4xl px-4 py-16 text-center md:py-20">
        <Rise>
          <p className="inline-flex items-center gap-2 rounded-full border border-rose-200/60 bg-white/60 px-3 py-1 text-eyebrow text-rose-700">
            <Sparkles className="h-3 w-3" />
            {tm("askZaffaEyebrow")}
          </p>
          <h2
            id="ask-zaffa-title"
            className="mt-5 font-display text-balance text-[clamp(1.75rem,3.5vw,2.5rem)] font-light leading-[1.1] tracking-tight"
          >
            {tm("askZaffaTitle")}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-pretty text-base text-muted-foreground">
            {tm("askZaffaSubtitle")}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            {suggested.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => openWith(q)}
                className="rounded-full border border-brand-line bg-white/70 px-4 py-2 text-sm text-brand-strong shadow-sm transition-colors hover:bg-brand-tint"
              >
                {q}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => openWith()}
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-brand-strong hover:underline"
          >
            <MessageCircleQuestion className="size-4" aria-hidden />
            {tm("askZaffaOpen")}
          </button>
        </Rise>
      </div>
    </section>
  );
}
