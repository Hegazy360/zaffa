"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Loader2,
  Download,
  RotateCcw,
  Video,
  Camera,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useFormatters } from "@/lib/use-formatters";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import {
  MAX_TOTAL_REFERENCES,
  REFERENCE_CATEGORIES,
  type ReferenceCategory,
} from "@/types/venue-designer";
import { usePackPaywall } from "@/components/vision-pack/VisionPackPaywallProvider";
import { EmailGateOverlay } from "./EmailGateOverlay";
import { canSendRender, designIdForRender } from "./render-design-id";
import {
  RENDER_RECOVERY_POLL_MS,
  RENDER_RECOVERY_WINDOW_MS,
  findLandedRender,
  renderMayHaveLanded,
  renderOutcomeUnknown,
} from "./render-recovery";
import { Turnstile } from "@/components/security/Turnstile";
import { useIsAnonymous } from "@/lib/use-is-anonymous";
import { isFreePack, packAllowsVideo } from "@/lib/vision-pack";
import { LockableAction } from "@/components/ui/lockable-action";
import { useConfirm } from "@/components/ui/confirm";
import { MediaImage } from "@/components/ui/media-image";
import { CompareSlider } from "@/components/ui/compare-slider";
import { useDesignerFlag } from "@/components/venue-designer/designer-flags-provider";
import { compareBeforePhoto, type LineageRow } from "@/lib/venue-photo";
import { RefineBox, type RefineResult } from "./RefineBox";
import { VersionStrip } from "./VersionStrip";
import {
  buildRenderVersions,
  withPendingVersions,
  type RenderVersion,
  type VersionMedia,
} from "./render-versions";

interface GenerateRenderPanelProps {
  designId?: string;
  /**
   * Flush the design save and resolve with the design id (creating the
   * design on its first save). Called before every render so the server
   * can write the render row itself. Optional so the panel still renders
   * standalone; without it the render falls back to `designId` as is.
   */
  saveNow?: () => Promise<string>;
}

type View = "form" | "image" | "video-pending" | "video";

const REF_SUMMARY_KEY: Record<ReferenceCategory, string> = {
  overall_vibe: "refSummaryOverallVibe",
  tables: "refSummaryTables",
  flowers: "refSummaryFlowers",
  lighting: "refSummaryLighting",
  venue_decor: "refSummaryVenueDecor",
};

const SIZE_KEY: Record<string, string> = {
  intimate: "sizeIntimate",
  medium: "sizeMedium",
  large: "sizeLarge",
};

const SETTING_KEY: Record<string, string> = {
  indoor: "settingIndoor",
  outdoor: "settingOutdoor",
  tent: "settingTent",
};

const EVENT_TYPE_KEY: Record<string, string> = {
  wedding: "eventTypeWedding",
  engagement: "eventTypeEngagement",
  birthday: "eventTypeBirthday",
  corporate: "eventTypeCorporate",
  other: "eventTypeOther",
};

export function GenerateRenderPanel({
  designId,
  saveNow,
}: GenerateRenderPanelProps) {
  const t = useTranslations("designer");
  const tCommon = useTranslations("common");
  const confirm = useConfirm();
  const f = useFormatters();
  const paywall = usePackPaywall();
  const eventType = useVenueDesignerStore((s) => s.eventType);
  const setting = useVenueDesignerStore((s) => s.setting);
  const size = useVenueDesignerStore((s) => s.size);
  const guestCount = useVenueDesignerStore((s) => s.guestCount);
  const palette = useVenueDesignerStore((s) => s.palette);
  const references = useVenueDesignerStore((s) => s.references);
  const styleNotes = useVenueDesignerStore((s) => s.styleNotes ?? "");
  const setActiveRenderMediaId = useVenueDesignerStore(
    (s) => s.setActiveRenderMediaId,
  );
  const activeRenderMediaId = useVenueDesignerStore(
    (s) => s.activeRenderMediaId,
  );
  // F1: with a venue photo the server dresses that photo, and the photo
  // alone is enough to render (no mood references needed).
  const venuePhotoEnabled = useDesignerFlag("venuePhoto");
  const storedVenuePhoto = useVenueDesignerStore((s) => s.venuePhoto);
  const venuePhoto = venuePhotoEnabled ? storedVenuePhoto : null;
  // F2: "what would you change?" under the render, and the version strip.
  const refineEnabled = useDesignerFlag("refineRender");

  const [resultImage, setResultImage] = useState<string | null>(null);
  const [view, setView] = useState<View>("form");
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  // True while the design save is flushed ahead of a render (and, after a
  // render lost in transit, while we look for it), the gap before the
  // render mutation itself is pending. The ref is the guard (a double tap
  // lands before the re-render that disables the button), the state drives
  // the button.
  const [preparingRender, setPreparingRender] = useState(false);
  const renderStartingRef = useRef(false);
  // Render ids the design held when the couple pressed Generate, and the
  // watch that uses them after a render failed without an answer: the
  // server may have finished it anyway (see render-recovery.ts).
  const knownRenderIdsRef = useRef<ReadonlySet<string>>(new Set());
  const [recovery, setRecovery] = useState<{
    designId: string;
    knownIds: ReadonlySet<string>;
    until: number;
  } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const utils = trpc.useUtils();
  // Tracks the id of the render media row that the currently-displayed image
  // came from, so that when the user generates a video off of it we can link
  // the resulting video media to its source render via parent_id.
  const lastRenderMediaIdRef = useRef<string | null>(null);
  const saveMediaMutation = trpc.venueDesigns.saveMedia.useMutation({
    onSuccess: (created) => {
      if (created.type === "render") {
        lastRenderMediaIdRef.current = created.id;
        setActiveRenderMediaId(created.id);
        // If the email gate is waiting on a renderId (free-tier first
        // render that hasn't been persisted yet when the gate opened),
        // patch it in now so the magic-link redirect lands on the
        // correct reveal page.
        setPendingEmailGate((prev) =>
          prev && prev.renderId === null
            ? { ...prev, renderId: created.id }
            : prev,
        );
      }
      if (designId) {
        utils.venueDesigns.getById.invalidate({ id: designId });
      }
    },
  });
  const deleteMediaMutation = trpc.venueDesigns.deleteMedia.useMutation({
    onSuccess: () => {
      if (designId) {
        utils.venueDesigns.getById.invalidate({ id: designId });
      }
    },
  });

  // Past renders for this design, fetched once and kept fresh by invalidating
  // after each save/delete. TRPC + react-query dedupe with the parent query in
  // VenueDesigner so this is effectively free.
  // Polled while a render lost in transit may still land (react-query
  // skips the interval while the tab is hidden).
  const { data: design } = trpc.venueDesigns.getById.useQuery(
    { id: designId! },
    {
      enabled: !!designId,
      refetchInterval: recovery ? RENDER_RECOVERY_POLL_MS : false,
    }
  );
  const allMedia = useMemo(() => design?.media ?? [], [design?.media]);

  const flatRefs = useMemo(() => {
    const out: { url: string; category: ReferenceCategory }[] = [];
    for (const cat of REFERENCE_CATEGORIES) {
      for (const r of references[cat]) {
        out.push({ url: r.url, category: cat });
        if (out.length >= MAX_TOTAL_REFERENCES) return out;
      }
    }
    return out;
  }, [references]);

  const totalRefs = flatRefs.length;
  const canRender = totalRefs > 0 || venuePhoto !== null;

  const [pendingEmailGate, setPendingEmailGate] = useState<{
    renderId: string | null;
    designId: string | null;
  } | null>(null);

  // Turnstile bot-check token, only collected from anonymous visitors.
  // For paid users we don't render the widget, the server-side
  // verifier also short-circuits on `is_anonymous=false` so they never
  // see the captcha.
  const isAnon = useIsAnonymous();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);

  // Pack-tier gating for the "Make it alive" video CTA. Free pack
  // doesn't include video (server enforces via `packAllowsVideo` in
  // `ai.startVideo`); we mirror that on the button so users see a
  // disabled state instead of clicking through to a server error.
  // Anonymous visitors are implicitly on the free pack too.
  const { data: currentPack } = trpc.visionPacks.current.useQuery(undefined, {
    enabled: isAnon === false,
  });
  const onFreeTier = isAnon !== false || !currentPack || isFreePack(currentPack.sku);
  const videoAllowed = !onFreeTier && packAllowsVideo(currentPack?.sku ?? undefined);

  // Re-mount the email gate on refresh for anonymous visitors.
  //
  // When an anon user generates a render and refreshes (or follows the
  // URL back), local state is lost: `resultImage` resets to null and
  // `view` to "form", so the gate's mount condition
  // `(pendingEmailGate || (isAnon && resultImage)) && resultImage`
  // can't fire. The past-renders gallery, meanwhile, is hydrated from
  // `design.media` and would expose the (watermarked but still
  // viewable) thumbnails directly.
  //
  // Fix: as soon as we know the visitor is anonymous AND the design
  // has at least one render row, seed `resultImage` from the most
  // recent render and switch to the "image" view. The gate then
  // auto-overlays the watermarked preview, restoring the same shape
  // they saw before the refresh. Permanent users (paid or post-gate
  // free) skip this entirely.
  const latestRender = useMemo(
    () => allMedia.find((m) => m.type === "render") ?? null,
    [allMedia],
  );
  useEffect(() => {
    if (isAnon !== true) return;
    if (resultImage !== null) return;
    if (view !== "form") return;
    if (!latestRender) return;
    setResultImage(latestRender.url);
    setView("image");
    lastRenderMediaIdRef.current = latestRender.id;
    setActiveRenderMediaId(latestRender.id);
  }, [isAnon, latestRender, resultImage, view, setActiveRenderMediaId]);

  // The render the server just dressed, known from the response before the
  // design refetch brings its row (and meta) back. Only used to decide the
  // compare slider, so the slider is there the moment the render lands.
  const [justDressed, setJustDressed] = useState<LineageRow | null>(null);
  // Changes that landed (F2) before the design refetch brings their rows
  // back, so the new version is in the strip, and keeps its before/after
  // slider, the moment it arrives.
  const [pendingVersions, setPendingVersions] = useState<VersionMedia[]>([]);
  const versionMedia = useMemo(
    () => withPendingVersions<VersionMedia>(allMedia, pendingVersions),
    [allMedia, pendingVersions],
  );
  const versions = useMemo(
    () => buildRenderVersions(versionMedia),
    [versionMedia],
  );
  const lineageRows = useMemo<LineageRow[]>(() => {
    const rows: LineageRow[] = versionMedia
      .filter((m) => m.type === "render")
      .map((m) => ({
        id: m.id,
        parent_id: m.parent_id,
        mode: m.meta?.mode ?? null,
        venuePublicId: m.meta?.venuePublicId ?? null,
      }));
    if (justDressed && !rows.some((r) => r.id === justDressed.id)) {
      rows.push(justDressed);
    }
    return rows;
  }, [versionMedia, justDressed]);
  // The "before" for the render on screen, or null for the plain image.
  const beforePhoto = compareBeforePhoto(
    activeRenderMediaId,
    lineageRows,
    venuePhoto,
  );

  const renderMutation = trpc.ai.renderScene.useMutation({
    onSuccess: (data, variables) => {
      // Clear any banner left over from a previous failed attempt, the
      // form branch unmounts on success but the state outlives it.
      setRenderError(null);
      setRecovery(null);
      // The displayed URL is tier-aware: free tier sees the signed
      // watermarked transformation; paid tiers see the clean asset.
      setResultImage(data.imageUrl);
      setView("image");

      // The design the render was requested for. On a brand-new design
      // the `designId` prop may still be catching up with the save that
      // `handleRender` flushed, the request variables never are.
      const renderDesignId = variables.designId ?? designId ?? null;

      if (data.mediaId) {
        // The server wrote the media row itself, nothing left to save.
        lastRenderMediaIdRef.current = data.mediaId;
        setActiveRenderMediaId(data.mediaId);
        setJustDressed(
          data.mode === "dress_venue"
            ? {
                id: data.mediaId,
                parent_id: null,
                mode: "dress_venue",
                // The save flushed before the render carried this photo.
                venuePublicId: venuePhoto?.publicId ?? null,
              }
            : null,
        );
        if (renderDesignId) {
          utils.venueDesigns.getById.invalidate({ id: renderDesignId });
        }
      } else if (renderDesignId && data.cleanImageUrl) {
        // Fallback for a render the server could not attach (no design
        // id, or its insert failed): persist the **clean** URL so future
        // paid views render directly without the watermark
        // transformation, and the public_id so the URL stays derivable
        // after a tier change.
        saveMediaMutation.mutate({
          design_id: renderDesignId,
          type: "render",
          url: data.cleanImageUrl,
          cloudinary_public_id: data.publicId ?? null,
        });
      }

      // When the render came back watermarked, the visitor is on the
      // free tier, pop the email gate. The gate component overlays the
      // blurred preview and stays until they enter an email (which
      // sends the magic link + records the capture). On the fallback
      // path the renderId is patched in when saveMedia resolves.
      if (data.watermarked) {
        setPendingEmailGate({
          renderId: data.mediaId ?? null,
          designId: renderDesignId,
        });
      }

      // Refetch the recipient's pack so the quota badge in the header
      // re-renders with the decremented count without a full reload.
      utils.visionPacks.current.invalidate();
    },
    onError: (err, variables) => {
      // Turnstile tokens are single-use, even when the failure was on
      // a different layer, force a refresh so the next attempt has a
      // fresh challenge ready.
      setTurnstileToken(null);
      setTurnstileResetKey((k) => k + 1);
      // No answer is not a "no". A dress takes about a minute, and a phone
      // that switches apps mid-wait drops the request while the server
      // carries on, writes the row and spends the render. Refetch the
      // design and the pack so that render shows up (for an anonymous
      // visitor, the hydration effect above then mounts the email gate)
      // instead of a retry running into the paywall over a render they
      // already have. Without an answer at all, keep watching until it can
      // no longer land.
      const lostDesignId = variables.designId ?? designId ?? null;
      if (renderMayHaveLanded(err)) {
        if (lostDesignId) {
          utils.venueDesigns.getById.invalidate({ id: lostDesignId });
        }
        utils.visionPacks.current.invalidate();
      }
      if (renderOutcomeUnknown(err) && lostDesignId) {
        setRecovery({
          designId: lostDesignId,
          knownIds: knownRenderIdsRef.current,
          until: Date.now() + RENDER_RECOVERY_WINDOW_MS,
        });
        setRenderError(t("renderInterrupted"));
        toast.error(t("renderInterrupted"));
        return;
      }
      // The server's zero-input backstop: nothing to render from (no mood
      // reference and no venue photo it could use).
      if (err.message === "REFERENCES_REQUIRED") {
        setRenderError(t("needRefBeforeRender"));
        toast.error(t("needRefBeforeRender"));
        return;
      }
      // Pack-paywall errors (PACK_REQUIRED / PACK_QUOTA_RENDERS /
      // PACK_WINDOW_EXPIRED) pop the modal instead of toast-ing. Anything
      // else falls through to the existing render-failed toast.
      if (paywall.handleError(err)) return;
      // Never surface `err.message` here - it is a server-internal string.
      // During the dead-funnel window on Aug 25-26 this line would have shown
      // two real prospects `Image generation failed: 402 {"error":...}`, and
      // the bot-check branch shows them the raw reason code TURNSTILE_FAILED.
      // The rate limiter is the only failure with something worth telling the
      // visitor (come back later, not right now), so it gets its own key.
      //
      // The banner is set alongside the toast because a render takes ~24
      // seconds and sonner clears after four: on Aug 25 and 26 two real
      // prospects came back to a panel that looked exactly as it did before
      // they clicked, with no idea the attempt had died on an empty
      // OpenRouter balance. The CTA above is already the retry, it re-enables
      // the moment the mutation settles; what was missing was any sign that
      // pressing it again means "try that again".
      if (err.data?.code === "TOO_MANY_REQUESTS") {
        setRenderError(t("renderRateLimited"));
        toast.error(t("renderRateLimited"));
        return;
      }
      setRenderError(t("renderFailed"));
      toast.error(t("renderFailed"));
    },
  });

  // A render lost in transit turned up on the design: show it as if the
  // response had arrived. An anonymous visitor gets the email gate through
  // `isAnon && resultImage`, as after any refresh.
  const showLandedRender = useCallback(
    (landed: { id: string; url: string }) => {
      setRecovery(null);
      setRenderError(null);
      setResultImage(landed.url);
      setView("image");
      lastRenderMediaIdRef.current = landed.id;
      setActiveRenderMediaId(landed.id);
      utils.visionPacks.current.invalidate();
    },
    [setActiveRenderMediaId, utils],
  );

  useEffect(() => {
    if (!recovery || view !== "form") return;
    const landed = findLandedRender(allMedia, recovery.knownIds);
    if (landed) showLandedRender(landed);
  }, [recovery, allMedia, view, showLandedRender]);

  // Past the route's time limit nothing more can land: stop polling and
  // say plainly that it failed, so pressing Generate again reads as a retry.
  useEffect(() => {
    if (!recovery) return;
    const timer = setTimeout(
      () => {
        setRecovery(null);
        setRenderError(t("renderFailed"));
      },
      Math.max(0, recovery.until - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [recovery, t]);

  const videoMutation = trpc.ai.startVideo.useMutation({
    onSuccess: (data) => {
      setGenerationId(data.generationId);
      setView("video-pending");
      utils.visionPacks.current.invalidate();
    },
    onError: (err) => {
      if (paywall.handleError(err)) return;
      // Same reasoning as the render banner above: `err.message` comes off
      // the wire in English and is written for us, not for the visitor.
      // `videoFailed` is what the failed-poll branch below already shows.
      setVideoError(t("videoFailed"));
    },
  });

  useEffect(() => {
    if (view !== "video-pending" || !generationId) return;

    const poll = async () => {
      try {
        const status = await utils.ai.videoStatus.fetch({ generationId });
        if (status.state === "completed" && status.videoUrl) {
          setVideoUrl(status.videoUrl);
          setView("video");
          if (designId) {
            saveMediaMutation.mutate({
              design_id: designId,
              type: "video",
              url: status.videoUrl,
              parent_id: lastRenderMediaIdRef.current,
            });
          }
          if (pollRef.current) clearInterval(pollRef.current);
        } else if (status.state === "failed") {
          setVideoError(t("videoFailed"));
          setView("image");
          if (pollRef.current) clearInterval(pollRef.current);
        }
      } catch {
        // keep polling on transient errors
      }
    };

    poll();
    pollRef.current = setInterval(poll, 4000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, generationId]);

  const handleRender = useCallback(async () => {
    if (renderStartingRef.current || renderMutation.isPending) return;
    setRenderError(null);
    if (!canRender) {
      toast.error(t("needRefBeforeRender"));
      return;
    }
    renderStartingRef.current = true;
    setPreparingRender(true);
    try {
      // The last render died in transit: look before paying for another.
      // If the server finished it, that is the render they asked for.
      if (recovery) {
        const lost = recovery;
        setRecovery(null);
        try {
          const fresh = await utils.venueDesigns.getById.fetch(
            { id: lost.designId },
            { staleTime: 0 },
          );
          const landed = findLandedRender(fresh?.media ?? [], lost.knownIds);
          if (landed) {
            showLandedRender(landed);
            return;
          }
        } catch {
          // Still offline, most likely: the render below says so itself.
        }
      }
      // Flush the design first so the server can attach the render to it
      // (a new design gets its id from this very save). If the save fails
      // the render still goes ahead, with no design id: refusing a couple
      // their render over an autosave hiccup is worse than the old
      // client-side save path, which the server falls back to when it has
      // no design to write to. See `designIdForRender` for why the id we
      // already had is not sent instead. The exception is a venue render,
      // which only the saved design can carry (see `canSendRender`).
      let renderDesignId = designId ?? null;
      if (saveNow) {
        renderDesignId = await designIdForRender(saveNow);
      }
      if (!canSendRender(renderDesignId, venuePhoto !== null)) {
        setRenderError(t("venuePhoto.saveFailed"));
        toast.error(t("venuePhoto.saveFailed"));
        return;
      }
      knownRenderIdsRef.current = new Set(
        allMedia.filter((m) => m.type === "render").map((m) => m.id),
      );
      renderMutation.mutate({
        eventType,
        setting,
        size,
        guestCount: guestCount ?? null,
        palette,
        references: flatRefs,
        styleNotes: styleNotes.trim() || undefined,
        turnstileToken: turnstileToken ?? undefined,
        designId: renderDesignId,
      });
    } finally {
      setPreparingRender(false);
      renderStartingRef.current = false;
    }
  }, [
    renderMutation,
    eventType,
    setting,
    size,
    guestCount,
    palette,
    flatRefs,
    styleNotes,
    canRender,
    t,
    turnstileToken,
    designId,
    saveNow,
    venuePhoto,
    allMedia,
    recovery,
    utils,
    showLandedRender,
  ]);

  const handleMakeVideo = useCallback(() => {
    if (!resultImage) return;
    setVideoError(null);
    videoMutation.mutate({
      imageBase64: resultImage,
      context: {
        eventType,
        setting,
        size,
        guestCount: guestCount ?? null,
        palette,
        styleNotes: styleNotes.trim() || undefined,
      },
    });
  }, [
    resultImage,
    eventType,
    setting,
    size,
    guestCount,
    palette,
    styleNotes,
    videoMutation,
  ]);

  const handleReset = () => {
    setResultImage(null);
    setView("form");
    setGenerationId(null);
    setVideoUrl(null);
    setVideoError(null);
    setRenderError(null);
    renderMutation.reset();
    videoMutation.reset();
    if (pollRef.current) clearInterval(pollRef.current);
  };

  // Cloudinary is a different origin, and the HTML `download` attribute is
  // ignored on a cross-origin href - the click was just navigating the tab
  // to res.cloudinary.com, so the visitor lost the designer they had open
  // and the store state behind it. Fetch the bytes and hand the browser a
  // same-origin blob instead, the same shape LookbookDownloadButton uses
  // for the lookbook PDF.
  const handleDownloadImage = async () => {
    if (!resultImage) return;
    try {
      const res = await fetch(resultImage);
      if (!res.ok) throw new Error(String(res.status));
      const objectUrl = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = objectUrl;
      a.download = `venue-render-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      toast.error(t("downloadFailed"));
    }
  };

  const handleDownloadVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `venue-video-${Date.now()}.mp4`;
    a.target = "_blank";
    a.click();
  };

  const handleSelectPast = useCallback(
    (item: { id: string; type: string; url: string }) => {
      setVideoError(null);
      if (item.type === "video") {
        setVideoUrl(item.url);
        setResultImage(null);
        setView("video");
      } else {
        setResultImage(item.url);
        setVideoUrl(null);
        setView("image");
        lastRenderMediaIdRef.current = item.id;
        setActiveRenderMediaId(item.id);
      }
    },
    [setActiveRenderMediaId]
  );

  const handleDeletePast = useCallback(
    async (item: { id: string; url: string }) => {
      const ok = await confirm({
        title: t("deleteRenderConfirm"),
        description: tCommon("areYouSure"),
        confirmLabel: tCommon("delete"),
        destructive: true,
      });
      if (!ok) return;
      if (item.url === resultImage) setResultImage(null);
      if (item.url === videoUrl) setVideoUrl(null);
      if (item.url === resultImage || item.url === videoUrl) setView("form");
      if (item.id === activeRenderMediaId) setActiveRenderMediaId(null);
      setPendingVersions((prev) => prev.filter((m) => m.id !== item.id));
      deleteMediaMutation.mutate({ id: item.id });
    },
    [
      deleteMediaMutation,
      resultImage,
      videoUrl,
      t,
      tCommon,
      confirm,
      activeRenderMediaId,
      setActiveRenderMediaId,
    ]
  );

  // Videos keep the old grid below the panel. Renders, including every
  // talked change, are versions in the strip.
  const previousVideos = useMemo(
    () => allMedia.filter((m) => m.type === "video" && m.url !== videoUrl),
    [allMedia, videoUrl],
  );

  // --- F2: talking to the render ------------------------------------------

  // The change that just landed, so its confirmation shows before the
  // design refetch brings the row (and its stored confirmation) back, and
  // "Done" shows for a change whose confirmation the text model missed.
  const [lastRefine, setLastRefine] = useState<{
    mediaId: string;
    confirmation: string | null;
  } | null>(null);
  // Edits left as the last change reported them, until the pack refetch
  // says otherwise.
  const [editsLeftOverride, setEditsLeftOverride] = useState<number | null>(null);
  const packEditsLeft = currentPack?.edits_left;
  useEffect(() => {
    setEditsLeftOverride(null);
  }, [packEditsLeft]);
  const [refining, setRefining] = useState(false);

  const activeVersion = useMemo(
    () => versions.find((v) => v.id === activeRenderMediaId) ?? null,
    [versions, activeRenderMediaId],
  );
  const refineConfirmation =
    activeVersion?.confirmation ??
    (lastRefine && lastRefine.mediaId === activeRenderMediaId
      ? (lastRefine.confirmation ?? t("refine.done"))
      : null);
  // Counted out loud only on the free tier, where there are three.
  const editsLeft = onFreeTier
    ? (editsLeftOverride ?? packEditsLeft ?? null)
    : null;

  const handleRefined = useCallback(
    (result: RefineResult, instruction: string) => {
      setPendingVersions((prev) => [
        ...prev,
        {
          id: result.mediaId,
          type: "render",
          url: result.imageUrl,
          parent_id: result.parentId,
          created_at: new Date(),
          meta: {
            mode: "refine",
            instructionRaw: instruction,
            confirmation: result.confirmation,
            venuePublicId: null,
          },
        },
      ]);
      setLastRefine({ mediaId: result.mediaId, confirmation: result.confirmation });
      setEditsLeftOverride(result.editsLeft);
      setVideoError(null);
      setVideoUrl(null);
      setResultImage(result.imageUrl);
      setView("image");
      lastRenderMediaIdRef.current = result.mediaId;
      setActiveRenderMediaId(result.mediaId);
      if (designId) utils.venueDesigns.getById.invalidate({ id: designId });
      utils.visionPacks.current.invalidate();
    },
    [designId, setActiveRenderMediaId, utils],
  );

  // An anonymous couple who has not given their email yet: the server said
  // so, and the gate is where that happens.
  const handleRefineEmailRequired = useCallback(() => {
    setPendingEmailGate({
      renderId: activeRenderMediaId ?? lastRenderMediaIdRef.current,
      designId: designId ?? null,
    });
  }, [activeRenderMediaId, designId]);

  // The answer was lost, not the change: look for it on the design, and
  // recount the pack, so a change that landed turns up in the strip.
  const handleRefineOutcomeUnknown = useCallback(() => {
    if (designId) utils.venueDesigns.getById.invalidate({ id: designId });
    utils.visionPacks.current.invalidate();
  }, [designId, utils]);

  const handleSelectVersion = useCallback(
    (version: RenderVersion) =>
      handleSelectPast({ id: version.id, type: "render", url: version.url }),
    [handleSelectPast],
  );
  const handleDeleteVersion = useCallback(
    (version: RenderVersion) => handleDeletePast({ id: version.id, url: version.url }),
    [handleDeletePast],
  );
  // Deleting a version is a paid-pack affordance; the free taste keeps
  // everything it made.
  const canDeleteVersions = !onFreeTier;

  const summaryParts = REFERENCE_CATEGORIES.filter(
    (c) => references[c].length > 0
  ).map((c) => t(REF_SUMMARY_KEY[c], { count: references[c].length }));

  const sizeLabel = t(SIZE_KEY[size] ?? "sizeMedium").toLowerCase();
  const settingLabel = t(SETTING_KEY[setting] ?? "settingIndoor").toLowerCase();
  const eventTypeLabel = t(EVENT_TYPE_KEY[eventType] ?? "eventTypeWedding").toLowerCase();

  return (
    <Card className="border-rose-200 bg-gradient-to-br from-rose-50/40 via-background to-background">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-rose-500" />
          {t("aiRenderTitle")}
        </CardTitle>
        <CardDescription>{t("aiRenderDescription")}</CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {view === "form" && (
          <>
            <div className="rounded-lg border bg-background/60 p-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("selectionsSummary")}
              </p>
              <p className="mt-1.5 leading-relaxed">
                {t("summarySentence", {
                  size: sizeLabel,
                  setting: settingLabel,
                  eventType: eventTypeLabel,
                })}
                {palette.colors.length > 0 && (
                  <>
                    {" "}
                    {t("summaryWithPalette")}{" "}
                    <span className="inline-flex items-center gap-1 align-middle">
                      {palette.colors.slice(0, 6).map((c) => (
                        <span
                          key={c}
                          className="inline-block size-3 rounded-full ring-1 ring-foreground/10"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </span>
                  </>
                )}
                {summaryParts.length > 0 ? (
                  <>
                    {", "}
                    {t("summaryRefSuffix", {
                      parts: summaryParts.join(", "),
                      totalRefs,
                    })}
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {", "}
                    {venuePhoto
                      ? t("venuePhoto.summaryNoRefs")
                      : t("summaryNoRefs")}
                  </span>
                )}
              </p>
              {venuePhoto ? (
                <div
                  data-venue-photo-summary=""
                  className="mt-3 flex items-center gap-3 border-t border-border/60 pt-3"
                >
                  <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-md border bg-muted">
                    <MediaImage
                      src={venuePhoto.url}
                      alt={t("venuePhoto.thumbAlt")}
                      fill
                      sizes="thumb"
                    />
                  </div>
                  <p className="text-sm font-medium">
                    {t("venuePhoto.summaryDressing")}
                  </p>
                </div>
              ) : null}
            </div>

            {isAnon ? (
              <div className="flex justify-center">
                <Turnstile
                  onToken={setTurnstileToken}
                  resetKey={turnstileResetKey}
                />
              </div>
            ) : null}

            <Button
              size="lg"
              onClick={handleRender}
              disabled={renderMutation.isPending || preparingRender || !canRender}
              data-generate-render=""
              className="h-12 w-full gap-2 bg-rose-500 text-base text-white hover:bg-rose-600 sm:h-11 sm:text-sm"
            >
              {renderMutation.isPending || preparingRender ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {venuePhoto ? t("venuePhoto.rendering") : t("rendering")}
                </>
              ) : (
                <>
                  <Camera className="size-4" />
                  {t("generateRender")}
                </>
              )}
            </Button>
            {/*
              Failure sits directly under the button that caused it, so it
              reads as "that press died" rather than as a panel-level
              notice. `role="alert"` is load-bearing rather than decorative:
              the failure lands ~24 seconds after the click, long after
              focus and attention have wandered off the panel, so it has to
              be announced and not merely painted.
            */}
            {renderError && (
              <p role="alert" className="-mt-2 text-center text-xs text-destructive">
                {renderError}
              </p>
            )}
            {/*
              Timing hint sits beneath the CTA rather than inside the
              button label. Keeping it outside means the button stays
              short and tappable on phones (no two-line wrap), while the
              expectation-setting copy stays visible the whole time -
              before, during, and after the request - instead of only
              flashing in the loading state. Dressing a venue photo takes
              about a minute rather than half of one, and a couple told 30
              seconds leaves (or switches apps and drops the request) while
              the spinner still looks stuck.
            */}
            <p
              data-render-time-hint=""
              className="-mt-2 text-center text-xs text-muted-foreground"
            >
              {venuePhoto ? t("venuePhoto.renderTimeHint") : t("renderTimeHint")}
            </p>
          </>
        )}

        {/* Email gate enforcement:
            1. Fresh render → `renderMutation.onSuccess` sets `pendingEmailGate`.
            2. Anonymous visitor revisits the design (re-mount, back nav, or
               clicking a past render in the gallery) → `isAnon` is still true
               and `resultImage` is the watermarked URL, so we re-mount the
               gate. This is what stops the "approve & create event → back"
               bypass from leaking a render past the gate.
            For paid (and confirmed) users, neither flag fires, so the
            normal result card renders below. */}
        {(pendingEmailGate || (isAnon && resultImage)) && resultImage ? (
          <EmailGateOverlay
            watermarkedImageUrl={resultImage}
            renderId={pendingEmailGate?.renderId ?? lastRenderMediaIdRef.current}
            designId={pendingEmailGate?.designId ?? designId ?? null}
            onTryDifferentEmail={() => setPendingEmailGate(null)}
          />
        ) : (view === "image" ||
          view === "video-pending" ||
          view === "video") &&
          (resultImage || videoUrl) && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-lg border bg-muted">
                {view === "video" && videoUrl ? (
                  <video
                    key={videoUrl}
                    src={videoUrl}
                    poster={resultImage ?? undefined}
                    controls
                    autoPlay
                    loop
                    playsInline
                    className="h-auto w-full animate-in fade-in duration-500"
                  />
                ) : resultImage && view === "image" && beforePhoto ? (
                  // A dressed venue: their own photo and the render in one
                  // frame, the photo's proportions (the model kept them).
                  <CompareSlider
                    before={{ src: beforePhoto.url, alt: t("venuePhoto.thumbAlt") }}
                    after={{ src: resultImage, alt: t("renderedAlt") }}
                    width={beforePhoto.width}
                    height={beforePhoto.height}
                    sizes="half"
                    priority
                    beforeLabel={t("venuePhoto.compareBefore")}
                    afterLabel={t("venuePhoto.compareAfter")}
                    label={t("venuePhoto.compareLabel")}
                  />
                ) : resultImage ? (
                  <>
                    {/* Natural aspect, this is the render the visitor just
                        waited for, and cropping it would be absurd. */}
                    <MediaImage
                      src={resultImage}
                      alt={t("renderedAlt")}
                      width={1600}
                      height={900}
                      sizes="half"
                      priority
                      className="h-auto w-full object-contain"
                    />
                    {view === "video-pending" && (
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                    )}
                    {view === "video-pending" && (
                      <div className="pointer-events-none absolute bottom-3 start-3 end-3 flex items-center gap-2.5 rounded-lg bg-black/65 px-3 py-2 text-white shadow-lg backdrop-blur">
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                        <div className="min-w-0 flex-1 text-xs">
                          <p className="font-medium">
                            {t("videoPendingTitle")}
                          </p>
                          <p className="text-white/70">
                            {t("videoPendingHint")}
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
                {/* A change on its way: the version on screen stays put
                    under a quiet veil until the new one replaces it. The
                    words are for sighted couples; the box below announces
                    the same thing to screen readers. */}
                {refining && view === "image" ? (
                  <>
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                    <div
                      aria-hidden
                      data-refine-veil=""
                      className="pointer-events-none absolute bottom-3 start-3 end-3 flex items-center gap-2.5 rounded-lg bg-black/65 px-3 py-2 text-white shadow-lg backdrop-blur"
                    >
                      <Loader2 className="size-4 shrink-0 animate-spin motion-reduce:animate-none" />
                      <p className="min-w-0 flex-1 text-xs font-medium">
                        {t("refine.pending")}
                      </p>
                    </div>
                  </>
                ) : null}
              </div>

              {/* F2. The versions under the image they switch, then the box
                  that changes the one on screen. Only here, where the render
                  is visible: never behind the email gate. */}
              {view === "image" && versions.length > 1 ? (
                <VersionStrip
                  versions={versions}
                  activeId={activeRenderMediaId}
                  onSelect={handleSelectVersion}
                  onDelete={canDeleteVersions ? handleDeleteVersion : undefined}
                  deleting={deleteMediaMutation.isPending}
                />
              ) : null}
              {refineEnabled &&
              view === "image" &&
              resultImage &&
              activeRenderMediaId ? (
                <RefineBox
                  mediaId={activeRenderMediaId}
                  onRefined={handleRefined}
                  onEmailRequired={handleRefineEmailRequired}
                  onOutcomeUnknown={handleRefineOutcomeUnknown}
                  onPendingChange={setRefining}
                  confirmation={refineConfirmation}
                  editsLeft={editsLeft}
                  showAppliesTo={versions.length > 1}
                />
              ) : null}

              {videoError && (
                <p className="text-xs text-destructive">{videoError}</p>
              )}

              {/* Free-tier limits explainer. Sits above the action row so
                  the disabled "Generate again" / "Make it alive" buttons
                  read as intentional rather than broken. We can't rely on
                  `title` tooltips here, browsers swallow hover events on
                  disabled controls, and titles don't surface on touch
                  devices at all. */}
              {onFreeTier && (
                <p className="rounded-md border border-rose-200/70 bg-rose-50/60 px-3 py-2 text-xs leading-relaxed text-rose-800">
                  {t("freeTierActionsHint")}
                </p>
              )}

              {/*
                Action cluster after a render. We render the DOM in
                desktop-preferred order (Generate-again → Make-alive →
                Download). On phones we flip the container to
                `flex-col-reverse` so the primary CTA (Download) ends
                up at the top, closest to the thumb after scrolling
                in to look at the render, followed by Make-alive
                and finally the destructive "Generate again". This
                avoids any reliance on per-item `order-X` (which
                wouldn't make it through LockableAction's conditional
                wrapper when the action is locked).
              */}
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <LockableAction
                  locked={onFreeTier}
                  hint={t("generateAgainLockedHint")}
                  align="start"
                >
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    disabled={view === "video-pending" || onFreeTier}
                    aria-label={
                      onFreeTier ? t("generateAgainLockedHint") : undefined
                    }
                    className="h-11 w-full gap-2 sm:h-9 sm:w-auto sm:me-auto"
                  >
                    <RotateCcw className="size-4" />
                    {view === "video" ? t("startOver") : t("generateAgain")}
                  </Button>
                </LockableAction>

                {view !== "video" && (
                  <LockableAction
                    locked={!videoAllowed}
                    hint={t("makeAliveLockedHint")}
                    align="end"
                  >
                    <Button
                      variant="outline"
                      onClick={handleMakeVideo}
                      disabled={
                        videoMutation.isPending ||
                        view === "video-pending" ||
                        !videoAllowed
                      }
                      aria-label={
                        !videoAllowed ? t("makeAliveLockedHint") : undefined
                      }
                      className="h-11 w-full gap-2 sm:h-9 sm:w-auto"
                    >
                      {view === "video-pending" ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t("generatingDots")}
                        </>
                      ) : (
                        <>
                          <Video className="size-4" />
                          {t("makeAlive")}
                        </>
                      )}
                    </Button>
                  </LockableAction>
                )}

                {view === "video" && videoUrl ? (
                  <Button
                    onClick={handleDownloadVideo}
                    className="h-11 w-full gap-2 bg-rose-500 text-white hover:bg-rose-600 sm:h-9 sm:w-auto"
                  >
                    <Download className="size-4" />
                    {t("downloadVideo")}
                  </Button>
                ) : resultImage ? (
                  <Button
                    onClick={handleDownloadImage}
                    className="h-11 w-full gap-2 bg-rose-500 text-white hover:bg-rose-600 sm:h-9 sm:w-auto"
                  >
                    <Download className="size-4" />
                    {t("downloadShort")}
                  </Button>
                ) : null}
              </div>
            </div>
          )}

        {/* Past renders and videos are permanent-account chrome. Anonymous
            (email-gated) visitors don't get to browse, exposing
            thumbnails here would let them skip the gate by clicking
            an old render after a refresh. The auto-hydration effect
            above re-establishes the gate for them instead.

            Renders are versions (F2): outside the image view, where the
            strip sits under the image, they are here, so a couple coming
            back to the generate step can open any of them and keep
            changing it. */}
        {!isAnon && designId && view !== "image" && versions.length > 0 ? (
          <div className="border-t border-border/60 pt-5">
            <VersionStrip
              versions={versions}
              activeId={view === "form" ? null : activeRenderMediaId}
              onSelect={handleSelectVersion}
              onDelete={canDeleteVersions ? handleDeleteVersion : undefined}
              deleting={deleteMediaMutation.isPending}
            />
          </div>
        ) : null}
        {!isAnon && designId && previousVideos.length > 0 && (
          <section className="space-y-3 border-t border-border/60 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-eyebrow font-medium text-muted-foreground">
                {t("versions.videosTitle", { count: previousVideos.length })}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("clickToViewHover")}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {previousVideos.map((item) => (
                <div
                  key={item.id}
                  className="group relative aspect-video overflow-hidden rounded-xl bg-muted/40 ring-1 ring-foreground/[0.06] transition-all hover:ring-2 hover:ring-rose-300"
                >
                  <button
                    type="button"
                    onClick={() => handleSelectPast(item)}
                    className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
                    aria-label={t("viewMediaAria", {
                      type: item.type,
                      when: f.relativeTime(new Date(item.created_at)),
                    })}
                  >
                    <video
                      src={item.url}
                      muted
                      preload="metadata"
                      playsInline
                      className="h-full w-full object-cover"
                      onMouseEnter={(e) => {
                        e.currentTarget.play().catch(() => {});
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.pause();
                        e.currentTarget.currentTime = 0;
                      }}
                    />
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <span className="absolute bottom-1.5 start-1.5 rounded-md bg-black/0 px-1.5 py-0.5 text-xs font-medium text-white opacity-0 transition-all group-hover:bg-black/65 group-hover:opacity-100">
                      {f.relativeTime(new Date(item.created_at))}
                    </span>
                    <span className="absolute top-1.5 start-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-medium text-white">
                      <Video className="size-2.5" />
                      {t("badgeVideo")}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePast(item);
                    }}
                    disabled={deleteMediaMutation.isPending}
                    aria-label={t("deleteRenderAria")}
                    className="absolute end-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/60 text-white opacity-100 backdrop-blur-sm transition-opacity hover:bg-black/85 disabled:opacity-40 md:size-6 md:opacity-0 md:group-hover:opacity-100"
                  >
                    <X className="size-3.5 md:size-3" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

