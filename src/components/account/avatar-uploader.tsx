"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { MediaImage } from "@/components/ui/media-image";

interface AvatarUploaderProps {
  /** Current avatar URL (or null for the placeholder). */
  currentUrl: string | null;
  /** Display name used as fallback initial when no avatar is set. */
  displayName: string;
  /** Called after a successful upload with the new Cloudinary URL. */
  onUploaded?: (url: string) => void;
}

/**
 * Drop-in avatar control. Renders the current avatar (or initials), and
 * a "Change" button that uploads a chosen file to /api/upload/avatar.
 * The endpoint validates the user, transforms the image, and persists the
 * resulting URL on the profile — this component just refreshes the
 * profile cache after success.
 */
export function AvatarUploader({
  currentUrl,
  displayName,
  onUploaded,
}: AvatarUploaderProps) {
  const t = useTranslations("account");
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload/avatar", {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        const code = data.error ?? "upload_failed";
        // Cast to never since the message catalog enumerates allowed
        // sub-keys; upstream codes that drift out of sync fall through to
        // the generic upload_failed copy.
        const key = `uploadError.${code}`;
        try {
          toast.error(t(key as never));
        } catch {
          toast.error(t("uploadError.upload_failed" as never));
        }
        return;
      }
      const json = (await res.json()) as { url: string };
      toast.success(t("uploadSuccess"));
      onUploaded?.(json.url);
      utils.profile.me.invalidate();
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex items-center gap-4">
      {currentUrl ? (
        <MediaImage
          src={currentUrl}
          alt={displayName}
          width={64}
          height={64}
          sizes="thumb"
          className="size-16 rounded-full ring-1 ring-rose-200/60"
        />
      ) : (
        <div className="grid size-16 place-items-center rounded-full bg-gradient-to-br from-rose-200 to-amber-200 text-xl font-semibold text-rose-800">
          {displayName.trim().charAt(0).toUpperCase() || "?"}
        </div>
      )}
      <div className="flex flex-col items-start gap-1">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="gap-1.5"
        >
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Upload className="size-3.5" />
          )}
          {t("changeAvatar")}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("avatarHint")}
        </p>
      </div>
    </div>
  );
}
