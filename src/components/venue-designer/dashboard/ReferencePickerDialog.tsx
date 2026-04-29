"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, Check } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import {
  MAX_REFERENCES_PER_CATEGORY,
  REFERENCE_CATEGORY_LABELS,
  type Ref,
  type ReferenceCategory,
} from "@/types/venue-designer";
import { cn } from "@/lib/utils";

interface ReferencePickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: ReferenceCategory;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

export function ReferencePickerDialog({
  open,
  onOpenChange,
  category,
}: ReferencePickerDialogProps) {
  const refs = useVenueDesignerStore((s) => s.references[category]);
  const addReference = useVenueDesignerStore((s) => s.addReference);
  const removeReference = useVenueDesignerStore((s) => s.removeReference);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const inspirationQuery = trpc.inspiration.byCategory.useQuery(
    { category },
    { enabled: open }
  );
  const uploadMutation = trpc.venueDesigns.uploadReference.useMutation();

  const isSelected = (id: string) => refs.some((r) => r.id === id);
  const remaining = MAX_REFERENCES_PER_CATEGORY - refs.length;

  const toggleInspiration = useCallback(
    (item: {
      id: string;
      image_url: string;
      thumbnail_url: string;
      alt_text: string;
    }) => {
      const refId = `inspiration:${item.id}`;
      if (refs.some((r) => r.id === refId)) {
        removeReference(category, refId);
        return;
      }
      const ref: Ref = {
        id: refId,
        url: item.image_url,
        thumbnailUrl: item.thumbnail_url,
        source: "inspiration",
        sourceId: item.id,
      };
      const ok = addReference(category, ref);
      if (!ok) {
        toast.error(
          `You can pick up to ${MAX_REFERENCES_PER_CATEGORY} references per category.`
        );
      }
    },
    [addReference, removeReference, category, refs]
  );

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      if (refs.length >= MAX_REFERENCES_PER_CATEGORY) {
        toast.error(
          `You already have the max ${MAX_REFERENCES_PER_CATEGORY} references for this category.`
        );
        return;
      }
      const file = files[0];
      if (!file.type.startsWith("image/")) {
        toast.error("Please upload an image file.");
        return;
      }
      try {
        setUploading(true);
        const dataUrl = await fileToDataUrl(file);
        const result = await uploadMutation.mutateAsync({ dataUrl });
        const ref: Ref = {
          id: `upload:${result.publicId}`,
          url: result.url,
          source: "upload",
          sourceId: result.publicId,
        };
        const ok = addReference(category, ref);
        if (!ok) {
          toast.error("Could not add reference.");
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Upload failed. Please try again."
        );
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [addReference, category, refs.length, uploadMutation]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {REFERENCE_CATEGORY_LABELS[category]} references
          </DialogTitle>
          <DialogDescription>
            Pick up to {MAX_REFERENCES_PER_CATEGORY} images that capture the
            look you want. {refs.length}/{MAX_REFERENCES_PER_CATEGORY} selected.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="browse">
          <TabsList>
            <TabsTrigger value="browse">Browse curated</TabsTrigger>
            <TabsTrigger value="upload">Upload your own</TabsTrigger>
          </TabsList>

          <TabsContent value="browse" className="mt-4">
            {inspirationQuery.isLoading ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading inspiration...
              </div>
            ) : !inspirationQuery.data || inspirationQuery.data.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                <p>No inspiration images yet for this category.</p>
                <p className="mt-1 text-xs">
                  Run <code className="rounded bg-muted px-1">npm run db:seed-images</code>{" "}
                  to populate the gallery, or upload your own.
                </p>
              </div>
            ) : (
              <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
                {inspirationQuery.data.map((item) => {
                  const refId = `inspiration:${item.id}`;
                  const selected = isSelected(refId);
                  const disabled = !selected && remaining <= 0;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => toggleInspiration(item)}
                      disabled={disabled}
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-lg border ring-offset-background transition-all",
                        selected
                          ? "border-rose-500 ring-2 ring-rose-400"
                          : "border-input hover:border-foreground/30",
                        disabled && "opacity-40"
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={item.thumbnail_url}
                        alt={item.alt_text}
                        className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                      />
                      {selected && (
                        <div className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-rose-500 text-white shadow">
                          <Check className="size-3.5" />
                        </div>
                      )}
                      {item.subcategory && (
                        <div className="absolute bottom-0 left-0 right-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-left text-[10px] capitalize text-white">
                          {item.subcategory.replace(/_/g, " ")}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <div className="rounded-lg border border-dashed p-6 text-center">
              <Upload className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="text-sm font-medium">Upload an inspiration photo</p>
              <p className="mt-1 text-xs text-muted-foreground">
                JPG or PNG up to ~10MB. Personal Pinterest finds, mood boards,
                or shots from past events all work.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="mt-4 gap-1.5"
                disabled={uploading || remaining <= 0}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="size-3.5" />
                    Choose image
                  </>
                )}
              </Button>
              {remaining <= 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Remove a reference above to upload another.
                </p>
              )}
            </div>

            {refs.filter((r) => r.source === "upload").length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Your uploads in this category
                </p>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {refs
                    .filter((r) => r.source === "upload")
                    .map((r) => (
                      <div
                        key={r.id}
                        className="relative aspect-square overflow-hidden rounded-lg border ring-2 ring-rose-400"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={r.url}
                          alt="Uploaded reference"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeReference(category, r.id)}
                          className="absolute right-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
