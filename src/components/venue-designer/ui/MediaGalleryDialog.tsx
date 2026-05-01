"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Image as ImageIcon,
  Video,
  Download,
  Trash2,
  Loader2,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useFormatters } from "@/lib/use-formatters";

interface MediaGalleryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  designId: string;
}

type MediaItem = {
  id: string;
  type: string;
  url: string;
  created_at: string | Date;
};

export function MediaGalleryDialog({
  open,
  onOpenChange,
  designId,
}: MediaGalleryDialogProps) {
  const t = useTranslations("designer");
  const f = useFormatters();
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [filter, setFilter] = useState<"all" | "render" | "video">("all");

  const { data: design, isLoading } = trpc.venueDesigns.getById.useQuery(
    { id: designId },
    { enabled: open && !!designId }
  );

  const utils = trpc.useUtils();
  const deleteMutation = trpc.venueDesigns.deleteMedia.useMutation({
    onSuccess: () => {
      utils.venueDesigns.getById.invalidate({ id: designId });
      setSelected(null);
    },
  });

  const media = (design?.media ?? []).filter(
    (m) => filter === "all" || m.type === filter
  );

  const renderCount = design?.media?.filter((m) => m.type === "render").length ?? 0;
  const videoCount = design?.media?.filter((m) => m.type === "video").length ?? 0;

  const handleDelete = (id: string) => {
    if (window.confirm(t("deleteMediaConfirm"))) {
      deleteMutation.mutate({ id });
    }
  };

  const handleDownload = (item: MediaItem) => {
    const a = document.createElement("a");
    a.href = item.url;
    a.download = `venue-${item.type}-${Date.now()}.${item.type === "video" ? "mp4" : "png"}`;
    if (item.type === "video") a.target = "_blank";
    a.click();
  };

  const filterLabel = (f: "all" | "render" | "video") =>
    f === "all"
      ? t("filterAll")
      : f === "render"
        ? t("filterImages")
        : t("filterVideos");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-rose-500" />
            {t("mediaGalleryTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("mediaGalleryDesc", { renderCount, videoCount })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5 mb-2">
          {(["all", "render", "video"] as const).map((fv) => (
            <Button
              key={fv}
              variant={filter === fv ? "default" : "outline"}
              size="sm"
              className={`h-7 text-xs ${filter === fv ? "bg-rose-500 hover:bg-rose-600 text-white" : ""}`}
              onClick={() => setFilter(fv)}
            >
              {fv === "render" && <ImageIcon className="h-3 w-3 me-1" />}
              {fv === "video" && <Video className="h-3 w-3 me-1" />}
              {filterLabel(fv)}
            </Button>
          ))}
        </div>

        {selected ? (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setSelected(null)}
              >
                <X className="h-3 w-3" />
                {t("backToGallery")}
              </Button>
              <div className="flex gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => handleDownload(selected)}
                >
                  <Download className="h-3 w-3" />
                  {t("downloadAction")}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(selected.id)}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Trash2 className="h-3 w-3" />
                  )}
                  {t("deleteAction")}
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 rounded-lg overflow-hidden border bg-black flex items-center justify-center">
              {selected.type === "video" ? (
                <video
                  src={selected.url}
                  controls
                  autoPlay
                  loop
                  className="max-w-full max-h-[55vh] object-contain"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.url}
                  alt={t("renderedVenueAlt")}
                  className="max-w-full max-h-[55vh] object-contain"
                />
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              {selected.type === "render"
                ? t("imageGenerated", {
                    when: f.relativeTime(new Date(selected.created_at)),
                  })
                : t("videoGenerated", {
                    when: f.relativeTime(new Date(selected.created_at)),
                  })}
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
          </div>
        ) : media.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="rounded-full bg-muted p-4 mb-3">
              <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
            </div>
            <p className="text-sm font-medium">{t("noMediaTitle")}</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              {t("noMediaBody")}
            </p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {media.map((item) => (
                <div
                  key={item.id}
                  className="group relative rounded-lg border overflow-hidden cursor-pointer hover:ring-2 hover:ring-rose-300 transition-all"
                  onClick={() => setSelected(item)}
                >
                  <div className="aspect-video bg-muted relative">
                    {item.type === "video" ? (
                      <video
                        src={item.url}
                        muted
                        className="w-full h-full object-cover"
                        onMouseEnter={(e) => e.currentTarget.play()}
                        onMouseLeave={(e) => {
                          e.currentTarget.pause();
                          e.currentTarget.currentTime = 0;
                        }}
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.url}
                        alt={t("renderedVenueAlt")}
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute top-1.5 start-1.5">
                      <span className="inline-flex items-center gap-1 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {item.type === "video" ? (
                          <Video className="h-2.5 w-2.5" />
                        ) : (
                          <ImageIcon className="h-2.5 w-2.5" />
                        )}
                        {item.type === "video" ? t("badgeVideo") : t("badgeImage")}
                      </span>
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                  </div>
                  <div className="px-2 py-1.5">
                    <p className="text-[10px] text-muted-foreground">
                      {f.relativeTime(new Date(item.created_at))}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
