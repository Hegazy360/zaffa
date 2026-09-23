"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { isLocale } from "@/i18n/config";
import { usePackPaywall } from "@/components/vision-pack/VisionPackPaywallProvider";

/** Same ceiling as `ai.refineRender`. */
const INSTRUCTION_MAX = 500;

// The four suggestions under the box. Each fills the box rather than
// sending, so the couple can add to it ("more flowers, white ones") first.
const CHIP_KEYS = [
  "refine.chipMoreFlowers",
  "refine.chipWarmerLight",
  "refine.chipDanceFloor",
  "refine.chipGrandStage",
] as const;

export interface RefineResult {
  mediaId: string;
  parentId: string;
  imageUrl: string;
  confirmation: string | null;
  editsLeft: number;
}

interface RefineBoxProps {
  /** The version on screen; the change applies to it. */
  mediaId: string;
  onRefined: (result: RefineResult, instruction: string) => void;
  /** An anonymous couple who has not given their email yet. */
  onEmailRequired: () => void;
  /** A change may have landed although its answer did not. */
  onOutcomeUnknown: () => void;
  onPendingChange?: (pending: boolean) => void;
  /** The confirmation for the version on screen, if it is a change. */
  confirmation: string | null;
  /** Shown on the free tier, where changes are counted out loud. */
  editsLeft: number | null;
  /** More than one version exists, so say which one a change applies to. */
  showAppliesTo?: boolean;
}

/**
 * "What would you change?" under a render (F2). The couple types a change
 * in their own words and language (`dir="auto"`, so Arabic lines up right
 * while an English aside still reads left to right), or starts from a
 * suggestion, and gets a new version with only that changed.
 *
 * Errors are the couple's, never the server's: every outcome maps to a
 * localized line, and paywall reasons open the paywall.
 */
export function RefineBox({
  mediaId,
  onRefined,
  onEmailRequired,
  onOutcomeUnknown,
  onPendingChange,
  confirmation,
  editsLeft,
  showAppliesTo,
}: RefineBoxProps) {
  const t = useTranslations("designer");
  const locale = useLocale();
  const paywall = usePackPaywall();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const refine = trpc.ai.refineRender.useMutation({
    onSuccess: (data, variables) => {
      setText("");
      setError(null);
      onRefined(data, variables.instruction);
    },
    onError: (err) => {
      const code = err.data?.code;
      if (paywall.handleError(err)) return;
      if (err.message === "EMAIL_REQUIRED") {
        onEmailRequired();
        return;
      }
      if (err.message === "REFINE_REJECTED") {
        setError(t("refine.rejected"));
        return;
      }
      if (code === "TOO_MANY_REQUESTS") {
        setError(t("renderRateLimited"));
        return;
      }
      if (!code) {
        // No answer at all: a phone that switched apps mid-wait. The server
        // may have finished and saved the change, so the panel looks.
        onOutcomeUnknown();
        setError(t("refine.interrupted"));
        return;
      }
      setError(t("refine.failed"));
    },
  });
  const pending = refine.isPending;

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    const instruction = text.trim();
    if (!instruction || pending) return;
    setError(null);
    refine.mutate({
      mediaId,
      instruction,
      ...(isLocale(locale) ? { locale } : {}),
    });
  };

  // Enter sends, as in a chat; Shift+Enter is a new line, and Enter that
  // confirms an input-method composition (Arabic, CJK keyboards) is left
  // alone.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };

  const applyChip = (value: string) => {
    setText(value);
    setError(null);
    inputRef.current?.focus();
  };

  return (
    <section
      data-refine-box=""
      className="space-y-3 rounded-xl border border-rose-200/70 bg-background/80 p-3 sm:p-4"
    >
      {confirmation ? (
        <p
          data-refine-confirmation=""
          role="status"
          dir="auto"
          className="flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
        >
          <Check className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{confirmation}</span>
        </p>
      ) : null}

      <form onSubmit={send} className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <label
            htmlFor="refine-instruction"
            className="font-display text-lg font-medium tracking-tight"
          >
            {t("refine.title")}
          </label>
          {editsLeft !== null ? (
            <span
              data-refine-edits-left=""
              className="text-xs font-medium text-rose-700"
            >
              {t("refine.editsLeft", { count: editsLeft })}
            </span>
          ) : null}
        </div>
        <p id="refine-hint" className="text-xs text-muted-foreground">
          {t("refine.hint")}
          {showAppliesTo ? ` ${t("refine.appliesTo")}` : null}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <textarea
            id="refine-instruction"
            ref={inputRef}
            data-refine-input=""
            dir="auto"
            rows={2}
            maxLength={INSTRUCTION_MAX}
            enterKeyHint="send"
            value={text}
            disabled={pending}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={t("refine.placeholder")}
            aria-describedby="refine-hint"
            className="min-h-11 w-full flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2.5 text-base shadow-sm placeholder:text-muted-foreground focus-visible:border-rose-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
          />
          <Button
            type="submit"
            variant="cta"
            data-refine-send=""
            disabled={pending || text.trim().length === 0}
            className="h-11 w-full gap-2 px-5 sm:w-auto"
          >
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                {t("refine.sending")}
              </>
            ) : (
              <>
                <Wand2 className="size-4" />
                {t("refine.send")}
              </>
            )}
          </Button>
        </div>
      </form>

      <div
        role="group"
        aria-label={t("refine.ideas")}
        className="flex flex-wrap gap-2"
      >
        {CHIP_KEYS.map((key) => {
          const value = t(key);
          return (
            <button
              key={key}
              type="button"
              data-refine-chip=""
              disabled={pending}
              onClick={() => applyChip(value)}
              className="inline-flex min-h-11 items-center rounded-full border border-rose-200 bg-rose-50/70 px-3.5 text-sm text-rose-800 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50 sm:min-h-9"
            >
              {value}
            </button>
          );
        })}
      </div>

      {pending ? (
        <p
          role="status"
          data-refine-pending=""
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Loader2 className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
          {t("refine.pending")}
        </p>
      ) : null}

      {error ? (
        <p role="alert" data-refine-error="" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
