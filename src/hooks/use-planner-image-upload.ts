"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB cap to keep tRPC payloads sane

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

// Single-shot file upload helper for planner pages. Returns the resulting
// secure URL on success; surfaces a toast and returns null on failure so
// callers can stay terse. Mirrors `useVendorImageUpload`.
export function usePlannerImageUpload() {
  const [isUploading, setIsUploading] = useState(false);
  const upload = trpc.planner.uploadImage.useMutation();

  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      if (!file.type.startsWith("image/")) {
        toast.error("Please choose an image file.");
        return null;
      }
      if (file.size > MAX_BYTES) {
        toast.error(
          `Image is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max 8MB.`,
        );
        return null;
      }
      setIsUploading(true);
      try {
        const dataUrl = await fileToDataUrl(file);
        const result = await upload.mutateAsync({ dataUrl });
        return result.url;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Upload failed. Try again.",
        );
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [upload],
  );

  return { uploadFile, isUploading };
}
