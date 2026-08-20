"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  CalendarDays,
  Lock,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  MarketplaceTeaserData,
  PublicBriefTeaser,
} from "@/lib/marketplace-teaser";

type Variant = "home" | "planner-signup";

interface MarketplaceTeaserProps {
  data: MarketplaceTeaserData;
  variant: Variant;
  className?: string;
}

// Cap at 6 cards on home (3-col grid), 3 on the auth aside (single column).
function visibleTeasers(
  teasers: PublicBriefTeaser[],
  variant: Variant,
): PublicBriefTeaser[] {
  return variant === "planner-signup" ? teasers.slice(0, 3) : teasers.slice(0, 6);
}

function formatMonth(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
  }).format(d);
}

export function MarketplaceTeaser({
  data,
  variant,
  className,
}: MarketplaceTeaserProps) {
  const t = useTranslations("marketplaceTeaser");
  const reduce = useReducedMotion();
  const locale = useLocale();
  const visible = visibleTeasers(data.teasers, variant);

  const isHome = variant === "home";
  const isSignup = variant === "planner-signup";

  // No live briefs at all — render a small "early access" copy block on the
  // home page, and skip the section entirely on the planner sign-up so we
  // don't lead with an empty wall.
  if (visible.length === 0 && data.total_open === 0) {
    if (isSignup) return null;
    return (
      <section
      data-visual-mask
        className={cn(
          "relative isolate overflow-hidden bg-gradient-to-b from-background via-amber-50/30 to-background",
          className,
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 grain-bg opacity-30"
        />
        <div className="relative mx-auto max-w-3xl px-4 py-24 text-center sm:py-28">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-rose-200/60 bg-white/70 px-4 py-1.5 text-eyebrow text-rose-700 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5" />
            {t("homeEyebrow")}
          </div>
          <h2 className="font-display text-balance text-3xl font-light leading-tight tracking-tight sm:text-4xl">
            {t("homeEmptyTitle")}
          </h2>
          <p className="mt-4 text-pretty text-base text-muted-foreground">
            {t("homeEmptyBody")}
          </p>
        </div>
      </section>
    );
  }

  const containerCls = isHome
    ? "relative isolate overflow-hidden bg-gradient-to-b from-background via-rose-50/30 to-background"
    : "rounded-3xl border border-rose-200/60 bg-gradient-to-br from-rose-50/80 via-white/70 to-amber-50/60 p-5 shadow-sm backdrop-blur-md sm:p-6";

  return (
    <section
      data-visual-mask
      aria-label={t(isHome ? "homeAria" : "signupAria")}
      className={cn(containerCls, className)}
    >
      {isHome && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 grain-bg opacity-30"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-200/30 to-amber-200/25 blur-3xl"
          />
        </>
      )}

      <div
        className={cn(
          "relative",
          isHome
            ? "mx-auto max-w-7xl px-4 py-24 sm:py-28"
            : "",
        )}
      >
        {/* Header */}
        <div
          className={cn(
            "mb-8",
            isHome ? "max-w-2xl" : "mb-5",
          )}
        >
          <div
            className={cn(
              "inline-flex items-center gap-2 rounded-full border border-rose-200/60 bg-white/70 backdrop-blur-md",
              isHome
                ? "mb-5 px-4 py-1.5 text-eyebrow text-rose-700"
                : "mb-3 px-3 py-1 text-eyebrow text-rose-700",
            )}
          >
            <Sparkles
              className={isHome ? "h-3.5 w-3.5" : "h-3 w-3"}
              strokeWidth={2}
            />
            {t(isHome ? "homeEyebrow" : "signupEyebrow")}
          </div>
          <h2
            className={cn(
              "font-display text-balance font-light leading-[1.05] tracking-tight",
              isHome ? "text-4xl sm:text-5xl" : "text-2xl sm:text-3xl",
            )}
          >
            {isHome
              ? t.rich("homeTitle", {
                  // `total_active` (designing now) rather than `total_open`
                  // (awaiting a planner): the planner marketplace is hidden,
                  // so this number is about couple momentum, not supply.
                  count: data.total_active,
                  highlight: (chunks) => (
                    <span className="text-brand-gradient">
                      {chunks}
                    </span>
                  ),
                })
              : t.rich("signupTitle", {
                  count: data.total_open,
                  highlight: (chunks) => (
                    <span className="text-brand-gradient">
                      {chunks}
                    </span>
                  ),
                })}
          </h2>
          <p
            className={cn(
              "text-pretty text-muted-foreground",
              isHome ? "mt-4 text-base sm:text-lg" : "mt-2 text-sm",
            )}
          >
            {t(isHome ? "homeSubtitle" : "signupSubtitle")}
          </p>
        </div>

        {/* Card grid */}
        <ul
          className={cn(
            "grid gap-4",
            isHome
              ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
              : "grid-cols-1 sm:grid-cols-3",
          )}
        >
          {visible.map((b, i) => (
            <motion.li
              key={b.id}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10% 0px" }}
              transition={{
                duration: reduce ? 0 : 0.55,
                delay: reduce ? 0 : 0.05 + i * 0.05,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <BriefCard
                brief={b}
                eventTypeLabel={t(`eventType_${b.event_type}` as `eventType_${string}`)}
                guestLabel={
                  b.guest_band
                    ? t(`guestBand_${b.guest_band}`)
                    : t("guestBandUnknown")
                }
                monthLabel={
                  formatMonth(b.event_month, locale) ?? t("dateOpen")
                }
                signInLabel={t("signInToSee")}
                compact={isSignup}
              />
            </motion.li>
          ))}
        </ul>

        {/* CTA row */}
        <div
          className={cn(
            "flex flex-wrap items-center gap-3",
            isHome ? "mt-10" : "mt-6",
          )}
        >
          {isHome ? (
            <>
              <Button
                size="lg"
                render={<Link href="/venue-designer/new" />}
                className="group h-12 gap-2 bg-brand-gradient px-7 text-base text-white shadow-glow transition-all hover:opacity-90 hover:shadow-glow-lg"
              >
                {t("homeCtaCouple")}
                <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Button>
              {/* Secondary CTA is the full-service enquiry. Points at the
                  dedicated intake wizard (ZAF-39); the
                  planner-acquisition CTA that used to sit here pointed at a
                  route that now 404s. */}
              <Button
                size="lg"
                variant="outline"
                render={<Link href="/enquire" />}
                className="group h-12 gap-2 border-rose-200/70 bg-white/80 px-6 text-base backdrop-blur-sm hover:border-rose-300 hover:bg-white"
              >
                {t("homeCtaFullService")}
                <ArrowRight className="h-4 w-4 transition-transform rtl:-scale-x-100 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
              </Button>
              {data.total_active > data.total_open && (
                <p className="text-xs text-muted-foreground">
                  {t("homeAlsoDesigning", {
                    count: data.total_active - data.total_open,
                  })}
                </p>
              )}
            </>
          ) : (
            data.total_open > visible.length && (
              <p className="text-xs text-muted-foreground">
                {t("signupMoreBehind", {
                  count: data.total_open - visible.length,
                })}
              </p>
            )
          )}
        </div>
      </div>
    </section>
  );
}

interface BriefCardProps {
  brief: PublicBriefTeaser;
  eventTypeLabel: string;
  guestLabel: string;
  monthLabel: string;
  signInLabel: string;
  compact?: boolean;
}

function BriefCard({
  brief,
  eventTypeLabel,
  guestLabel,
  monthLabel,
  signInLabel,
  compact,
}: BriefCardProps) {
  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-brand-line bg-white/80 ring-1 ring-foreground/[0.04] backdrop-blur-sm transition-shadow hover:shadow-lg hover:shadow-glow-lg",
      )}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60",
          compact ? "aspect-[5/4]" : "aspect-[4/3]",
        )}
      >
        {brief.hero_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={brief.hero_image}
            alt=""
            aria-hidden
            // The blur is the privacy mechanism: enough to hide the venue
            // and the specifics of the design, but light enough that the
            // palette, lighting, and framing still come through. `scale-110`
            // hides the soft edges blur leaves at the border.
            className="h-full w-full scale-110 object-cover blur-md saturate-110"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Sparkles className="size-7 text-rose-400/70" />
          </div>
        )}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/15 to-black/55"
        />

        {/* Lock chip — the central "this is hidden" affordance. */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-black/40 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            <Lock className="size-3" />
            {signInLabel}
          </span>
        </div>

        {/* Top-left chip: event type — the only piece of info we expose
            up front, since the enum itself isn't identifying. */}
        <div className="absolute start-3 top-3 inline-flex items-center rounded-full bg-white/90 px-2.5 py-0.5 text-eyebrow font-medium text-rose-700 backdrop-blur-sm">
          {eventTypeLabel}
        </div>

        {/* Bottom-right palette dots, if we have any. */}
        {brief.palette.length > 0 && (
          <div className="absolute end-3 bottom-3 flex items-center gap-1 rounded-full bg-white/90 px-2 py-1 backdrop-blur-sm">
            {brief.palette.map((c) => (
              <span
                key={c}
                className="block size-2.5 rounded-full ring-1 ring-foreground/10"
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-foreground/85">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarDays className="size-3.5 text-rose-500/80" />
            <span className="truncate">{monthLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Users className="size-3.5 text-rose-500/80" />
            <span className="truncate">{guestLabel}</span>
          </div>
        </dl>
      </div>
    </article>
  );
}
