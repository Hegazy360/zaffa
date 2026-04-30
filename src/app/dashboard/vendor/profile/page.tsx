"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useVendorImageUpload } from "@/hooks/use-vendor-image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
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

const CATEGORIES = [
  { value: "catering", label: "Catering" },
  { value: "photography", label: "Photography" },
  { value: "videography", label: "Videography" },
  { value: "flowers", label: "Flowers" },
  { value: "music", label: "Music" },
  { value: "decoration", label: "Decoration" },
  { value: "venue", label: "Venue" },
  { value: "makeup", label: "Makeup" },
  { value: "fashion", label: "Fashion" },
  { value: "transportation", label: "Transportation" },
  { value: "other", label: "Other" },
] as const;

type CategoryOption = (typeof CATEGORIES)[number]["value"];

type EventTypeOption =
  | "wedding"
  | "engagement"
  | "birthday"
  | "corporate"
  | "other"
  | "none";

const EVENT_TYPES: Array<{ value: EventTypeOption; label: string }> = [
  { value: "none", label: "Any event type" },
  { value: "wedding", label: "Wedding" },
  { value: "engagement", label: "Engagement" },
  { value: "birthday", label: "Birthday" },
  { value: "corporate", label: "Corporate" },
  { value: "other", label: "Other" },
];

interface PortfolioItem {
  id: string;
  image_url: string;
  caption: string | null;
  event_type: string | null;
  style_tags: unknown;
  created_at: Date;
}

function specialtiesArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

function styleTagsArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  return [];
}

export default function VendorProfilePage() {
  const utils = trpc.useUtils();
  const me = trpc.vendors.me.useQuery();
  const portfolio = trpc.vendors.portfolio.list.useQuery(undefined, {
    enabled: !!me.data,
  });

  const [seed, setSeed] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState<CategoryOption>("decoration");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [specialtyDraft, setSpecialtyDraft] = useState("");

  const seedKey = me.data?.id ?? "new";
  if (seedKey !== seed) {
    setSeed(seedKey);
    setBusinessName(me.data?.business_name ?? "");
    setCategory((me.data?.category as CategoryOption) ?? "decoration");
    setBio(me.data?.bio ?? "");
    setLocation(me.data?.location ?? "");
    setSpecialties(specialtiesArray(me.data?.specialties));
  }

  const update = trpc.vendors.update.useMutation({
    onSuccess: () => {
      toast.success("Profile saved");
      utils.vendors.me.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function addSpecialty() {
    const v = specialtyDraft.trim();
    if (!v) return;
    if (specialties.includes(v)) {
      setSpecialtyDraft("");
      return;
    }
    if (specialties.length >= 20) {
      toast.error("Up to 20 specialties");
      return;
    }
    setSpecialties([...specialties, v]);
    setSpecialtyDraft("");
  }

  function onSpecialtyKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSpecialty();
    }
  }

  function handleSave() {
    if (!businessName.trim()) {
      toast.error("Business name is required");
      return;
    }
    update.mutate({
      business_name: businessName.trim(),
      category,
      bio: bio.trim() || null,
      location: location.trim() || null,
      specialties,
    });
  }

  const [openItem, setOpenItem] = useState<
    { mode: "create" } | { mode: "edit"; item: PortfolioItem } | null
  >(null);

  const removeItem = trpc.vendors.portfolio.delete.useMutation({
    onSuccess: () => {
      toast.success("Removed");
      utils.vendors.portfolio.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  if (me.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative z-10 mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
        <header>
          <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            Profile
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight sm:text-4xl">
            How planners see you
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Business basics, then the work that&apos;ll get you booked.
          </p>
        </header>

        <section className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/85 backdrop-blur-sm">
          <div className="border-b border-rose-100/70 px-6 py-4">
            <h2 className="font-display text-lg font-medium tracking-tight">
              Business profile
            </h2>
            <p className="text-xs text-muted-foreground">
              These details show up on your card, your public profile, and
              every engagement request.
            </p>
          </div>
          <div className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="biz">Business name</Label>
                <Input
                  id="biz"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Studio Bloom"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat">Category</Label>
                <Select
                  items={CATEGORIES}
                  value={category}
                  onValueChange={(v) => v && setCategory(v as CategoryOption)}
                >
                  <SelectTrigger id="cat">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="loc">Location</Label>
                <Input
                  id="loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Cairo, Egypt"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={4}
                  placeholder="What's your studio's voice? What weddings light you up?"
                  className="resize-none"
                />
                <p className="text-[11px] text-muted-foreground">
                  {bio.length}/2000
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="spec">Specialties</Label>
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-input bg-transparent p-2">
                  {specialties.map((s) => (
                    <span
                      key={s}
                      className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800 ring-1 ring-rose-100"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() =>
                          setSpecialties(specialties.filter((x) => x !== s))
                        }
                        aria-label={`Remove ${s}`}
                        className="text-rose-700/70 hover:text-rose-900"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    id="spec"
                    value={specialtyDraft}
                    onChange={(e) => setSpecialtyDraft(e.target.value)}
                    onKeyDown={onSpecialtyKey}
                    placeholder={specialties.length === 0 ? "e.g. Long stems" : ""}
                    className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={addSpecialty}
                    className="gap-1"
                  >
                    <Plus className="size-3" />
                    Add
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={handleSave}
                disabled={update.isPending || !businessName.trim()}
                className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
              >
                {update.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Save profile
              </Button>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-rose-100/70 bg-white/85 backdrop-blur-sm">
          <div className="flex items-end justify-between border-b border-rose-100/70 px-6 py-4">
            <div>
              <h2 className="font-display text-lg font-medium tracking-tight">
                Portfolio
              </h2>
              <p className="text-xs text-muted-foreground">
                A few hero shots planners see before booking.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setOpenItem({ mode: "create" })}
              className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
              disabled={!me.data}
            >
              <Plus className="size-3.5" />
              Add piece
            </Button>
          </div>
          <div className="p-6">
            {!me.data ? (
              <p className="text-sm text-muted-foreground">
                Save your business profile first to start uploading portfolio
                pieces.
              </p>
            ) : portfolio.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="size-5 animate-spin text-rose-500" />
              </div>
            ) : (portfolio.data?.length ?? 0) === 0 ? (
              <div className="rounded-xl border border-dashed border-rose-100 px-4 py-10 text-center">
                <ImageIcon className="mx-auto mb-2 size-6 text-rose-500" />
                <p className="text-sm text-muted-foreground">
                  No portfolio pieces yet.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {portfolio.data!.map((item) => (
                  <div
                    key={item.id}
                    className="overflow-hidden rounded-xl border border-rose-100/70"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image_url}
                      alt={item.caption ?? "portfolio"}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    <div className="space-y-1 p-3">
                      {item.caption && (
                        <p className="text-sm">{item.caption}</p>
                      )}
                      {item.event_type && (
                        <p className="text-[11px] uppercase tracking-wider text-rose-700/70">
                          {item.event_type}
                        </p>
                      )}
                      <div className="flex justify-end gap-1 pt-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1"
                          onClick={() =>
                            setOpenItem({ mode: "edit", item: item as PortfolioItem })
                          }
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="gap-1 text-destructive"
                          onClick={() => {
                            if (confirm("Remove this piece?")) {
                              removeItem.mutate({ id: item.id });
                            }
                          }}
                        >
                          <Trash2 className="size-3.5" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <Dialog
          open={!!openItem}
          onOpenChange={(v) => !v && setOpenItem(null)}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {openItem?.mode === "edit" ? "Edit piece" : "Add to portfolio"}
              </DialogTitle>
              <DialogDescription>
                {openItem?.mode === "edit"
                  ? "Update the caption, event type, and tags."
                  : "Show planners your best work."}
              </DialogDescription>
            </DialogHeader>
            {openItem && (
              <PortfolioForm
                mode={openItem.mode}
                item={openItem.mode === "edit" ? openItem.item : null}
                onDone={() => {
                  setOpenItem(null);
                  utils.vendors.portfolio.list.invalidate();
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
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? "");
  const [caption, setCaption] = useState(item?.caption ?? "");
  const [eventType, setEventType] = useState<EventTypeOption>(
    (item?.event_type as EventTypeOption | null) ?? "none",
  );
  const [tags, setTags] = useState<string[]>(styleTagsArray(item?.style_tags));
  const [tagDraft, setTagDraft] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isUploading } = useVendorImageUpload();

  const create = trpc.vendors.portfolio.create.useMutation({
    onSuccess: () => {
      toast.success("Added");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.vendors.portfolio.update.useMutation({
    onSuccess: () => {
      toast.success("Updated");
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
      toast.error("Upload an image first");
      return;
    }
    const eventTypeOrNull =
      eventType === "none" ? null : (eventType as Exclude<EventTypeOption, "none">);
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
      {mode === "create" && (
        <div className="space-y-1.5">
          <Label>Image</Label>
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
            <div className="group relative overflow-hidden rounded-xl border border-rose-100/70">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="upload preview"
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
                  Replace
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
                  <p className="text-sm text-muted-foreground">Uploading…</p>
                </>
              ) : (
                <>
                  <Upload className="size-6 text-rose-500" />
                  <p className="text-sm font-medium">
                    Drop an image or click to upload
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    JPG, PNG, WEBP up to 8MB
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="cap">Caption</Label>
        <Input
          id="cap"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Garden ceremony — golden hour"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="evt">Event type</Label>
        <Select
          items={EVENT_TYPES}
          value={eventType}
          onValueChange={(v) => v && setEventType(v as EventTypeOption)}
        >
          <SelectTrigger id="evt">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Style tags</Label>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-input bg-transparent p-2">
          {tags.map((t) => (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-xs text-rose-800 ring-1 ring-rose-100"
            >
              {t}
              <button
                type="button"
                onClick={() => setTags(tags.filter((x) => x !== t))}
                aria-label={`Remove ${t}`}
                className="text-rose-700/70 hover:text-rose-900"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={onTagKey}
            placeholder={tags.length === 0 ? "e.g. romantic" : ""}
            className="flex-1 min-w-[100px] bg-transparent text-sm outline-none"
          />
        </div>
      </div>
      <DialogFooter>
        <Button
          type="submit"
          disabled={submitting}
          className="gap-1 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          {mode === "create" ? "Add" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
