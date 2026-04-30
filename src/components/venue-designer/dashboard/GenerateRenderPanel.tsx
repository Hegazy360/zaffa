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
} from "lucide-react";
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
  const saveMediaMutation = trpc.venueDesigns.saveMedia.useMutation();

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

        {view === "image" && resultImage && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultImage}
                alt="AI rendered venue"
                className="h-auto w-full"
              />
            </div>
            {videoError && (
              <p className="text-xs text-destructive">{videoError}</p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                className="gap-2"
              >
                <RotateCcw className="size-4" />
                Generate again
              </Button>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={handleMakeVideo}
                  disabled={videoMutation.isPending}
                  className="gap-2"
                >
                  {videoMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Video className="size-4" />
                  )}
                  Make it Alive
                </Button>
                <Button
                  onClick={handleDownloadImage}
                  className="gap-2 bg-rose-500 text-white hover:bg-rose-600"
                >
                  <Download className="size-4" />
                  Download
                </Button>
              </div>
            </div>
          </div>
        )}

        {view === "video-pending" && (
          <div className="flex flex-col items-center justify-center gap-3 py-12">
            <Video className="size-10 animate-pulse text-rose-400" />
            <div className="text-center">
              <p className="text-sm font-medium">Generating video...</p>
              <p className="text-xs text-muted-foreground">
                This usually takes 30-60 seconds.
              </p>
            </div>
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {view === "video" && videoUrl && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-lg border bg-black">
              <video
                src={videoUrl}
                controls
                autoPlay
                loop
                className="h-auto w-full"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                className="gap-2"
              >
                <RotateCcw className="size-4" />
                Start over
              </Button>
              <Button
                onClick={handleDownloadVideo}
                className="ml-auto gap-2 bg-rose-500 text-white hover:bg-rose-600"
              >
                <Download className="size-4" />
                Download video
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
