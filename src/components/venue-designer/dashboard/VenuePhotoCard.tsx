"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Camera, Loader2, MapPin, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MediaImage } from "@/components/ui/media-image";
import { trpc } from "@/lib/trpc";
import { downscaleToJpeg, ImageDecodeError } from "@/lib/downscale-image";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { useDesignerFlag } from "@/components/venue-designer/designer-flags-provider";

/**
 * "Your venue" (F1): the couple's own photo of the hall or garden they
 * booked, which the render then dresses instead of imagining a room.
 *
 * One button opens the system picker. No `capture` attribute on purpose:
 * with it, phones jump straight to the camera, and most couples already
 * have the photo in their library from the venue visit. The photo is
 * downscaled here (see `downscaleToJpeg`) before it is uploaded, and it
 * joins the design through the store, so the next save (the autosave, or
 * the flush before a render) attaches it.
 *
 * The upload's analytics event fires on the server, once per upload, so
 * nothing is tracked here.
 */
export function VenuePhotoCard() {
  const t = useTranslations("designer");
  const enabled = useDesignerFlag("venuePhoto");
  const venuePhoto = useVenueDesignerStore((s) => s.venuePhoto);
  const setVenuePhoto = useVenueDesignerStore((s) => s.setVenuePhoto);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = trpc.venueDesigns.uploadVenuePhoto.useMutation();

  if (!enabled) return null;

  const busy = preparing || upload.isPending;

  const pick = () => {
    setError(null);
    inputRef.current?.click();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.type && !file.type.startsWith("image/")) {
      setError(t("venuePhoto.errorNotImage"));
      return;
    }
    setPreparing(true);
    try {
      let dataUrl: string;
      try {
        ({ dataUrl } = await downscaleToJpeg(file));
      } catch (err) {
        if (err instanceof ImageDecodeError) {
          setError(t("venuePhoto.errorDecode"));
          return;
        }
        throw err;
      }
      setPreparing(false);
      const photo = await upload.mutateAsync({ dataUrl });
      setVenuePhoto(photo);
    } catch (err) {
      const code = (err as { data?: { code?: string } } | null)?.data?.code;
      setError(
        code === "TOO_MANY_REQUESTS"
          ? t("venuePhoto.errorRateLimited")
          : t("venuePhoto.errorUpload"),
      );
    } finally {
      setPreparing(false);
    }
  };

  return (
    <section
      aria-labelledby="venue-photo-title"
      data-venue-photo-card=""
      className="space-y-3 rounded-lg border border-dashed border-rose-300/80 bg-rose-50/40 p-3 sm:p-4"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-rose-600 ring-1 ring-rose-200">
          <MapPin className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 space-y-0.5">
          <h3 id="venue-photo-title" className="text-sm font-medium">
            {t("venuePhoto.title")}
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t("venuePhoto.hint")}
          </p>
        </div>
      </div>

      {venuePhoto ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md border bg-muted sm:w-52">
            <MediaImage
              src={venuePhoto.url}
              alt={t("venuePhoto.thumbAlt")}
              fill
              sizes="card"
            />
            {busy ? (
              <div className="absolute inset-0 grid place-items-center bg-white/60">
                <Loader2 className="size-5 animate-spin text-rose-600" aria-hidden />
              </div>
            ) : null}
          </div>
          <div className="flex gap-2 sm:flex-col">
            <Button
              type="button"
              variant="outline"
              onClick={pick}
              disabled={busy}
              className="h-11 flex-1 gap-2 sm:h-9 sm:flex-none"
            >
              <RefreshCw className="size-4" aria-hidden />
              {t("venuePhoto.replace")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setError(null);
                setVenuePhoto(null);
              }}
              disabled={busy}
              data-venue-photo-remove=""
              className="h-11 flex-1 gap-2 text-destructive hover:text-destructive sm:h-9 sm:flex-none"
            >
              <Trash2 className="size-4" aria-hidden />
              {t("venuePhoto.remove")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={pick}
          disabled={busy}
          className="h-11 w-full gap-2 border-rose-300 bg-white sm:w-auto"
        >
          {busy ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Camera className="size-4" aria-hidden />
          )}
          {busy ? t("venuePhoto.uploading") : t("venuePhoto.add")}
        </Button>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        {t("venuePhoto.tip")}
      </p>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        data-venue-photo-input=""
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Cleared so picking the same file again still fires a change.
          e.target.value = "";
          void handleFile(file);
        }}
      />
    </section>
  );
}
