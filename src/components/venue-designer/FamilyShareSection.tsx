"use client";

import { useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Check,
  Copy,
  ExternalLink,
  Heart,
  Link2,
  Loader2,
  MessageCircle,
  Share2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { isFlagEnabled } from "@/lib/flags";
import { formatCount } from "@/lib/money-format";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { MediaImage } from "@/components/ui/media-image";
import { useConfirm } from "@/components/ui/confirm";

/** How often the couple's view of the votes refreshes while it is on screen. */
const VOTES_REFRESH_MS = 30_000;

/**
 * True while the element is in the viewport and the tab is in front, so the
 * vote poll only runs while someone could be looking at it. Takes the node
 * itself (from a callback ref) because the section mounts after its data.
 */
function useOnScreen(el: HTMLElement | null): boolean {
  const [inView, setInView] = useState(false);
  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  useEffect(() => {
    const onChange = () => setTabVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return inView && tabVisible;
}

function errorCode(err: unknown): string | undefined {
  return err instanceof TRPCClientError ? (err.data?.code as string | undefined) : undefined;
}

/**
 * F6, "Ask your family", in the share panel under the render (free tier
 * too, which is the point: until now a free couple had nothing to send).
 *
 * One link per design. WhatsApp first, because that is where these
 * decisions happen, then the phone's own share sheet where there is one,
 * then plain copy. Below it, who in the family picked which version, kept
 * fresh every 30 seconds while it is on screen.
 *
 * Hidden when the feature is off, on any error, and for an anonymous couple
 * who has not given an email yet (their render is still behind the gate).
 */
export function FamilyShareSection({
  designId,
  standalone = false,
}: {
  designId: string;
  /** Its own card, for when there is no share panel around it (no pack). */
  standalone?: boolean;
}) {
  const t = useTranslations("familyShare");
  const locale = useLocale();
  const enabled = isFlagEnabled("familyShare");
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const onScreen = useOnScreen(root);
  const resultsTitleId = useId();

  const owner = trpc.designShares.forOwner.useQuery(
    { designId },
    {
      enabled,
      retry: false,
      // While hidden behind the email gate there is no section on screen to
      // watch, so keep asking: the email lands without a page load, and the
      // section should then appear by itself. (Paused in a background tab.)
      refetchInterval: (query) =>
        onScreen || query.state.data?.needsEmail ? VOTES_REFRESH_MS : false,
    },
  );
  // Same query the step above runs, so this is a cache read: the tier URLs
  // of the renders, for the thumbnails beside the votes.
  const { data: design } = trpc.venueDesigns.getById.useQuery({ id: designId });
  const thumbs = useMemo(
    () => new Map((design?.media ?? []).map((m) => [m.id, m.url])),
    [design?.media],
  );

  const create = trpc.designShares.create.useMutation({
    onSuccess: () => utils.designShares.forOwner.invalidate({ designId }),
    onError: (err) =>
      toast.error(
        errorCode(err) === "TOO_MANY_REQUESTS" ? t("errorRateLimited") : t("errorGeneric"),
      ),
  });
  const revoke = trpc.designShares.revoke.useMutation({
    onSuccess: () => {
      toast.success(t("stopped"));
      void utils.designShares.forOwner.invalidate({ designId });
    },
    onError: () => toast.error(t("errorGeneric")),
  });

  const [copied, setCopied] = useState(false);
  const [canNativeShare, setCanNativeShare] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- feature detection after hydration
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  if (!enabled || owner.isError || !owner.data || owner.data.needsEmail) return null;

  const { share, votes, voterCount } = owner.data;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const url = share ? `${origin}${share.path}` : null;
  const message = url ? t("whatsappMessage", { url }) : "";
  const count = (n: number) => formatCount(n, locale);

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error(t("copyFailed"));
    }
  };

  const nativeShare = async () => {
    if (!url) return;
    try {
      await navigator.share({ title: t("shareTitle"), text: message.replace(url, "").trim(), url });
    } catch {
      // Dismissing the share sheet rejects too; nothing to say about it.
    }
  };

  const stopSharing = async () => {
    const ok = await confirm({
      title: t("stopConfirmTitle"),
      description: t("stopConfirmBody"),
      confirmLabel: t("stopCta"),
      destructive: true,
    });
    if (ok) revoke.mutate({ designId });
  };

  return (
    <div
      ref={setRoot}
      data-testid="family-share"
      className={cn(
        "flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-7 sm:py-5",
        standalone &&
          "rounded-2xl bg-gradient-to-br from-rose-50/40 via-background to-background ring-1 ring-rose-200",
      )}
    >
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600">
        <Users aria-hidden className="size-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{t("blockTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("blockBody")}</p>

        <div className="space-y-4 pt-2">
          {!share || !url ? (
            <Button
              type="button"
              variant="outline"
              disabled={create.isPending}
              onClick={() => create.mutate({ designId })}
              className="h-11 gap-2 border-rose-200 px-4 text-rose-700 hover:bg-rose-50"
            >
              {create.isPending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" />
              ) : (
                <Link2 aria-hidden className="size-4" />
              )}
              {t("createCta")}
            </Button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-1 rounded-lg border bg-muted/40 ps-3">
                <span className="sr-only">{t("linkLabel")}</span>
                <code
                  dir="ltr"
                  data-testid="family-share-url"
                  className="min-w-0 flex-1 truncate py-2 font-mono text-xs text-muted-foreground"
                >
                  {url}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={copyLink}
                  aria-label={copied ? t("copied") : t("copyCta")}
                  className="size-11 shrink-0"
                >
                  {copied ? (
                    <Check aria-hidden className="size-4 text-green-600" />
                  ) : (
                    <Copy aria-hidden className="size-4" />
                  )}
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {/* Real links, not Buttons rendering them: base-ui gives a
                    rendered non-button the button role, and these navigate. */}
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="family-share-whatsapp"
                  className={cn(buttonVariants({ variant: "cta" }), "h-11 gap-2 px-4")}
                >
                  <MessageCircle aria-hidden className="size-4" />
                  {t("whatsappCta")}
                </a>
                {canNativeShare ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={nativeShare}
                    className="h-11 gap-2 px-4"
                  >
                    <Share2 aria-hidden className="size-4" />
                    {t("shareCta")}
                  </Button>
                ) : null}
                <Link
                  href={share.path}
                  target="_blank"
                  rel="noopener"
                  className={cn(buttonVariants({ variant: "ghost" }), "h-11 gap-2 px-3")}
                >
                  <ExternalLink aria-hidden className="size-4" />
                  {t("previewCta")}
                </Link>
              </div>

              <section aria-labelledby={resultsTitleId} className="space-y-2 pt-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <h3 id={resultsTitleId} className="text-sm font-medium">
                    {t("resultsTitle")}
                  </h3>
                  {voterCount > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t("voterCount", { count: voterCount, countLabel: count(voterCount) })}
                    </p>
                  ) : null}
                </div>
                {votes.length === 0 ? (
                  <p className="text-xs text-muted-foreground" data-testid="family-results-empty">
                    {t("resultsEmpty")}
                  </p>
                ) : (
                  <ul className="space-y-2" data-testid="family-results">
                    {votes.map((entry, i) => {
                      const thumb = thumbs.get(entry.mediaId);
                      return (
                        <li
                          key={entry.mediaId}
                          data-testid="family-result"
                          className="flex gap-3 rounded-xl bg-background/70 p-2.5 ring-1 ring-foreground/[0.06]"
                        >
                          <div className="relative aspect-video w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
                            {thumb ? (
                              <MediaImage src={thumb} alt="" fill sizes="thumb" />
                            ) : null}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="flex flex-wrap items-center gap-x-2 text-sm">
                              <span className="font-medium">
                                {t("version", { number: count(entry.number) })}
                              </span>
                              <span className="inline-flex items-center gap-1 text-rose-700">
                                <Heart aria-hidden className="size-3.5 fill-current" />
                                {t("votes", { count: entry.count, countLabel: count(entry.count) })}
                              </span>
                              {i === 0 && votes.length > 1 && entry.count > votes[1].count ? (
                                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-200">
                                  {t("topPick")}
                                </span>
                              ) : null}
                            </p>
                            <ul className="space-y-0.5 text-xs text-muted-foreground">
                              {entry.voters.map((voter, j) => (
                                <li key={j}>
                                  {/* Isolated, so a Latin name in an Arabic
                                      list keeps the list's alignment. */}
                                  <bdi className="font-medium text-foreground">{voter.name}</bdi>
                                  {voter.comment ? (
                                    <q className="ms-1.5">
                                      <bdi>{voter.comment}</bdi>
                                    </q>
                                  ) : null}
                                </li>
                              ))}
                            </ul>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <Button
                type="button"
                variant="ghost"
                disabled={revoke.isPending}
                onClick={stopSharing}
                className="h-11 px-2 text-xs text-muted-foreground hover:text-destructive"
              >
                {t("stopCta")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
