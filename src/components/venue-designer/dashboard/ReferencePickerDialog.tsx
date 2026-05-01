"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
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

const CATEGORY_LABEL_KEY: Record<ReferenceCategory, string> = {
  overall_vibe: "categoryOverallVibe",
  tables: "categoryTables",
  flowers: "categoryFlowers",
  lighting: "categoryLighting",
  venue_decor: "categoryVenueDecor",
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
  const t = useTranslations("designer");
  const refs = useVenueDesignerStore((s) => s.references[category]);
  const eventType = useVenueDesignerStore((s) => s.eventType);
  const setting = useVenueDesignerStore((s) => s.setting);
  const styleNotes = useVenueDesignerStore((s) => s.styleNotes);
  const addReference = useVenueDesignerStore((s) => s.addReference);
  const removeReference = useVenueDesignerStore((s) => s.removeReference);
  const totalRefs = useVenueDesignerStore((s) => s.totalReferences());

  const categoryLabel = t(CATEGORY_LABEL_KEY[category]);

  const reportAddFailure = useCallback(
    (result: Extract<AddReferenceResult, { ok: false }>) => {
      switch (result.reason) {
        case "category_full":
          toast.error(
            t("refsCategoryFull", { max: MAX_REFERENCES_PER_CATEGORY })
          );
          break;
        case "total_full":
          toast.error(t("refsTotalFull", { max: MAX_TOTAL_REFERENCES }));
          break;
        case "duplicate":
          break;
      }
    },
    [t]
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
          t("refsCategoryAlreadyMax", { max: MAX_REFERENCES_PER_CATEGORY })
        );
        return;
      }
      const file = files[0];
      if (!file.type.startsWith("image/")) {
        toast.error(t("uploadImageOnly"));
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
        toast.error(err instanceof Error ? err.message : t("uploadFailed"));
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [addReference, category, refs.length, uploadMutation, reportAddFailure, t]
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
          t("refsCategoryFull", { max: MAX_REFERENCES_PER_CATEGORY })
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
            ? t("pinterestViaUser", { username: pin.pinner.username })
            : t("pinterestVia"),
        };
        const result = addReference(category, ref);
        if (!result.ok) reportAddFailure(result);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : t("pinterestAddFailed")
        );
      } finally {
        setPinterestRehostingId(null);
      }
    },
    [addReference, removeReference, rehostMutation, category, refs, reportAddFailure, t]
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
            {t("categoryReferencesTitle", { category: categoryLabel })}
          </DialogTitle>
          <DialogDescription>
            {t("referencesPickerDesc", {
              perCategory: MAX_REFERENCES_PER_CATEGORY,
              total: MAX_TOTAL_REFERENCES,
              usedCat: refs.length,
              maxCat: MAX_REFERENCES_PER_CATEGORY,
              usedTotal: totalRefs,
              maxTotal: MAX_TOTAL_REFERENCES,
            })}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="pinterest">
          <TabsList>
            <TabsTrigger value="pinterest">{t("tabPinterest")}</TabsTrigger>
            <TabsTrigger value="browse">{t("tabBrowse")}</TabsTrigger>
            <TabsTrigger value="upload">{t("tabUpload")}</TabsTrigger>
          </TabsList>

          <TabsContent value="pinterest" className="mt-4 space-y-3">
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t("pinterestPlaceholder")}
                  className="ps-9"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                disabled={searchInput.trim().length < 2}
                className="bg-rose-500 text-white hover:bg-rose-600"
              >
                {t("searchAction")}
              </Button>
            </form>

            {!activeQuery ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                <Search className="mb-2 size-6" />
                <p>
                  {t("pinterestPromptLine", {
                    category: categoryLabel.toLowerCase(),
                  })}
                </p>
                <p className="mt-1 text-xs">{t("pinterestPromptHint")}</p>
              </div>
            ) : pinterestQuery.isLoading ? (
              <div className="flex h-64 items-center justify-center text-muted-foreground">
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t("searchingPinterest")}
              </div>
            ) : pinterestQuery.isError ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-sm text-destructive">
                <p>{pinterestQuery.error.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("pinterestErrorHintBefore")}{" "}
                  <code className="rounded bg-muted px-1">
                    PINTEREST_PROXY_URL
                  </code>{" "}
                  {t("pinterestErrorHintAnd")}{" "}
                  <code className="rounded bg-muted px-1">
                    PINTEREST_PROXY_SECRET
                  </code>{" "}
                  {t("pinterestErrorHintAfter")}
                </p>
              </div>
            ) : !pinterestQuery.data?.results.length ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                {t("noPinsForQuery", { query: activeQuery })}
              </div>
            ) : (
              <div className="grid max-h-[58vh] grid-cols-2 gap-3 overflow-y-auto pe-1 sm:grid-cols-3 md:grid-cols-4">
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
                          alt={pin.description || t("pinAlt")}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                        />
                        {selected && (
                          <div className="absolute end-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-rose-500 text-white shadow">
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
                        className="absolute bottom-1 end-1 inline-flex items-center gap-0.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition-opacity hover:bg-black/80 group-hover:opacity-100"
                        title={t("openOnPinterest")}
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
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t("loadingInspiration")}
              </div>
            ) : !inspirationQuery.data || inspirationQuery.data.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center text-center text-sm text-muted-foreground">
                <p>{t("noInspirationTitle")}</p>
                <p className="mt-1 text-xs">
                  {t("noInspirationHintBefore")}{" "}
                  <code className="rounded bg-muted px-1">npm run db:seed-images</code>{" "}
                  {t("noInspirationHintAfter")}
                </p>
              </div>
            ) : (
              <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto pe-1 sm:grid-cols-3 md:grid-cols-4">
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
                        <div className="absolute end-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-rose-500 text-white shadow">
                          <Check className="size-3.5" />
                        </div>
                      )}
                      {item.subcategory && (
                        <div className="absolute bottom-0 start-0 end-0 truncate bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-start text-[10px] capitalize text-white">
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
              <p className="text-sm font-medium">{t("uploadInspirationTitle")}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("uploadInspirationDesc")}
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
                    {t("uploadingDots")}
                  </>
                ) : (
                  <>
                    <Upload className="size-3.5" />
                    {t("chooseImage")}
                  </>
                )}
              </Button>
              {remaining <= 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("removeRefToUpload")}
                </p>
              )}
            </div>

            {refs.filter((r) => r.source === "upload").length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("yourUploadsLabel")}
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
                          alt={t("uploadedRefAlt")}
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeReference(category, r.id)}
                          className="absolute end-1.5 top-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white"
                        >
                          {t("removeShort")}
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
