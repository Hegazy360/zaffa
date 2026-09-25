"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Check, Loader2, MapPin, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaImage } from "@/components/ui/media-image";
import { Skeleton, SkeletonRegion } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { track } from "@/lib/analytics";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { isLocale } from "@/i18n/config";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import type { Setting } from "@/types/venue-designer";
import { useDesignerFlag } from "@/components/venue-designer/designer-flags-provider";
import { useDesignerStep } from "./DesignerStepper";
import {
  INTAKE_DEBOUNCE_MS,
  buildIntakeRequest,
  conflictKey,
  intakeFailed,
  recallIntake,
  rememberIntake,
  rememberIntakeFailure,
  venueCandidates,
  type CachedIntake,
  type IntakeConflict,
  type VenueCandidate,
} from "./intake-review";

interface IntakeReviewCardProps {
  /**
   * The clean English brief for the render, or null. Only ever the brief
   * checked against the inputs on screen right now: a brief read from
   * notes the couple has since changed is worse than none.
   */
  onBriefChange: (briefEn: string | null) => void;
  /**
   * A render is being prepared or is on its way. It was sent with the
   * inputs as they were when Generate was pressed, so a fix tapped now
   * would change the design but not that render, while the card said the
   * render would follow it. The fixes wait until it is back.
   */
  renderInFlight?: boolean;
  /**
   * True while a fix the couple tapped is still changing the design
   * (copying a reference into their venue photo). The panel holds the
   * render button meanwhile, or the render would leave without the venue
   * they just chose.
   */
  onBusyChange?: (busy: boolean) => void;
}

type Applied = { kind: "setting"; setting: Setting } | { kind: "venue" } | null;

/**
 * "Here's what we'll create" (F3), on the generate step above the render
 * button: the intake check's reading of everything the couple chose, the
 * contradictions it found with a one-tap fix each, and any reference that
 * looks like a photo of their own empty venue, offered as the canvas.
 *
 * It asks on its own, 800ms after the inputs settle, and remembers each
 * answer for the session so coming back to the step costs nothing. It
 * never blocks the render: while it reads there is a skeleton beside a
 * working button, and if the check fails the card is simply not there.
 */
export function IntakeReviewCard({
  onBriefChange,
  renderInFlight = false,
  onBusyChange,
}: IntakeReviewCardProps) {
  const t = useTranslations("designer");
  const uiLocale = useLocale();
  const enabled = useDesignerFlag("intakeCheck");
  const venuePhotoEnabled = useDesignerFlag("venuePhoto");
  const { goToStep } = useDesignerStep();

  const eventType = useVenueDesignerStore((s) => s.eventType);
  const setting = useVenueDesignerStore((s) => s.setting);
  const guestCount = useVenueDesignerStore((s) => s.guestCount);
  const palette = useVenueDesignerStore((s) => s.palette);
  const references = useVenueDesignerStore((s) => s.references);
  const styleNotes = useVenueDesignerStore((s) => s.styleNotes ?? "");
  const storedVenuePhoto = useVenueDesignerStore((s) => s.venuePhoto);
  const setSetting = useVenueDesignerStore((s) => s.setSetting);
  const setVenuePhoto = useVenueDesignerStore((s) => s.setVenuePhoto);
  const removeReference = useVenueDesignerStore((s) => s.removeReference);
  const hasVenuePhoto = venuePhotoEnabled && storedVenuePhoto !== null;
  const locale = isLocale(uiLocale) ? uiLocale : undefined;

  const request = useMemo(
    () =>
      enabled
        ? buildIntakeRequest({
            eventType,
            setting,
            guestCount,
            palette,
            references,
            styleNotes,
            hasVenuePhoto,
            locale: locale ?? "",
          })
        : null,
    [enabled, eventType, setting, guestCount, palette, references, styleNotes, hasVenuePhoto, locale],
  );

  // The answer on screen, which may be for inputs the couple has since
  // changed while the next check is on its way (stale while revalidating,
  // so a fix does not blank the card).
  const [shown, setShown] = useState<(CachedIntake & { key: string }) | null>(null);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);
  const { mutateAsync: runCheck } = trpc.ai.checkIntake.useMutation();

  useEffect(() => {
    if (!request) return;
    const cached = recallIntake(request.key);
    if (cached) {
      setShown({ key: request.key, ...cached });
      setChecking(false);
      setFailed(false);
      return;
    }
    if (intakeFailed(request.key)) {
      setChecking(false);
      setFailed(true);
      return;
    }
    setFailed(false);
    setChecking(true);
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const result = await runCheck({ ...request.input, locale });
        const entry: CachedIntake = { result, slots: request.slots };
        rememberIntake(request.key, entry);
        if (!current) return;
        setShown({ key: request.key, ...entry });
        setChecking(false);
      } catch {
        // Reported on the server; here the card just steps aside.
        rememberIntakeFailure(request.key);
        if (!current) return;
        setChecking(false);
        setFailed(true);
      }
    }, INTAKE_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [request, runCheck, locale]);

  const fresh = shown && request && shown.key === request.key ? shown : null;
  const briefEn = fresh?.result.briefEn || null;
  useEffect(() => {
    onBriefChange(briefEn);
    return () => onBriefChange(null);
  }, [briefEn, onBriefChange]);

  // What the couple did about this session's answers.
  const [kept, setKept] = useState<ReadonlySet<string>>(new Set());
  const [notVenue, setNotVenue] = useState<ReadonlySet<string>>(new Set());
  // The answer whose setting conflict was just fixed, so it hides until the
  // re-check for the new setting replaces it.
  const [switchedIn, setSwitchedIn] = useState<string | null>(null);
  const [applied, setApplied] = useState<Applied>(null);
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const [venueError, setVenueError] = useState<string | null>(null);
  const promote = trpc.venueDesigns.promoteReferenceToVenue.useMutation();

  const promoting = promotingId !== null;
  useEffect(() => {
    onBusyChange?.(promoting);
    return () => onBusyChange?.(false);
  }, [promoting, onBusyChange]);

  if (!request || failed) return null;

  const conflicts = shown
    ? shown.result.conflicts.filter((c) => {
        if (kept.has(conflictKey(c))) return false;
        if (c.kind === "setting" && switchedIn === shown.key) return false;
        // Fixed another way (the basics step) since this answer was read.
        if (c.kind === "setting" && c.suggestedSetting === setting) return false;
        return true;
      })
    : [];
  const candidates =
    shown && venuePhotoEnabled && !hasVenuePhoto
      ? venueCandidates(shown, references, notVenue)
      : [];

  // Every fix waits while a render is out: see `renderInFlight`.
  const fixesLocked = renderInFlight;
  const hasFixes = conflicts.length > 0 || candidates.length > 0 || guestCount == null;

  // The line saying what a fix did, for as long as it is still true.
  const showApplied =
    applied?.kind === "setting" ? applied.setting === setting : applied?.kind === "venue" && hasVenuePhoto;

  const fixSetting = (to: Setting) => {
    setSetting(to);
    if (shown) setSwitchedIn(shown.key);
    setApplied({ kind: "setting", setting: to });
    track(ANALYTICS_EVENTS.DESIGN_INTAKE_FIX_APPLIED, { fix: "setting", from: setting, to });
  };

  const keepAsIs = (conflict: IntakeConflict) => {
    setKept((prev) => new Set(prev).add(conflictKey(conflict)));
    track(ANALYTICS_EVENTS.DESIGN_INTAKE_FIX_APPLIED, { fix: "kept", kind: conflict.kind });
  };

  const openBasics = (reason: "guest_count_missing" | "guest_count") => {
    track(ANALYTICS_EVENTS.DESIGN_INTAKE_FIX_APPLIED, { fix: "open_basics", reason });
    goToStep("basics");
  };

  const promoteCandidate = async ({ ref, category }: VenueCandidate) => {
    setPromotingId(ref.id);
    setVenueError(null);
    try {
      const photo = await promote.mutateAsync({ url: ref.url });
      setVenuePhoto(photo);
      removeReference(category, ref.id);
      setApplied({ kind: "venue" });
      track(ANALYTICS_EVENTS.DESIGN_INTAKE_FIX_APPLIED, { fix: "venue_photo" });
    } catch (err) {
      const code = (err as { data?: { code?: string } } | null)?.data?.code;
      setVenueError(
        code === "TOO_MANY_REQUESTS" ? t("venuePhoto.errorRateLimited") : t("intake.venueFailed"),
      );
    } finally {
      setPromotingId(null);
    }
  };

  const dismissCandidate = (id: string) => {
    setNotVenue((prev) => new Set(prev).add(id));
    track(ANALYTICS_EVENTS.DESIGN_INTAKE_FIX_APPLIED, { fix: "not_venue" });
  };

  return (
    <section
      aria-labelledby="intake-review-title"
      data-intake-card=""
      className="space-y-3 rounded-lg border border-rose-200/80 bg-background/80 p-3 text-sm sm:p-4"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-rose-500" aria-hidden />
        <h3 id="intake-review-title" className="text-eyebrow font-medium text-muted-foreground">
          {t("intake.title")}
        </h3>
        {checking && shown ? (
          <span className="ms-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden />
            {t("intake.updating")}
          </span>
        ) : null}
      </div>

      {fixesLocked && hasFixes ? (
        <p data-intake-locked="" className="text-xs leading-relaxed text-muted-foreground">
          {t("intake.renderInFlight")}
        </p>
      ) : null}

      {shown ? (
        <div aria-live="polite" className="space-y-3">
          <p data-intake-summary="" className="leading-relaxed">
            {shown.result.summary}
          </p>

          {showApplied ? (
            <p
              role="status"
              data-intake-applied=""
              className="flex items-start gap-2 text-xs font-medium text-emerald-700"
            >
              <Check className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {applied?.kind === "setting"
                ? t("intake.switched", { setting: applied.setting })
                : t("intake.venueUsed")}
            </p>
          ) : null}

          {conflicts.map((conflict) => (
            <div
              key={conflictKey(conflict)}
              data-intake-conflict={conflict.kind}
              className="space-y-2 rounded-md border border-amber-200 bg-amber-50/70 p-3"
            >
              <p className="flex items-start gap-2 leading-relaxed text-amber-950">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
                <span>
                  {conflict.message ??
                    t("intake.settingMismatch", {
                      setting: conflict.suggestedSetting ?? "other",
                      current: setting,
                    })}
                </span>
              </p>
              <div className="flex flex-wrap gap-2 ps-6">
                {conflict.kind === "setting" && conflict.suggestedSetting ? (
                  <Button
                    type="button"
                    size="lg"
                    data-intake-fix-setting={conflict.suggestedSetting}
                    disabled={fixesLocked}
                    onClick={() => fixSetting(conflict.suggestedSetting!)}
                    className="h-11 bg-rose-500 text-white hover:bg-rose-600 sm:h-9"
                  >
                    {t("intake.switchTo", { setting: conflict.suggestedSetting })}
                  </Button>
                ) : null}
                {conflict.kind === "guest_count" ? (
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    disabled={fixesLocked}
                    onClick={() => openBasics("guest_count")}
                    className="h-11 sm:h-9"
                  >
                    {t("intake.checkGuests")}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="lg"
                  variant="ghost"
                  data-intake-keep=""
                  disabled={fixesLocked}
                  onClick={() => keepAsIs(conflict)}
                  className="h-11 sm:h-9"
                >
                  {t("intake.keepAsIs")}
                </Button>
              </div>
            </div>
          ))}

          {candidates.map((candidate) => (
            <div
              key={candidate.ref.id}
              data-intake-venue-candidate={candidate.ref.id}
              className="flex gap-3 rounded-md border border-rose-200 bg-rose-50/60 p-3"
            >
              <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                <MediaImage
                  src={candidate.ref.thumbnailUrl ?? candidate.ref.url}
                  alt={t("intake.venueThumbAlt")}
                  fill
                  sizes="thumb"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex items-center gap-1.5 font-medium">
                  <MapPin className="size-3.5 shrink-0 text-rose-600" aria-hidden />
                  {t("intake.venueQuestion")}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t("intake.venueHint")}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="lg"
                    data-intake-use-venue=""
                    disabled={promoting || fixesLocked}
                    onClick={() => void promoteCandidate(candidate)}
                    className="h-11 gap-2 bg-rose-500 text-white hover:bg-rose-600 sm:h-9"
                  >
                    {promotingId === candidate.ref.id ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : null}
                    {t("intake.useAsVenue")}
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="ghost"
                    data-intake-not-venue=""
                    disabled={promoting || fixesLocked}
                    onClick={() => dismissCandidate(candidate.ref.id)}
                    className="h-11 sm:h-9"
                  >
                    {t("intake.notOurVenue")}
                  </Button>
                </div>
              </div>
            </div>
          ))}
          {venueError ? (
            <p role="alert" className="text-xs text-destructive">
              {venueError}
            </p>
          ) : null}
        </div>
      ) : (
        <SkeletonRegion label={t("intake.checking")} className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </SkeletonRegion>
      )}

      {guestCount == null ? (
        <div
          data-intake-guests-missing=""
          className="flex flex-col gap-2 border-t border-border/60 pt-3 sm:flex-row sm:items-center"
        >
          <p className="flex flex-1 items-start gap-2 text-xs leading-relaxed text-muted-foreground">
            <Users className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {t("intake.guestsMissing")}
          </p>
          <Button
            type="button"
            size="lg"
            variant="outline"
            disabled={fixesLocked}
            onClick={() => openBasics("guest_count_missing")}
            className="h-11 shrink-0 sm:h-9"
          >
            {t("intake.addGuests")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}
