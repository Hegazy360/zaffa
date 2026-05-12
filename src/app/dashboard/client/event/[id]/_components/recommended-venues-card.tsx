"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Building2,
  Heart,
  Loader2,
  MapPin,
  Sparkles,
  Users,
  X as XIcon,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

interface Props {
  eventId: string;
  /**
   * SKU of the event's most recent Vision Pack. Recommendations are
   * only surfaced for SKUs whose `includesVenueRecs` flag is true; the
   * parent passes the SKU id and we gate on it via PACK_SKUS to keep
   * the UI honest about what was purchased.
   */
  packSku: string | null;
}

const VENUE_REC_SKU = "wedding_vision_pack_v1";

/**
 * Couple-facing "Recommended venues" card. Lives on the event Overview
 * tab. Only renders for higher-tier Vision Pack events — Design Pack
 * customers don't see it because that SKU doesn't include venue
 * matching.
 *
 * Two actions per card:
 *  - "I'm interested" → calls `expressInterest` which timestamps the
 *    row and pings ops via a `venue_lead_opened` notification so Zaffa
 *    can facilitate the introduction with the venue.
 *  - "Dismiss" → soft-hides the recommendation client-side. The admin
 *    UI still shows it as dismissed so we can tell what was rejected.
 */
export function RecommendedVenuesCard({ eventId, packSku }: Props) {
  const t = useTranslations("visionPack");
  const utils = trpc.useUtils();
  // Only fetch when the event qualifies — saves a query for every
  // Design-Pack-only customer scrolling the dashboard.
  const enabled = packSku === VENUE_REC_SKU;
  const { data: recs, isLoading } = trpc.venues.myRecommendationsForEvent.useQuery(
    { eventId },
    { enabled },
  );

  const interested = trpc.venues.expressInterest.useMutation({
    onSuccess: (data) => {
      utils.venues.myRecommendationsForEvent.invalidate({ eventId });
      if (data.alreadyInterested) {
        toast.success(t("venueRecsAlreadyInterestedToast"));
      } else {
        toast.success(t("venueRecsInterestedToast"));
      }
    },
    onError: (e) => toast.error(e.message),
  });
  const dismiss = trpc.venues.dismiss.useMutation({
    onSuccess: () => {
      utils.venues.myRecommendationsForEvent.invalidate({ eventId });
    },
    onError: (e) => toast.error(e.message),
  });

  if (!enabled) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-rose-100/70 bg-gradient-to-br from-rose-50/40 via-white/80 to-amber-50/30 backdrop-blur-sm dark:border-rose-900/30 dark:from-rose-950/20 dark:via-card/80 dark:to-amber-950/10">
      <div className="flex items-center justify-between border-b border-rose-100/70 px-5 py-3 dark:border-rose-900/30">
        <div className="flex items-center gap-2">
          <Sparkles className="size-3.5 text-rose-500" />
          <h3 className="font-display text-base font-medium tracking-tight">
            {t("venueRecsTitle")}
          </h3>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {t("venueRecsCuratedBy")}
        </p>
      </div>

      <div className="p-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : !recs || recs.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-white/60 px-5 py-10 text-center dark:bg-card/40">
            <Building2 className="mx-auto size-7 text-rose-400" />
            <p className="mt-3 text-sm text-muted-foreground">
              {t("venueRecsEmpty")}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {recs.map((rec) => {
              const cover =
                rec.venue.cover_image ?? rec.venue.images[0]?.url ?? null;
              const isInterested = !!rec.interested_at;
              return (
                <li
                  key={rec.id}
                  className="flex flex-col overflow-hidden rounded-xl border border-rose-100/70 bg-white/90 dark:border-rose-900/30 dark:bg-card/80"
                >
                  {cover ? (
                    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                      <Image
                        src={cover}
                        alt={rec.venue.name}
                        fill
                        sizes="(min-width: 640px) 50vw, 100vw"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="grid aspect-[4/3] w-full place-items-center bg-rose-50/60 dark:bg-rose-950/20">
                      <Building2 className="size-8 text-rose-400" />
                    </div>
                  )}
                  <div className="flex flex-1 flex-col gap-2 p-4">
                    <div>
                      <p className="font-medium">{rec.venue.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3" />
                        {rec.venue.city}, {rec.venue.country}
                      </p>
                    </div>
                    {rec.venue.capacity_max ? (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Users className="size-3" />
                        {rec.venue.capacity_min ?? 0}–{rec.venue.capacity_max}{" "}
                        {t("venueRecsGuests")}
                      </p>
                    ) : null}
                    {Array.isArray(rec.venue.styles) &&
                    rec.venue.styles.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(rec.venue.styles as string[])
                          .slice(0, 4)
                          .map((style) => (
                            <span
                              key={style}
                              className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
                            >
                              {style}
                            </span>
                          ))}
                      </div>
                    ) : null}
                    {rec.note ? (
                      <p className="rounded-md bg-rose-50/60 px-3 py-2 text-xs italic text-rose-900/90 dark:bg-rose-950/30 dark:text-rose-100/90">
                        “{rec.note}”
                      </p>
                    ) : null}
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={isInterested || interested.isPending}
                        onClick={() =>
                          interested.mutate({ recommendationId: rec.id })
                        }
                        className={
                          "h-8 gap-1.5 text-xs " +
                          (isInterested
                            ? "bg-emerald-600 text-white hover:bg-emerald-600"
                            : "bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90")
                        }
                      >
                        {interested.isPending ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Heart className="size-3" />
                        )}
                        {isInterested
                          ? t("venueRecsInterested")
                          : t("venueRecsInterest")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={dismiss.isPending}
                        onClick={() =>
                          dismiss.mutate({ recommendationId: rec.id })
                        }
                        className="h-8 gap-1 text-xs text-muted-foreground"
                      >
                        <XIcon className="size-3" />
                        {t("venueRecsDismiss")}
                      </Button>
                    </div>
                    {isInterested ? (
                      <p className="text-[11px] text-emerald-700">
                        {t("venueRecsInterestConfirm")}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
