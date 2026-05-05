"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface QuickSendWhatsappProps {
  prospectId: string;
  whatsapp: string | null | undefined;
  // Cached draft text (the prospect's `draft_whatsapp`). If absent we'll
  // generate one server-side before opening WhatsApp Web.
  draft: string | null | undefined;
  // Optional cosmetic variants for the two contexts we render in: the
  // detail page wants a primary CTA, the list row wants a tight icon-only
  // affordance that doesn't dominate the layout.
  variant?: "primary" | "compact";
  className?: string;
  // Whether to refresh prospect funnel/list queries after marking
  // contacted. Defaults to true (it's almost always what we want).
  invalidateOnSuccess?: boolean;
  // Hook so callers can react when the WhatsApp tab has been opened with
  // a prefilled draft (e.g. to reset a local activeChannel selection).
  onSent?: () => void;
}

// One-click pipeline:
//   1. (re)hydrate the WhatsApp draft if missing
//   2. open https://web.whatsapp.com/send?phone=…&text=… in a new tab
//      (NOT wa.me, NOT api.whatsapp.com — see note below)
//   3. also stage the body on the clipboard as a fallback (one Cmd+V away
//      if anything still looks off in the compose box)
//   4. flip status -> contacted (contacted_via=whatsapp)
//
// Why web.whatsapp.com/send and not wa.me / api.whatsapp.com:
//   - wa.me is a redirect shortener whose server rewrites the URL to
//     api.whatsapp.com. During that rewrite it can only handle
//     characters in the BMP — any 4-byte UTF-8 sequence (most emojis:
//     🌸 U+1F338, 🎁 U+1F381, ✅ via dingbats etc.) gets replaced with
//     U+FFFD ("�") and percent-encoded as `%EF%BF%BD` in the redirect
//     target. Verified by inspecting the actual redirect URL on this app.
//   - api.whatsapp.com/send/ preserves the body but shows a chooser
//     page first ("Open in WhatsApp app or continue in browser?"),
//     which adds a click for desktop users who just want WhatsApp Web.
//   - web.whatsapp.com/send IS WhatsApp Web. It accepts the same
//     phone+text query params, no redirect chain, no chooser, and
//     handles encodeURIComponent'd UTF-8 (including 4-byte emojis)
//     correctly. Only caveat: if you ever want this to deep-link into
//     the mobile WhatsApp app, switch back to api.whatsapp.com/send/
//     — but on the founder's desktop prospecting flow this is the
//     fastest path.
//
// The `window.open` happens *synchronously* on click with an `about:blank`
// placeholder. Once the draft mutation resolves we set `win.location.href`
// to the real WhatsApp URL. This dodges the popup blocker that would
// otherwise fire when we open a window after an awaited async call (the
// browser counts only the original click as a user gesture).
export function QuickSendWhatsapp({
  prospectId,
  whatsapp,
  draft,
  variant = "primary",
  className,
  invalidateOnSuccess = true,
  onSent,
}: QuickSendWhatsappProps) {
  const t = useTranslations("admin");
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);

  const draftM = trpc.outreach.draft.useMutation();
  const markContactedM = trpc.outreach.markContacted.useMutation({
    onSuccess: () => {
      if (!invalidateOnSuccess) return;
      utils.prospects.byId.invalidate({ id: prospectId });
      utils.prospects.list.invalidate();
      utils.prospects.funnel.invalidate();
    },
  });

  const digits = (whatsapp ?? "").replace(/[^0-9]/g, "");
  const disabled = !digits || busy;

  async function handleClick(e: React.MouseEvent) {
    // We're often nested inside a Link in the list view — don't navigate.
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;

    // CRITICAL: open the window NOW, while we still have the user gesture.
    // We'll redirect it to the real URL once the draft is ready.
    const win = window.open("about:blank", "_blank");

    setBusy(true);
    try {
      let body = (draft ?? "").trim();
      if (!body) {
        const generated = await draftM.mutateAsync({
          prospectId,
          channel: "whatsapp",
        });
        body = generated.body;
      }

      // Belt-and-braces: stage the raw body on the clipboard so the user
      // can paste a clean copy if anything in the URL-prefilled compose
      // box still looks off. Failures are silent — clipboard isn't
      // available in private windows or insecure contexts, but the URL
      // path below works regardless.
      try {
        await navigator.clipboard.writeText(body);
      } catch {
        /* swallow — clipboard is best-effort */
      }

      const url = `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(body)}&type=phone_number&app_absent=0`;
      if (win && !win.closed) {
        win.location.href = url;
      } else {
        // Popup blocked — fall back to top-level navigation so the user
        // still ends up at WhatsApp Web with the draft prefilled.
        window.location.href = url;
      }

      // Best effort — don't block the UX on this. The badge will catch up
      // on next list refresh.
      markContactedM.mutate({ prospectId, channel: "whatsapp" });
      onSent?.();
    } catch (err) {
      if (win && !win.closed) win.close();
      toast.error(err instanceof Error ? err.message : t("draftFailedGeneric"));
    } finally {
      setBusy(false);
    }
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled}
        // The list-page keyboard shortcut handler ("W" key) finds buttons
        // by this attribute; keep the name stable.
        data-quicksend-wa
        title={`${t("quickSendWhatsapp")} (W)`}
        aria-label={t("quickSendWhatsapp")}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-full",
          "bg-emerald-500 text-white shadow-sm transition-all",
          "hover:bg-emerald-600 hover:shadow-md",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-500",
          className,
        )}
      >
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Send className="size-3.5" />
        )}
      </button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "gap-1.5 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Send className="size-3.5" />
      )}
      {t("quickSendWhatsapp")}
    </Button>
  );
}
