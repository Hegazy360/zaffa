"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  Plus,
  Loader2,
  Trash2,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Image as ImageIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { useFormatters } from "@/lib/use-formatters";
import {
  VisionPackBuyCta,
  VisionPackQuotaBadge,
} from "@/components/vision-pack/VisionPackQuotaBadge";
import { usePackPaywall } from "@/components/vision-pack/VisionPackPaywallProvider";
import { useVisionPackPricing } from "@/components/vision-pack/use-pricing";
import { useIsAnonymous } from "@/lib/use-is-anonymous";
import { isFreePack } from "@/lib/vision-pack";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm";
import { MediaImage } from "@/components/ui/media-image";

interface NormalizedPalette {
  colors: string[];
}

function normalizePalette(value: unknown): NormalizedPalette {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const colors = Array.isArray(obj.colors)
      ? (obj.colors.filter((c): c is string => typeof c === "string"))
      : [];
    return { colors };
  }
  return { colors: [] };
}

export default function VenueDesignerGalleryPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const t = useTranslations("designer");
  const tCommon = useTranslations("common");
  const confirm = useConfirm();
  const tv = useTranslations("visionPack");
  const f = useFormatters();
  const { data: designs, isLoading } = trpc.venueDesigns.list.useQuery();
  const { data: pack } = trpc.visionPacks.current.useQuery();
  const paywall = usePackPaywall();
  const pricing = useVisionPackPricing();
  const utils = trpc.useUtils();
  // The gallery is a permanent-account feature. Anon visitors are
  // bounced straight into the designer so they can't browse / approve
  // designs they haven't earned the right to act on yet.
  const isAnon = useIsAnonymous() === true;
  useEffect(() => {
    if (isAnon) router.replace("/venue-designer/new");
  }, [isAnon, router]);
  // Only the navbar chrome cares about the tier now, approval doesn't.
  // Free-pack users keep the chrome-less feel of the try-it-free flow.
  const onFreeTier = !pack || isFreePack(pack.sku);

  const deleteMutation = trpc.venueDesigns.delete.useMutation({
    onSuccess: () => utils.venueDesigns.list.invalidate(),
  });

  // Approval is a lead ("I want this wedding - contact me"), free on every
  // tier. The old events.createFromDesign path was Vision-Pack-gated because
  // it opened the hidden planner marketplace.
  const approveMutation = trpc.venueDesigns.approve.useMutation({
    onSuccess: () => {
      toast.success(t("approvedToast"));
      utils.venueDesigns.list.invalidate();
      utils.enquiries.mine.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleDelete = async (
    e: React.MouseEvent,
    id: string,
    name: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (
      await confirm({
        title: t("deleteDesignConfirm", { name }),
        description: tCommon("areYouSure"),
        confirmLabel: tCommon("delete"),
        destructive: true,
      })
    ) {
      deleteMutation.mutate({ id });
    }
  };

  const handleApprove = (e: React.MouseEvent, designId: string) => {
    e.stopPropagation();
    e.preventDefault();
    approveMutation.mutate({ designId });
  };

  const handleOpenEvent = (e: React.MouseEvent, eventId: string) => {
    e.stopPropagation();
    e.preventDefault();
    router.push(`/dashboard/client/event/${eventId}`);
  };

  const eventTypeLabel = (value: string) => {
    switch (value) {
      case "wedding":
        return t("eventTypeWedding");
      case "engagement":
        return t("eventTypeEngagement");
      case "birthday":
        return t("eventTypeBirthday");
      case "corporate":
        return t("eventTypeCorporate");
      case "other":
        return t("eventTypeOther");
      default:
        return value;
    }
  };

  const sizeLabel = (value: string) => {
    switch (value) {
      case "intimate":
        return t("sizeIntimate");
      case "medium":
        return t("sizeMedium");
      case "large":
        return t("sizeLarge");
      default:
        return value;
    }
  };

  const settingLabel = (value: string) => {
    switch (value) {
      case "indoor":
        return t("settingIndoor");
      case "outdoor":
        return t("settingOutdoor");
      case "tent":
        return t("settingTent");
      default:
        return value;
    }
  };

  return (
    <>
    {/* Navbar is part of the paid-pack chrome. Anon users are already
        bounced to /new (effect above); permanent users on the free pack
        keep the chrome-less feel they had during the try-it-free flow. */}
    {!onFreeTier && <Navbar />}
    <div className="relative isolate min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-200/30 to-amber-200/20 blur-3xl"
      />

      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 flex flex-col items-start gap-5 sm:mb-14 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-eyebrow font-medium text-rose-700 backdrop-blur-sm">
              <Sparkles className="size-3" />
              {t("atelierEyebrow")}
            </div>
            <h1 className="font-display text-balance text-4xl leading-tight font-light tracking-tight sm:text-5xl">
              {t("myDesigns")}
            </h1>
            <p className="max-w-lg text-pretty text-sm text-muted-foreground sm:text-base">
              {t("gallerySubtitle")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 sm:items-end">
            {pack ? (
              <VisionPackQuotaBadge />
            ) : null}
            {/* The "New design" CTA is always available now, anonymous
                visitors get a free render via the auto-granted free pack,
                and authenticated users without a pack either get the same
                free entitlement or hit the email gate after the render
                completes. The buy CTA still surfaces below for users who
                already exhausted their free render. */}
            <Button
              size="lg"
              onClick={() => router.push("/venue-designer/new")}
              className="h-11 gap-2 bg-brand-gradient px-5 text-white shadow-glow hover:opacity-90 hover:shadow-glow-lg"
            >
              <Plus className="size-4" />
              {t("newDesign")}
            </Button>
            {!pack ? (
              <VisionPackBuyCta returnPath="/venue-designer/new" />
            ) : null}
          </div>
        </motion.header>

        {/* No-pack hero banner: when the user has never bought a pack, lead
            with the paid value prop instead of the free-designer pitch. */}
        {!pack && !isLoading && (
          <motion.section
            initial={reduceMotion ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="mb-12 overflow-hidden rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/80 via-white to-amber-50/60 p-6 shadow-sm sm:p-8"
          >
            <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2 max-w-xl">
                <div className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/70 bg-white/80 px-3 py-1 text-eyebrow font-medium text-rose-700 backdrop-blur-sm">
                  <Sparkles className="size-3" />
                  {tv("name")}
                </div>
                <h2 className="font-display text-2xl font-light tracking-tight sm:text-3xl">
                  {tv("tagline")}
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {tv("paywallBody", { price: pricing.label })}
                </p>
              </div>
              <Button
                size="lg"
                onClick={() =>
                  paywall.open({ returnPath: "/venue-designer/new" })
                }
                className="h-11 gap-2 bg-brand-gradient px-5 text-white shadow-glow hover:opacity-90"
              >
                <Sparkles className="size-4" />
                {tv("buyCtaShort", { price: pricing.label })}
              </Button>
            </div>
          </motion.section>
        )}

        {isLoading ? (
          <SkeletonRegion
            label={tCommon("loading")}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl bg-card/80 ring-1 ring-foreground/[0.06] backdrop-blur-sm"
              >
                <Skeleton className="aspect-[4/3] rounded-none" />
                <div className="space-y-2.5 p-5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
            {/* The spinner under the grid is gone: a skeleton already says
                "loading", and the two together read as two separate things
                loading. */}
          </SkeletonRegion>
        ) : !designs || designs.length === 0 ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="mb-6 grid size-16 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
              <Sparkles className="size-7 text-rose-600" />
            </div>
            <h2 className="font-display text-2xl font-light tracking-tight">
              {t("noDesignsTitle")}
            </h2>
            <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
              {t("noDesignsBody")}
            </p>
            <div aria-hidden className="champagne-hairline mx-auto mt-6 h-px w-32" />
            <Button
              size="lg"
              onClick={() => router.push("/venue-designer/new")}
              className="mt-7 h-11 gap-2 bg-brand-gradient px-5 text-white shadow-glow hover:opacity-90"
            >
              <Plus className="size-4" />
              {t("createFirstDesign")}
            </Button>
          </motion.div>
        ) : (
          <motion.div
            initial={reduceMotion ? false : "hidden"}
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.04 } },
            }}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {designs.map((design) => {
              const palette = normalizePalette(design.palette);
              const heroImage =
                design.media[0]?.url ?? design.thumbnail ?? null;

              return (
                <motion.article
                  key={design.id}
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    show: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                  onClick={() => router.push(`/venue-designer/${design.id}`)}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl bg-card/80 ring-1 ring-foreground/[0.06] backdrop-blur-sm transition-shadow hover:shadow-[0_20px_50px_-20px_rgba(244,63,94,0.25)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    {heroImage ? (
                      <MediaImage
                        src={heroImage}
                        alt={design.name}
                        fill
                        sizes="card"
                        className="transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-50 via-rose-50/60 to-amber-50">
                        <div className="text-center">
                          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-white/70 ring-1 ring-rose-200/60 backdrop-blur-sm">
                            <Sparkles className="size-5 text-rose-500" />
                          </div>
                          <p className="text-xs tracking-wide text-muted-foreground">
                            {t("noRenderYet")}
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                    <div className="absolute start-2.5 top-2.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-black/55 px-2 py-0.5 text-xs font-medium tracking-wide text-white backdrop-blur-sm">
                        {eventTypeLabel(design.event_type)}
                      </span>
                      {palette.colors.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-1 backdrop-blur-sm">
                          {palette.colors.slice(0, 4).map((c) => (
                            <span
                              key={c}
                              className="block size-2 rounded-full ring-1 ring-white/40"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, design.id, design.name)}
                      aria-label={t("deleteDesignAria", { name: design.name })}
                      className="absolute end-2.5 top-2.5 grid size-9 place-items-center rounded-full bg-black/55 text-white opacity-100 backdrop-blur-sm transition-opacity hover:bg-black/80 md:size-7 md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash2 className="size-4 md:size-3.5" />
                    </button>

                    <div
                      aria-hidden
                      className="pointer-events-none absolute bottom-3 end-3 grid size-9 translate-y-0 place-items-center rounded-full bg-white/95 text-rose-600 opacity-100 shadow-lg transition-all md:translate-y-2 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100"
                    >
                      <ArrowRight className="size-4 rtl:-scale-x-100" />
                    </div>
                  </div>

                  <div className="space-y-3 p-5">
                    <div>
                      <h3 className="font-display text-lg leading-tight font-medium tracking-tight">
                        {design.name}
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {sizeLabel(design.size)} · {settingLabel(design.setting)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{f.relativeTime(new Date(design.updated_at))}</span>
                      {design._count.media > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-rose-700 ring-1 ring-rose-200/60">
                          <ImageIcon className="size-3" />
                          {f.number(design._count.media)}
                        </span>
                      )}
                    </div>

                    {/* "Open event" survives for legacy designs already
                        linked to an event; otherwise approval is open to
                        every permanent account, it files the lead the
                        concierge follows up on. */}
                    {design.event_id ? (
                      <button
                        type="button"
                        onClick={(e) =>
                          handleOpenEvent(e, design.event_id as string)
                        }
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200/70 bg-rose-50/60 px-3 py-1.5 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100/70"
                      >
                        <CheckCircle2 className="size-3.5" />
                        {t("approvedOpenEvent")}
                        <ArrowRight className="size-3 rtl:-scale-x-100" />
                      </button>
                    ) : design.approved_at ? (
                      <div className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-rose-200/70 bg-rose-50/60 px-3 py-1.5 text-xs font-medium text-rose-700">
                        <CheckCircle2 className="size-3.5" />
                        {t("approvedCta")}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          approveMutation.isPending &&
                          approveMutation.variables?.designId === design.id
                        }
                        onClick={(e) => handleApprove(e, design.id)}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-gradient px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
                      >
                        {approveMutation.isPending &&
                        approveMutation.variables?.designId === design.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <CheckCircle2 className="size-3.5" />
                        )}
                        {t("approveDesign")}
                      </button>
                    )}
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
    </>
  );
}
