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
  X,
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

// One strong noun per category — these read well on Pinterest and avoid
// the redundancy of the previous templates ("table setting tablescape",
// "florals centerpiece tablescape"). Order in the final query is:
//   `<style notes> <setting> <event> <category>`
// e.g. "Romantic Garden Wedding Tablescape".
const CATEGORY_QUERY_TERM: Record<ReferenceCategory, string> = {
  overall_vibe: "inspiration",
  tables: "tablescape",
  flowers: "centerpieces",
  lighting: "lighting",
  venue_decor: "decor",
};

const SETTING_HINT: Record<Setting, string> = {
  indoor: "ballroom",
  outdoor: "garden",
  tent: "tent",
};

// "other" intentionally maps to an empty string so generic events read
// as e.g. "Garden Decor" rather than the awkward "Garden Other Decor".
const EVENT_TYPE_LABEL: Record<EventType, string> = {
  wedding: "wedding",
  engagement: "engagement",
  birthday: "birthday",
  corporate: "corporate",
  other: "",
};

const CATEGORY_LABEL_KEY: Record<ReferenceCategory, string> = {
  overall_vibe: "categoryOverallVibe",
  tables: "categoryTables",
  flowers: "categoryFlowers",
  lighting: "categoryLighting",
  venue_decor: "categoryVenueDecor",
};

// Plain title case — capitalize every whitespace-separated word. Good
// enough for our 3–5 word search queries; we don't bother with the
// "of/and/the" lowercase rules a copywriter would use.
function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function buildDefaultQuery(
  category: ReferenceCategory,
  eventType: EventType,
  setting: Setting,
  styleNotes?: string,
): string {
  const parts: string[] = [];
  const trimmedNotes = styleNotes?.trim().slice(0, 40);
  if (trimmedNotes) parts.push(trimmedNotes);
  parts.push(SETTING_HINT[setting]);
  const eventLabel = EVENT_TYPE_LABEL[eventType];
  if (eventLabel) parts.push(eventLabel);
  parts.push(CATEGORY_QUERY_TERM[category]);
  return toTitleCase(parts.filter(Boolean).join(" "));
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
      {/*
        Mobile-first sizing. On phones (<sm) we go full-bleed — the
        dialog occupies the entire dynamic viewport, drops its rounded
        corners and ring, and behaves like a native sheet so users get
        the maximum tap area for the inspiration grid and don't fight
        the on-screen keyboard for vertical space. From `sm` upward we
        revert to the centered card with the original max-width and
        2rem viewport gutter.
      */}
      <DialogContent
        className={cn(
          "p-0 gap-0 flex flex-col overflow-hidden",
          // Mobile: full-screen sheet. `inset-0` + `translate-none`
          // overrides the base dialog's `top-1/2 start-1/2 -translate-*`
          // centering so the popup snaps to the viewport edges without
          // sub-pixel offsets. We also strip the rounded corners and
          // ring so it reads as a native sheet on small screens.
          "inset-0 max-w-full w-screen h-[100dvh] max-h-[100dvh] translate-x-0 translate-y-0 rounded-none ring-0",
          // Desktop: back to the centered card.
          "sm:inset-auto sm:top-1/2 sm:start-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-3xl sm:w-full sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl sm:ring-1 sm:ring-foreground/10",
        )}
      >
        <DialogHeader className="shrink-0 border-b border-border/60 px-4 pt-4 pb-3 pe-12 sm:border-b-0 sm:px-6 sm:pt-6 sm:pe-6">
          <DialogTitle className="text-base sm:text-base">
            {t("categoryReferencesTitle", { category: categoryLabel })}
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
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

        <Tabs
          defaultValue="pinterest"
          className="flex flex-1 min-h-0 min-w-0 flex-col gap-0 px-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6 sm:pb-6"
        >
          {/*
            `w-full` overrides the default `w-fit` so the list never
            tries to size to content (which is what was bleeding past
            the dialog on narrow viewports). On mobile we also stick
            the tab list to the top of the scroll area so it stays
            reachable while the user browses long grids. `h-10` on
            phones bumps each tab past the 44px tap-target floor.
          */}
          <TabsList className="sticky top-0 z-10 mt-3 h-11 w-full max-w-full shrink-0 overflow-x-auto bg-background sm:static sm:h-9">
            <TabsTrigger value="pinterest" className="h-9 px-3 text-xs sm:h-7 sm:text-sm">
              {t("tabPinterest")}
            </TabsTrigger>
            <TabsTrigger value="browse" className="h-9 px-3 text-xs sm:h-7 sm:text-sm">
              {t("tabBrowse")}
            </TabsTrigger>
            <TabsTrigger value="upload" className="h-9 px-3 text-xs sm:h-7 sm:text-sm">
              {t("tabUpload")}
            </TabsTrigger>
          </TabsList>

          {/*
            Each panel takes the remaining height in the Tabs flex
            column and scrolls vertically. The grids below already had
            their own `max-h-[..vh]` clamps; with the panel itself
            bounded by the dialog's height we don't strictly need them,
            but leaving them in place keeps the desktop look intact.
          */}
          <TabsContent
            value="pinterest"
            className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto"
          >
            {/*
              Sticky search row so the query stays reachable while
              browsing long Pinterest result grids on a phone. We
              intentionally don't `autoFocus` the input — on mobile
              that would slam the soft keyboard up before the user has
              even seen the pre-filled query, which is the most useful
              thing about this surface.
            */}
            {/*
              On phones the input + submit don't fit comfortably side by
              side once the placeholder grows past a few words, so we
              stack them: full-width input on top, full-width button
              underneath. From `sm` upward we go back to the original
              inline row.
            */}
            <form
              onSubmit={handleSearchSubmit}
              className="sticky top-0 z-[5] -mx-0.5 flex flex-col gap-2 bg-background pb-2 pt-1 sm:flex-row"
            >
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder={t("pinterestPlaceholder")}
                  className="h-11 ps-9 sm:h-9"
                />
              </div>
              <Button
                type="submit"
                disabled={searchInput.trim().length < 2}
                className="h-11 w-full shrink-0 bg-rose-500 text-white hover:bg-rose-600 sm:h-9 sm:w-auto"
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
              <div className="grid grid-cols-2 gap-3 pe-1 sm:grid-cols-3 md:grid-cols-4">
                {pinterestQuery.data.results.map((pin) => {
                  const refId = `pinterest:${pin.id}`;
                  const selected = refs.some((r) => r.id === refId);
                  const disabled = !selected && remaining <= 0;
                  const rehosting = pinterestRehostingId === pin.id;
                  return (
                    <div key={pin.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => handlePinterestPick(pin)}
                        disabled={disabled || rehosting}
                        className={cn(
                          "relative block aspect-square w-full overflow-hidden rounded-lg border ring-offset-background transition-all",
                          selected
                            ? "border-rose-500 ring-2 ring-rose-400"
                            : "border-input hover:border-foreground/30",
                          (disabled || rehosting) && "opacity-50"
                        )}
                        aria-pressed={selected}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={pin.thumbnailUrl}
                          alt={pin.description || t("pinAlt")}
                          loading="lazy"
                          className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                        />
                        {selected && (
                          <div className="absolute end-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-rose-500 text-white shadow sm:size-6">
                            <Check className="size-4 sm:size-3.5" />
                          </div>
                        )}
                        {rehosting && (
                          <div className="absolute inset-0 grid place-items-center bg-background/70">
                            <Loader2 className="size-5 animate-spin text-rose-500" />
                          </div>
                        )}
                      </button>
                      {/*
                        "Open on Pinterest" affordance. On desktop it's
                        still a hover-only mini badge; on touch devices
                        we can't rely on hover, so we render a larger
                        always-visible tap target in the bottom corner
                        (44px square, with a transparent pad behind the
                        glyph) that sits on top of the select button so
                        it remains clickable.
                      */}
                      <a
                        href={pin.pinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "absolute bottom-1 end-1 inline-flex items-center gap-0.5 rounded bg-black/65 text-white",
                          "size-8 justify-center sm:size-auto sm:px-1.5 sm:py-0.5",
                          "sm:opacity-0 sm:transition-opacity sm:hover:bg-black/80 sm:group-hover:opacity-100",
                        )}
                        title={t("openOnPinterest")}
                        aria-label={t("openOnPinterest")}
                      >
                        <ExternalLink className="size-3.5 sm:size-2.5" />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent
            value="browse"
            className="mt-3 min-h-0 flex-1 overflow-y-auto"
          >
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
              <div className="grid grid-cols-2 gap-3 pe-1 sm:grid-cols-3 md:grid-cols-4">
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
                      aria-pressed={selected}
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
                        <div className="absolute end-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-rose-500 text-white shadow sm:size-6">
                          <Check className="size-4 sm:size-3.5" />
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

          <TabsContent
            value="upload"
            className="mt-3 min-h-0 flex-1 overflow-y-auto"
          >
            <div className="rounded-lg border border-dashed p-5 text-center sm:p-6">
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
                size="lg"
                className="mt-4 h-11 w-full gap-1.5 sm:h-9 sm:w-auto"
                disabled={uploading || remaining <= 0}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t("uploadingDots")}
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
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
                        {/*
                          Always-visible remove control sized to the
                          ~32px minimum touch target (44px hit area via
                          padding). The previous "hover to reveal" text
                          pill was unreachable on touch devices.
                        */}
                        <button
                          type="button"
                          onClick={() => removeReference(category, r.id)}
                          aria-label={t("removeReferenceAria")}
                          className="absolute end-1 top-1 grid size-8 place-items-center rounded-full bg-black/65 text-white shadow-sm hover:bg-black/80"
                        >
                          <X className="size-4" />
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
