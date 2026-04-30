"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Loader2,
  Upload,
  Check,
  Search,
  ExternalLink,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import {
  MAX_REFERENCES_PER_CATEGORY,
  MAX_TOTAL_REFERENCES,
  REFERENCE_CATEGORY_LABELS,
  type Ref,
  type ReferenceCategory,
  type EventType,
  type Setting,
} from "@/types/venue-designer";
import type { AddReferenceResult } from "@/stores/venue-designer-store";
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

const CATEGORY_QUERY_TEMPLATE: Record<ReferenceCategory, string> = {
  overall_vibe: "venue inspiration moodboard",
  tables: "table setting tablescape",
  flowers: "florals centerpiece tablescape",
  lighting: "reception lighting ambiance",
  venue_decor: "venue decor backdrop",
};

const SETTING_HINT: Record<Setting, string> = {
  indoor: "ballroom",
  outdoor: "garden",
  tent: "tent",
};

function buildDefaultQuery(
  category: ReferenceCategory,
  eventType: EventType,
  setting: Setting,
  styleNotes?: string
): string {
  const parts = [
    eventType,
    SETTING_HINT[setting],
    CATEGORY_QUERY_TEMPLATE[category],
  ];
  if (styleNotes) {
    const trimmed = styleNotes.trim().slice(0, 40);
    if (trimmed) parts.unshift(trimmed);
  }
  return parts.join(" ");
}

export function ReferencePickerDialog({
  open,
  onOpenChange,
  category,
}: ReferencePickerDialogProps) {
  const refs = useVenueDesignerStore((s) => s.references[category]);
  const eventType = useVenueDesignerStore((s) => s.eventType);
  const setting = useVenueDesignerStore((s) => s.setting);
  const styleNotes = useVenueDesignerStore((s) => s.styleNotes);
  const addReference = useVenueDesignerStore((s) => s.addReference);
  const removeReference = useVenueDesignerStore((s) => s.removeReference);
  const totalRefs = useVenueDesignerStore((s) => s.totalReferences());

  const reportAddFailure = useCallback(
    (result: Extract<AddReferenceResult, { ok: false }>) => {
      switch (result.reason) {
        case "category_full":
          toast.error(
            `You can pick up to ${MAX_REFERENCES_PER_CATEGORY} references per category.`
          );
          break;
        case "total_full":
          toast.error(
            `You've reached the total of ${MAX_TOTAL_REFERENCES} references across all categories. Remove one to add another.`
          );
          break;
        case "duplicate":
          break;
      }
    },
    []
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const inspirationQuery = trpc.inspiration.byCategory.useQuery(
    { category },
    { enabled: open }
  );
  const uploadMutation = trpc.venueDesigns.uploadReference.useMutation();
  const rehostMutation = trpc.venueDesigns.rehostUrl.useMutation();

  const defaultQuery = useMemo(
    () => buildDefaultQuery(category, eventType, setting, styleNotes),
    [category, eventType, setting, styleNotes]
  );

  const [searchInput, setSearchInput] = useState(defaultQuery);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [pinterestRehostingId, setPinterestRehostingId] = useState<string | null>(
    null
  );

  useEffect(() => {
    if (open) {
      setSearchInput(defaultQuery);
      setActiveQuery(null);
    }
  }, [open, defaultQuery]);

  const pinterestQuery = trpc.inspiration.searchPinterest.useQuery(
    { query: activeQuery ?? "", pageSize: 30 },
    { enabled: open && !!activeQuery && activeQuery.length >= 2 }
  );

  const remainingInCategory = MAX_REFERENCES_PER_CATEGORY - refs.length;
  const remainingTotal = MAX_TOTAL_REFERENCES - totalRefs;
  const remaining = Math.max(0, Math.min(remainingInCategory, remainingTotal));

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
      const result = addReference(category, ref);
      if (!result.ok) reportAddFailure(result);
    },
    [addReference, removeReference, category, refs, reportAddFailure]
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
        const upload = await uploadMutation.mutateAsync({ dataUrl });
        const ref: Ref = {
          id: `upload:${upload.publicId}`,
          url: upload.url,
          source: "upload",
          sourceId: upload.publicId,
        };
        const result = addReference(category, ref);
        if (!result.ok) reportAddFailure(result);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Upload failed. Please try again."
        );
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [addReference, category, refs.length, uploadMutation, reportAddFailure]
  );

  const handlePinterestPick = useCallback(
    async (pin: {
      id: string;
      imageUrl: string;
      thumbnailUrl: string;
      description: string;
      pinUrl: string;
      pinner?: { username: string };
    }) => {
      const refId = `pinterest:${pin.id}`;
      if (refs.some((r) => r.id === refId)) {
        removeReference(category, refId);
        return;
      }
      if (refs.length >= MAX_REFERENCES_PER_CATEGORY) {
        toast.error(
          `You can pick up to ${MAX_REFERENCES_PER_CATEGORY} references per category.`
        );
        return;
      }
      try {
        setPinterestRehostingId(pin.id);
        const upload = await rehostMutation.mutateAsync({ url: pin.imageUrl });
        const ref: Ref = {
          id: refId,
          url: upload.url,
          thumbnailUrl: pin.thumbnailUrl,
          source: "pinterest",
          sourceId: pin.id,
          sourceUrl: pin.pinUrl,
          attribution: pin.pinner?.username
            ? `via @${pin.pinner.username} on Pinterest`
            : "via Pinterest",
        };
        const result = addReference(category, ref);
        if (!result.ok) reportAddFailure(result);
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "Could not add this Pinterest image."
        );
      } finally {
        setPinterestRehostingId(null);
      }
    },
    [addReference, removeReference, rehostMutation, category, refs, reportAddFailure]
  );

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    if (trimmed.length < 2) return;
    setActiveQuery(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {REFERENCE_CATEGORY_LABELS[category]} references
          </DialogTitle>
          <DialogDescription>
            Pick up to {MAX_REFERENCES_PER_CATEGORY} per category and{" "}
            {MAX_TOTAL_REFERENCES} overall. {refs.length}/
            {MAX_REFERENCES_PER_CATEGORY} in this category &middot; {totalRefs}/
            {MAX_TOTAL_REFERENCES} total.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="pinterest">
          <TabsList>
            <TabsTrigger value="pinterest">Search Pinterest</TabsTrigger>
            <TabsTrigger value="browse">Browse curated</TabsTrigger>
            <TabsTrigger value="upload">Upload your own</TabsTrigger>
          </TabsList>

          <TabsContent value="pinterest" className="mt-4 space-y-3">
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="e.g. boho wedding florals tablescape"
                  className="pl-9"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                disabled={searchInput.trim().length < 2}
                className="bg-rose-500 text-white hover:bg-rose-600"
              >
                Search
              </Button>
            </form>

            {!activeQuery ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                <Search className="mb-2 size-6" />
                <p>
                  Search Pinterest for{" "}
                  <span className="font-medium text-foreground">
                    {REFERENCE_CATEGORY_LABELS[category].toLowerCase()}
                  </span>{" "}
                  inspiration.
                </p>
                <p className="mt-1 text-xs">
                  We&apos;ve pre-filled a query based on your event &mdash;
                  refine it and hit Search.
                </p>
              </div>
            ) : pinterestQuery.isLoading ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Searching Pinterest&hellip;
              </div>
            ) : pinterestQuery.isError ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-sm text-destructive">
                <p>{pinterestQuery.error.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Make sure the Pinterest worker is deployed and{" "}
                  <code className="rounded bg-muted px-1">
                    PINTEREST_PROXY_URL
                  </code>{" "}
                  /{" "}
                  <code className="rounded bg-muted px-1">
                    PINTEREST_PROXY_SECRET
                  </code>{" "}
                  are set.
                </p>
              </div>
            ) : !pinterestQuery.data?.results.length ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                No pins for &ldquo;{activeQuery}&rdquo;. Try a different query.
              </div>
            ) : (
              <div className="grid max-h-[58vh] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 md:grid-cols-4">
                {pinterestQuery.data.results.map((pin) => {
                  const refId = `pinterest:${pin.id}`;
                  const selected = refs.some((r) => r.id === refId);
                  const disabled = !selected && remaining <= 0;
                  const rehosting = pinterestRehostingId === pin.id;
                  return (
                    <div key={pin.id} className="relative">
                      <button
                        type="button"
                        onClick={() => handlePinterestPick(pin)}
                        disabled={disabled || rehosting}
                        className={cn(
                          "group relative aspect-square w-full overflow-hidden rounded-lg border ring-offset-background transition-all",
                          selected
                            ? "border-rose-500 ring-2 ring-rose-400"
                            : "border-input hover:border-foreground/30",
                          (disabled || rehosting) && "opacity-50"
                        )}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pin.thumbnailUrl}
                          alt={pin.description || "Pinterest pin"}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                        />
                        {selected && (
                          <div className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-rose-500 text-white shadow">
                            <Check className="size-3.5" />
                          </div>
                        )}
                        {rehosting && (
                          <div className="absolute inset-0 grid place-items-center bg-background/70">
                            <Loader2 className="size-5 animate-spin text-rose-500" />
                          </div>
                        )}
                      </button>
                      <a
                        href={pin.pinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                        title="Open on Pinterest"
                      >
                        <ExternalLink className="size-2.5" />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

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
                  const selected = refs.some((r) => r.id === refId);
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
