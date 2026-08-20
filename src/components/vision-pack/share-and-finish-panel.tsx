"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileDown,
  Globe,
  Heart,
  Loader2,
  Lock,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isFreePack } from "@/lib/vision-pack";
import { LockableAction } from "@/components/ui/lockable-action";
import { LookbookDownloadButton } from "./lookbook-download-button";

interface Props {
  /** Owner of this design — used to wire the find-planner CTA to a saved design. */
  designId?: string;
}

/**
 * Per-design "share & finish" surface that lives at the end of the
 * designer flow. Replaces the old microsite/find-planner cards in
 * /dashboard/client/settings — couples shouldn't have to leave the
 * design they're working on to publish it, download it, or take it to
 * a planner.
 *
 * Three sections share one card:
 *   1. Microsite — publish + share URL (with public/private toggle).
 *   2. Lookbook PDF — download (stamps the refund tripwire on first hit).
 *   3. Find a planner — hands off to the existing marketplace flow.
 *
 * The component fetches the recipient's pack itself; it returns null
 * when there's no pack so the designer step renders nothing extra for
 * users who haven't purchased yet (the paywall handles that case).
 *
 * The parent `GenerateStep` only mounts this panel after the first
 * render lands, so we can assume there's always renderable media here —
 * no empty-state branch to worry about.
 */
export function ShareAndFinishPanel({ designId }: Props) {
  const t = useTranslations("visionPack");
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: pack, isLoading } = trpc.visionPacks.current.useQuery();
  const [copied, setCopied] = useState(false);

  const setPublic = trpc.visionPacks.setMicrositePublic.useMutation({
    onSuccess: (_data, variables) => {
      utils.visionPacks.current.invalidate();
      toast.success(
        variables.isPublic
          ? t("micrositePublishToast")
          : t("micrositeUnpublishToast"),
      );
    },
    onError: (err) => toast.error(err.message),
  });

  // "This is the one" — approval files the lead the concierge follows up
  // on. Replaces the old findPlanner marketplace handoff, which was gated
  // by SKU and pointed at surfaces that now 404.
  const { data: design } = trpc.venueDesigns.getById.useQuery(
    { id: designId ?? "" },
    { enabled: Boolean(designId) },
  );
  const approve = trpc.venueDesigns.approve.useMutation({
    onSuccess: () => {
      toast.success(t("approvedToast"));
      utils.venueDesigns.list.invalidate();
      if (designId) utils.venueDesigns.getById.invalidate({ id: designId });
      utils.enquiries.mine.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !pack) return null;

  const isPublished = Boolean(pack.microsite_published_at);
  const slug = pack.microsite_slug;
  // Free-tier packs grant the email-gated render only — the lookbook
  // PDF and microsite stay paid-pack features. Microsite is already
  // implicitly gated because `ensureFreePack` doesn't allocate a slug;
  // the lookbook needs an explicit flag.
  const onFreeTier = isFreePack(pack.sku);
  // Resolve origin client-side only — typical SSR safety dance.
  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://zaffa.ai";
  const url = slug ? `${origin}/v/${slug}` : null;

  const copyLink = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy");
    }
  };

  return (
    <Card className="border-rose-200 bg-gradient-to-br from-rose-50/40 via-background to-background">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Heart className="size-4 text-rose-500" />
          {t("shareTitle")}
        </CardTitle>
        <CardDescription>{t("shareSubtitle")}</CardDescription>
      </CardHeader>

      <CardContent className="divide-y divide-rose-100/70 px-0">
        {/* Microsite */}
        <Section
          icon={<Globe className="size-4" />}
          title={t("shareSectionMicrositeTitle")}
          description={t("shareSectionMicrositeBody")}
        >
          {isPublished && url ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-2.5 py-1.5">
                <code className="flex-1 truncate font-mono text-xs text-muted-foreground">
                  {url}
                </code>
                <button
                  type="button"
                  onClick={copyLink}
                  className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
                  aria-label="Copy link"
                >
                  {copied ? (
                    <Check className="size-3.5 text-green-600" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
                <Link
                  href={`/v/${slug}`}
                  target="_blank"
                  rel="noopener"
                  className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:text-foreground"
                  aria-label="Open microsite"
                >
                  <ExternalLink className="size-3.5" />
                </Link>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {t("micrositePrivacyToggle")}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={pack.microsite_public ? "default" : "outline"}
                  disabled={setPublic.isPending}
                  onClick={() =>
                    setPublic.mutate({
                      packId: pack.id,
                      isPublic: !pack.microsite_public,
                    })
                  }
                  className="h-7 gap-1.5 text-xs"
                >
                  {setPublic.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : pack.microsite_public ? (
                    <Globe className="size-3" />
                  ) : (
                    <Lock className="size-3" />
                  )}
                  {pack.microsite_public ? "Public" : "Private"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {onFreeTier
                  ? t("micrositeFreeTierHint")
                  : t("micrositeUnpublishedHint")}
              </p>
              <LockableAction
                locked={onFreeTier}
                hint={t("micrositeFreeTierHint")}
                align="start"
              >
                <Button
                  type="button"
                  size="sm"
                  disabled={setPublic.isPending || !slug}
                  onClick={() =>
                    setPublic.mutate({ packId: pack.id, isPublic: true })
                  }
                  aria-label={
                    onFreeTier ? t("micrositeFreeTierHint") : undefined
                  }
                  className="h-8 gap-1.5 bg-brand-gradient text-xs text-white hover:opacity-90"
                >
                  {setPublic.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Globe className="size-3" />
                  )}
                  {t("micrositePublishCta")}
                </Button>
              </LockableAction>
            </div>
          )}
        </Section>

        {/* Lookbook — paid-pack feature. Free-tier packs see a disabled
            button + upgrade hint, mirroring how the microsite section
            handles the missing slug. */}
        <Section
          icon={<FileDown className="size-4" />}
          title={t("shareSectionLookbookTitle")}
          description={t("shareSectionLookbookBody")}
        >
          {onFreeTier ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                {t("lookbookFreeTierHint")}
              </p>
              <LockableAction
                locked
                hint={t("lookbookFreeTierHint")}
                align="start"
              >
                <LookbookDownloadButton
                  packId={pack.id}
                  size="sm"
                  variant="outline"
                  hideHint
                  disabled
                />
              </LockableAction>
            </div>
          ) : (
            <LookbookDownloadButton
              packId={pack.id}
              size="sm"
              variant="outline"
              hideHint
            />
          )}
        </Section>

        {/* "This is the one" — every tier can approve; it files the lead
            the concierge follows up on. Replaces the old SKU-gated
            find-a-planner marketplace handoff. */}
        <Section
          icon={<Users className="size-4" />}
          title={t("shareSectionApproveTitle")}
          description={t("shareSectionApproveBody")}
        >
          {pack.event_id ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() =>
                router.push(`/dashboard/client/event/${pack.event_id}`)
              }
            >
              <Users className="size-3.5" />
              {t("alreadyEvent")}
              <ArrowRight className="size-3 rtl:-scale-x-100" />
            </Button>
          ) : design?.approved_at ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200/70 bg-rose-50/60 px-3 py-1.5 text-xs font-medium text-rose-700">
              <CheckCircle2 className="size-3.5" />
              {t("approvedState")}
            </div>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={approve.isPending || !designId}
              onClick={() => designId && approve.mutate({ designId })}
              className="h-8 gap-1.5 bg-brand-gradient text-xs text-white hover:opacity-90"
            >
              {approve.isPending ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3" />
              )}
              {t("approveCta")}
              <ArrowRight className="size-3 rtl:-scale-x-100" />
            </Button>
          )}
        </Section>
      </CardContent>
    </Card>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}

function Section({ icon, title, description, children }: SectionProps) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-7 sm:py-5">
      <div className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-600">
        {icon}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        <div className="pt-2">{children}</div>
      </div>
    </div>
  );
}
