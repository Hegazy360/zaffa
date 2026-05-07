"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

interface Props {
  packId: string;
  variant?: "default" | "outline";
  size?: "sm" | "default" | "lg";
  fullWidth?: boolean;
  /** Hide the helper line (used in compact contexts). */
  hideHint?: boolean;
}

/**
 * Download the recipient's lookbook PDF. The endpoint streams the file
 * back and stamps `lookbook_downloaded_at` server-side on first download
 * (the refund tripwire). We use a real anchor click instead of a fetch
 * so the browser handles the file save dialog natively.
 */
export function LookbookDownloadButton({
  packId,
  variant = "outline",
  size = "default",
  fullWidth = false,
  hideHint = false,
}: Props) {
  const t = useTranslations("visionPack");
  const utils = trpc.useUtils();
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    setPending(true);
    try {
      const res = await fetch(`/api/vision-pack/${packId}/lookbook`, {
        method: "GET",
      });
      if (!res.ok) {
        toast.error(t("checkoutFailed"));
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const cd = res.headers.get("content-disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(cd);
      a.href = objectUrl;
      a.download = match?.[1] ?? "wedding-vision-lookbook.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
      // Refresh the pack so the tripwire flag (and any UI affordance
      // gated on it) updates without a full reload.
      utils.visionPacks.current.invalidate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("checkoutFailed"));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={fullWidth ? "w-full" : undefined}>
      <Button
        type="button"
        size={size}
        variant={variant === "outline" ? "outline" : "default"}
        disabled={pending}
        onClick={handleClick}
        className={`gap-2 ${fullWidth ? "w-full" : ""}`}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <FileDown className="size-4" />
        )}
        {pending ? t("lookbookDownloading") : t("lookbookDownload")}
      </Button>
      {!hideHint && (
        <p className="mt-2 text-[11px] text-muted-foreground/85">
          {t("lookbookDownloadHint")}
        </p>
      )}
    </div>
  );
}
