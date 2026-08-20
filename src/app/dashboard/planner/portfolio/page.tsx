"use client";

import {
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import {
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { usePlannerImageUpload } from "@/hooks/use-planner-image-upload";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm";

type EventTypeOption = "wedding" | "engagement" | "birthday" | "corporate" | "other" | "none";

const EVENT_TYPE_VALUES: EventTypeOption[] = [
  "none",
  "wedding",
  "engagement",
  "birthday",
  "corporate",
  "other",
];

const EVENT_TYPE_LABEL_KEYS: Record<EventTypeOption, string> = {
  none: "anyEventType",
  wedding: "wedding",
  engagement: "engagement",
  birthday: "birthday",
  corporate: "corporate",
  other: "otherEventType",
};

interface PortfolioItem {
  id: string;
  image_url: string;
  caption: string | null;
  event_type: string | null;
  style_tags: unknown;
  created_at: Date;
}

function styleTagsArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  return [];
}

export default function PortfolioPage() {
  const t = useTranslations("planner");
  const tCommon = useTranslations("common");
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const { data: planner, isLoading: plannerLoading } =
    trpc.planner.me.useQuery();
  const { data: items, isLoading } = trpc.planner.portfolio.list.useQuery(
    undefined,
    { enabled: !!planner }
  );

  const [open, setOpen] = useState<{ mode: "create" } | { mode: "edit"; item: PortfolioItem } | null>(
    null
  );

  const remove = trpc.planner.portfolio.delete.useMutation({
    onSuccess: () => {
      toast.success(t("portfolioRemovedToast"));
      utils.planner.portfolio.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (plannerLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  if (!planner) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-2xl border border-brand-line bg-white/70 p-8 backdrop-blur-sm">
          <p className="mb-1 text-eyebrow font-medium text-rose-700/80">
            {t("almostThereEyebrow")}
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight">
            {t("setupProfileFirstTitle")}
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            {t("setupProfileFirstBody")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />

      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-eyebrow font-medium text-rose-700/80">
              {t("portfolioEyebrow")}
            </p>
            <h1 className="font-display mt-3 text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
              {t("portfolioTitle")}
            </h1>
            <p className="mt-2 max-w-xl text-pretty text-sm text-muted-foreground">
              {t("portfolioSubtitle")}
            </p>
          </div>
          <Button
            onClick={() => setOpen({ mode: "create" })}
            className="gap-1.5 bg-brand-gradient text-white"
          >
            <Plus className="size-4" />
            {t("addPiece")}
          </Button>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="aspect-square animate-pulse rounded-2xl bg-gradient-to-br from-rose-50 to-amber-50/60"
              />
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-rose-200/70 bg-white/40 px-6 py-16 text-center backdrop-blur-sm">
            <div className="mb-5 grid size-14 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60">
              <ImageIcon className="size-6 text-rose-600" />
            </div>
            <h3 className="font-display text-xl font-light tracking-tight">
              {t("noPortfolioTitle")}
            </h3>
            <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
              {t("noPortfolioBody")}
            </p>
            <Button
              onClick={() => setOpen({ mode: "create" })}
              className="mt-6 gap-1.5 bg-brand-gradient text-white"
            >
              <Plus className="size-4" />
              {t("addFirstPiece")}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const tags = styleTagsArray(item.style_tags);
              return (
                <article
                  key={item.id}
                  className="group relative overflow-hidden rounded-2xl border border-brand-line bg-white/80 ring-1 ring-foreground/[0.04] backdrop-blur-sm"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image_url}
                      alt={item.caption ?? ""}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="absolute end-2 top-2 flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => setOpen({ mode: "edit", item })}
                        className="size-9 bg-white/90 md:size-7"
                      >
                        <Pencil className="size-4 md:size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={async () => {
                          if (
                            await confirm({
                              title: t("removeFromPortfolioConfirm"),
                              confirmLabel: tCommon("remove"),
                              destructive: true,
                            })
                          ) {
                            remove.mutate({ id: item.id });
                          }
                        }}
                        className="size-9 bg-white/90 text-destructive md:size-7"
                      >
                        <Trash2 className="size-4 md:size-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2 p-4">
                    {item.caption && (
                      <p className="text-sm font-medium leading-tight">
                        {item.caption}
                      </p>
                    )}
                    {item.event_type && (
                      <p className="text-eyebrow text-muted-foreground">
                        {item.event_type}
                      </p>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700 ring-1 ring-rose-100"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <Dialog
          open={open !== null}
          onOpenChange={(o) => !o && setOpen(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl font-light tracking-tight">
                {open?.mode === "edit"
                  ? t("editPortfolioPiece")
                  : t("addToPortfolio")}
              </DialogTitle>
              <DialogDescription>
                {t("portfolioFormDesc")}
              </DialogDescription>
            </DialogHeader>
            {open && (
              <PortfolioForm
                key={open.mode === "edit" ? open.item.id : "create"}
                mode={open.mode}
                item={open.mode === "edit" ? open.item : null}
                onDone={() => {
                  setOpen(null);
                  utils.planner.portfolio.list.invalidate();
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function PortfolioForm({
  mode,
  item,
  onDone,
}: {
  mode: "create" | "edit";
  item: PortfolioItem | null;
  onDone: () => void;
}) {
  const t = useTranslations("planner");
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? "");
  const [caption, setCaption] = useState(item?.caption ?? "");
  const [eventType, setEventType] = useState<EventTypeOption>(
    (item?.event_type as EventTypeOption | null) ?? "none"
  );
  const [tags, setTags] = useState<string[]>(styleTagsArray(item?.style_tags));
  const [tagDraft, setTagDraft] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = usePlannerImageUpload();

  const eventTypeItems = useMemo(
    () =>
      EVENT_TYPE_VALUES.map((value) => ({
        value,
        label: t(EVENT_TYPE_LABEL_KEYS[value]),
      })),
    [t],
  );

  const create = trpc.planner.portfolio.create.useMutation({
    onSuccess: () => {
      toast.success(t("addedToPortfolioToast"));
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.planner.portfolio.update.useMutation({
    onSuccess: () => {
      toast.success(t("portfolioUpdatedToast"));
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitting = create.isPending || update.isPending;

  async function handleFile(file: File | undefined) {
    if (!file) return;
    const url = await uploadFile(file);
    if (url) setImageUrl(url);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragOver(false);
    handleFile(e.dataTransfer.files?.[0]);
  }

  function addTag() {
    const v = tagDraft.trim();
    if (!v) return;
    if (tags.includes(v)) {
      setTagDraft("");
      return;
    }
    setTags([...tags, v]);
    setTagDraft("");
  }

  function onTagKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag();
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "create" && !imageUrl.trim()) {
      toast.error(t("uploadImageFirst"));
      return;
    }
    const eventTypeOrNull = eventType === "none" ? null : eventType;
    if (mode === "create") {
      create.mutate({
        image_url: imageUrl.trim(),
        caption: caption.trim() || null,
        event_type: eventTypeOrNull,
        style_tags: tags,
      });
    } else if (item) {
      update.mutate({
        id: item.id,
        caption: caption.trim() || null,
        event_type: eventTypeOrNull,
        style_tags: tags,
      });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {mode === "create" ? (
        <div className="space-y-1.5">
          <Label>{t("imageLabel")}</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          {imageUrl ? (
            <div className="group relative overflow-hidden rounded-xl border border-brand-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt={t("uploadPreviewAlt")}
                className="aspect-[4/3] w-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-2 bg-gradient-to-t from-stone-900/70 to-transparent p-2">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="gap-1"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                  {t("replace")}
                </Button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => !isUploading && fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={onDrop}
              className={`flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-rose-50/30 px-4 py-6 text-center transition ${
                isDragOver
                  ? "border-rose-400 bg-rose-50/80"
                  : "border-rose-200/70 hover:border-rose-300"
              } ${isUploading ? "pointer-events-none opacity-70" : ""}`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="size-6 animate-spin text-rose-500" />
                  <p className="text-sm text-muted-foreground">
                    {t("uploadingDots")}
                  </p>
                </>
              ) : (
                <>
                  <Upload className="size-6 text-rose-500" />
                  <p className="text-sm font-medium">{t("uploadOrDrop")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("imageRules")}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={item?.caption ?? ""}
            className="aspect-[4/3] w-full rounded-lg object-cover"
          />
        )
      )}
      <div className="space-y-1.5">
        <Label htmlFor="caption">{t("captionLabel")}</Label>
        <Textarea
          id="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder={t("captionPlaceholder")}
          className="resize-none"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="event-type">{t("eventTypeLabel")}</Label>
        <Select
          items={eventTypeItems}
          value={eventType}
          onValueChange={(v) => v && setEventType(v as EventTypeOption)}
        >
          <SelectTrigger id="event-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {eventTypeItems.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tags">{t("styleTagsLabel")}</Label>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-input bg-transparent p-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800 ring-1 ring-rose-100"
            >
              {tag}
              <button
                type="button"
                onClick={() => setTags(tags.filter((x) => x !== tag))}
                aria-label={t("removeTag", { tag })}
                className="text-rose-700/70 hover:text-rose-900"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            id="tags"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={onTagKey}
            placeholder={tags.length === 0 ? t("tagsPlaceholder") : ""}
            className="flex-1 min-w-[120px] rounded-sm bg-transparent text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          {t("cancelAction")}
        </DialogClose>
        <Button
          type="submit"
          disabled={submitting}
          className="bg-brand-gradient text-white"
        >
          {submitting ? <Loader2 className="me-2 size-4 animate-spin" /> : null}
          {mode === "create" ? t("addPiece") : t("saveChanges")}
        </Button>
      </DialogFooter>
    </form>
  );
}
