"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
  Image as ImageIcon,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { trpc } from "@/lib/trpc";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import {
  MAX_TOTAL_REFERENCES,
  REFERENCE_CATEGORIES,
  type ReferenceCategory,
} from "@/types/venue-designer";

interface GenerateRenderPanelProps {
  designId?: string;
}

type View = "form" | "image" | "video-pending" | "video";

export function GenerateRenderPanel({ designId }: GenerateRenderPanelProps) {
  const eventType = useVenueDesignerStore((s) => s.eventType);
  const setting = useVenueDesignerStore((s) => s.setting);
  const size = useVenueDesignerStore((s) => s.size);
  const palette = useVenueDesignerStore((s) => s.palette);
  const references = useVenueDesignerStore((s) => s.references);
  const styleNotes = useVenueDesignerStore((s) => s.styleNotes ?? "");

  const [resultImage, setResultImage] = useState<string | null>(null);
  const [view, setView] = useState<View>("form");
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
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

  // Past renders for this design — fetched once and kept fresh by invalidating
  // after each save/delete. TRPC + react-query dedupe with the parent query in
  // VenueDesigner so this is effectively free.
  const { data: design } = trpc.venueDesigns.getById.useQuery(
    { id: designId! },
    { enabled: !!designId }
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

  const renderMutation = trpc.ai.renderScene.useMutation({
    onSuccess: (data) => {
      setResultImage(data.imageUrl);
      setView("image");
      if (designId && data.imageUrl) {
        saveMediaMutation.mutate({
          design_id: designId,
          type: "render",
          url: data.imageUrl,
        });
      }
    },
    onError: (err) => {
      toast.error(err.message || "Render failed. Please try again.");
    },
  });

  const videoMutation = trpc.ai.startVideo.useMutation({
    onSuccess: (data) => {
      setGenerationId(data.generationId);
      setView("video-pending");
    },
    onError: (err) => {
      setVideoError(err.message);
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
          setVideoError("Video generation failed. Please try again.");
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

  const handleRender = useCallback(() => {
    if (totalRefs === 0) {
      toast.error("Add at least one inspiration reference before rendering.");
      return;
    }
    renderMutation.mutate({
      eventType,
      setting,
      size,
      palette,
      references: flatRefs,
      styleNotes: styleNotes.trim() || undefined,
    });
  }, [
    renderMutation,
    eventType,
    setting,
    size,
    palette,
    flatRefs,
    styleNotes,
    totalRefs,
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
        palette,
        styleNotes: styleNotes.trim() || undefined,
      },
    });
  }, [
    resultImage,
    eventType,
    setting,
    size,
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
    renderMutation.reset();
    videoMutation.reset();
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const handleDownloadImage = () => {
    if (!resultImage) return;
    const a = document.createElement("a");
    a.href = resultImage;
    a.download = `venue-render-${Date.now()}.png`;
    a.click();
  };

  const handleDownloadVideo = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `venue-video-${Date.now()}.mp4`;
    a.target = "_blank";
    a.click();
  };

  // Load a past render/video back into the result viewport. We always clear
  // the "other" field so exactly one of resultImage/videoUrl is set at a time
  // — that keeps the strip's filter accurate (only one item is hidden).
  const handleSelectPast = useCallback(
    (item: { id: string; type: string; url: string }) => {
      setVideoError(null);
      if (item.type === "video") {
        setVideoUrl(item.url);
        setResultImage(null);
        setView("video");
        // Don't touch lastRenderMediaIdRef — we want the source render link
        // to remain whatever it was before the user opened this video.
      } else {
        setResultImage(item.url);
        setVideoUrl(null);
        setView("image");
        // Switching to a past render makes that render the new "current" one
        // for any video the user generates next.
        lastRenderMediaIdRef.current = item.id;
      }
    },
    []
  );

  const handleDeletePast = useCallback(
    (item: { id: string; url: string }) => {
      if (!window.confirm("Delete this render? This cannot be undone.")) return;
      // If we're currently viewing the deleted item, drop it from the viewport.
      if (item.url === resultImage) setResultImage(null);
      if (item.url === videoUrl) setVideoUrl(null);
      if (item.url === resultImage || item.url === videoUrl) setView("form");
      deleteMediaMutation.mutate({ id: item.id });
    },
    [deleteMediaMutation, resultImage, videoUrl]
  );

  // Items shown in the "Previous renders" strip — exclude whatever is
  // currently in the result viewport so we don't double-show it.
  const previousMedia = useMemo(() => {
    const excluded = new Set<string>(
      [resultImage, videoUrl].filter((u): u is string => !!u)
    );
    return allMedia.filter((m) => !excluded.has(m.url));
  }, [allMedia, resultImage, videoUrl]);

  const summaryParts = REFERENCE_CATEGORIES.filter(
    (c) => references[c].length > 0
  ).map(
    (c) =>
      `${references[c].length} ${c.replace(/_/g, " ")}${
        references[c].length === 1 ? "" : "s"
      }`
  );

  return (
    <Card className="border-rose-200 bg-gradient-to-br from-rose-50/40 via-background to-background">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-rose-500" />
          AI render
        </CardTitle>
        <CardDescription>
          When you&apos;re happy with your selections, generate a single
          photoreal image of your venue.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {view === "form" && (
          <>
            <div className="rounded-lg border bg-background/60 p-3 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Selections summary
              </p>
              <p className="mt-1.5 leading-relaxed">
                A <span className="font-medium">{size}</span>{" "}
                <span className="font-medium">{setting}</span>{" "}
                <span className="font-medium">{eventType}</span>
                {palette.colors.length > 0 && (
                  <>
                    {" "}with palette{" "}
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
                    {" — "}
                    {summaryParts.join(", ")} reference
                    {totalRefs === 1 ? "" : "s"}.
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    {" "}
                    — no references yet. Add a few above.
                  </span>
                )}
              </p>
            </div>

            <Button
              size="lg"
              onClick={handleRender}
              disabled={renderMutation.isPending || totalRefs === 0}
              className="w-full gap-2 bg-rose-500 text-white hover:bg-rose-600"
            >
              {renderMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Rendering... this can take ~30 seconds
                </>
              ) : (
                <>
                  <Camera className="size-4" />
                  Generate render
                </>
              )}
            </Button>
          </>
        )}

        {(view === "image" ||
          view === "video-pending" ||
          view === "video") &&
          (resultImage || videoUrl) && (
            <div className="space-y-3">
              <div className="relative overflow-hidden rounded-lg border bg-muted">
                {/* The rendered image is the poster: it stays visible while the
                    video is generating, and remains as the <video> poster so
                    the swap to playback is seamless. */}
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
                ) : resultImage ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={resultImage}
                      alt="AI rendered venue"
                      className="h-auto w-full"
                    />
                    {view === "video-pending" && (
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
                    )}
                    {view === "video-pending" && (
                      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-center gap-2.5 rounded-lg bg-black/65 px-3 py-2 text-white shadow-lg backdrop-blur">
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                        <div className="min-w-0 flex-1 text-xs">
                          <p className="font-medium">
                            Bringing your venue to life&hellip;
                          </p>
                          <p className="text-white/70">
                            Usually 30&ndash;60 seconds. Your render is safe.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}
              </div>

              {videoError && (
                <p className="text-xs text-destructive">{videoError}</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  onClick={handleReset}
                  disabled={view === "video-pending"}
                  className="gap-2"
                >
                  <RotateCcw className="size-4" />
                  {view === "video" ? "Start over" : "Generate again"}
                </Button>

                <div className="ml-auto flex flex-wrap gap-2">
                  {view !== "video" && (
                    <Button
                      variant="outline"
                      onClick={handleMakeVideo}
                      disabled={
                        videoMutation.isPending || view === "video-pending"
                      }
                      className="gap-2"
                    >
                      {view === "video-pending" ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Generating&hellip;
                        </>
                      ) : (
                        <>
                          <Video className="size-4" />
                          Make it Alive
                        </>
                      )}
                    </Button>
                  )}

                  {view === "video" && videoUrl ? (
                    <Button
                      onClick={handleDownloadVideo}
                      className="gap-2 bg-rose-500 text-white hover:bg-rose-600"
                    >
                      <Download className="size-4" />
                      Download video
                    </Button>
                  ) : resultImage ? (
                    <Button
                      onClick={handleDownloadImage}
                      className="gap-2 bg-rose-500 text-white hover:bg-rose-600"
                    >
                      <Download className="size-4" />
                      Download
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          )}

        {designId && previousMedia.length > 0 && (
          <section className="space-y-3 border-t border-border/60 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Previous renders ({previousMedia.length})
              </h3>
              <p className="text-xs text-muted-foreground">
                Click to view · Hover to delete
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {previousMedia.map((item) => (
                <div
                  key={item.id}
                  className="group relative aspect-video overflow-hidden rounded-xl bg-muted/40 ring-1 ring-foreground/[0.06] transition-all hover:ring-2 hover:ring-rose-300"
                >
                  <button
                    type="button"
                    onClick={() => handleSelectPast(item)}
                    className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
                    aria-label={`View ${item.type === "video" ? "video" : "render"} from ${formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}`}
                  >
                    {item.type === "video" ? (
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
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt="Past render"
                        className="h-full w-full object-cover"
                      />
                    )}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/0 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/0 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 transition-all group-hover:bg-black/65 group-hover:opacity-100">
                      {formatDistanceToNow(new Date(item.created_at), {
                        addSuffix: true,
                      })}
                    </span>
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {item.type === "video" ? (
                        <Video className="size-2.5" />
                      ) : (
                        <ImageIcon className="size-2.5" />
                      )}
                      {item.type === "video" ? "Video" : "Image"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePast(item);
                    }}
                    disabled={deleteMediaMutation.isPending}
                    aria-label="Delete this render"
                    className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/85 group-hover:opacity-100 disabled:opacity-40"
                  >
                    <X className="size-3" />
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
