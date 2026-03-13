"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Camera, Loader2, Download, RotateCcw, Video } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { getCaptureWideshot } from "../canvas/VenueCanvas";

interface RenderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function buildSceneDescription(
  items: { type: string; color?: string; variant?: string }[]
): string {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const label = item.variant ? `${item.variant} ${item.type}` : item.type;
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([type, count]) => `${count} ${type.replace(/_/g, " ")}${count > 1 ? "s" : ""}`)
    .join(", ");
}

type View = "form" | "image" | "video-pending" | "video";

export function RenderDialog({ open, onOpenChange }: RenderDialogProps) {
  const [extraNotes, setExtraNotes] = useState("");
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [view, setView] = useState<View>("form");
  const [generationId, setGenerationId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const items = useVenueDesignerStore((s) => s.items);
  const venue = useVenueDesignerStore((s) => s.venue);
  const utils = trpc.useUtils();

  const renderMutation = trpc.ai.renderScene.useMutation({
    onSuccess: (data) => {
      setResultImage(data.imageUrl);
      setView("image");
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
  }, [view, generationId, utils.ai.videoStatus]);

  const handleRender = useCallback(async () => {
    const captureWideshot = getCaptureWideshot();
    const screenshot = captureWideshot ? await captureWideshot() : null;
    if (!screenshot) return;

    const link = document.createElement("a");
    link.href = screenshot;
    link.download = `venue-debug-input-${Date.now()}.png`;
    link.click();

    const description = venue.floorType;

    renderMutation.mutate({ screenshot, description });
  }, [items, venue, extraNotes, renderMutation]);

  const handleMakeVideo = useCallback(() => {
    if (!resultImage) return;
    setVideoError(null);
    videoMutation.mutate({
      imageBase64: resultImage,
      prompt: extraNotes || "Elegant event venue walkthrough",
    });
  }, [resultImage, extraNotes, videoMutation]);

  const handleDownloadImage = useCallback(() => {
    if (!resultImage) return;
    const a = document.createElement("a");
    a.href = resultImage;
    a.download = `venue-render-${Date.now()}.png`;
    a.click();
  }, [resultImage]);

  const handleDownloadVideo = useCallback(() => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = `venue-video-${Date.now()}.mp4`;
    a.target = "_blank";
    a.click();
  }, [videoUrl]);

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

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) handleReset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-rose-500" />
            Realistic Render
          </DialogTitle>
          <DialogDescription>
            Transform your 3D layout into a photorealistic image or video.
          </DialogDescription>
        </DialogHeader>

        {view === "video" && videoUrl ? (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden border bg-black">
              <video
                src={videoUrl}
                controls
                autoPlay
                loop
                className="w-full h-auto"
              />
            </div>
            <DialogFooter className="flex-row gap-2 sm:justify-between">
              <Button variant="outline" onClick={handleReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Start Over
              </Button>
              <Button onClick={handleDownloadVideo} className="gap-2 bg-rose-500 hover:bg-rose-600 text-white">
                <Download className="h-4 w-4" />
                Download Video
              </Button>
            </DialogFooter>
          </div>
        ) : view === "video-pending" ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="relative">
              <Video className="h-12 w-12 text-rose-400 animate-pulse" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Generating video...</p>
              <p className="text-xs text-muted-foreground">
                This usually takes 30-60 seconds. You can wait here.
              </p>
            </div>
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : view === "image" && resultImage ? (
          <div className="space-y-3">
            <div className="relative rounded-lg overflow-hidden border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resultImage}
                alt="AI rendered venue"
                className="w-full h-auto"
              />
            </div>
            {videoError && (
              <p className="text-xs text-destructive">{videoError}</p>
            )}
            <DialogFooter className="flex-row gap-2 sm:justify-between">
              <Button variant="outline" onClick={handleReset} className="gap-2">
                <RotateCcw className="h-4 w-4" />
                Generate Again
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleMakeVideo}
                  disabled={videoMutation.isPending}
                  className="gap-2"
                >
                  {videoMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Video className="h-4 w-4" />
                  )}
                  Make it Alive
                </Button>
                <Button onClick={handleDownloadImage} className="gap-2 bg-rose-500 hover:bg-rose-600 text-white">
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground mb-1 font-medium">
                  Scene summary
                </p>
                <p className="text-sm">
                  {buildSceneDescription(items) || "Empty scene"} in a{" "}
                  {venue.floorType} venue
                </p>
              </div>

              <Textarea
                placeholder="Optional: add details about style, mood, lighting, season (e.g. 'warm sunset lighting, romantic atmosphere, lots of greenery')"
                value={extraNotes}
                onChange={(e) => setExtraNotes(e.target.value)}
                className="min-h-20 resize-none"
                disabled={renderMutation.isPending}
              />

              {renderMutation.isError && (
                <p className="text-xs text-destructive">
                  {renderMutation.error.message || "Rendering failed. Please try again."}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={renderMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRender}
                disabled={items.length === 0 || renderMutation.isPending}
                className="gap-2 bg-rose-500 hover:bg-rose-600 text-white"
              >
                {renderMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Rendering...
                  </>
                ) : (
                  <>
                    <Camera className="h-4 w-4" />
                    Render
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
