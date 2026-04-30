"use client";

import { useState, type KeyboardEvent } from "react";
import {
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type EventTypeOption = "wedding" | "engagement" | "birthday" | "corporate" | "other" | "none";

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

function styleTagsArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === "string");
  return [];
}

export default function PortfolioPage() {
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
      toast.success("Portfolio item removed");
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
        <div className="rounded-2xl border border-rose-100/70 bg-white/70 p-8 backdrop-blur-sm">
          <p className="mb-1 text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
            Almost there
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight">
            Set up your planner profile first
          </h1>
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            Add your business name in Settings before curating your portfolio.
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
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
              Curate your work
            </p>
            <h1 className="font-display mt-3 text-balance text-4xl font-light leading-tight tracking-tight sm:text-5xl">
              Portfolio
            </h1>
            <p className="mt-2 max-w-xl text-pretty text-sm text-muted-foreground">
              Show couples the kind of weddings you create. Each item appears
              alongside your proposals.
            </p>
          </div>
          <Button
            onClick={() => setOpen({ mode: "create" })}
            className="gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
          >
            <Plus className="size-4" />
            Add piece
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
              No portfolio yet
            </h3>
            <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
              Add a few of your favourite weddings — couples will see them next
              to your proposal.
            </p>
            <Button
              onClick={() => setOpen({ mode: "create" })}
              className="mt-6 gap-1.5 bg-gradient-to-r from-rose-600 to-amber-500 text-white"
            >
              <Plus className="size-4" />
              Add your first piece
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => {
              const tags = styleTagsArray(item.style_tags);
              return (
                <article
                  key={item.id}
                  className="group relative overflow-hidden rounded-2xl border border-rose-100/70 bg-white/80 ring-1 ring-foreground/[0.04] backdrop-blur-sm"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-gradient-to-br from-rose-50 to-amber-50/60">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={item.image_url}
                      alt={item.caption ?? ""}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => setOpen({ mode: "edit", item })}
                        className="size-7 bg-white/90"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="outline"
                        onClick={() => {
                          if (window.confirm("Remove this from your portfolio?")) {
                            remove.mutate({ id: item.id });
                          }
                        }}
                        className="size-7 bg-white/90 text-destructive"
                      >
                        <Trash2 className="size-3.5" />
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
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {item.event_type}
                      </p>
                    )}
                    {tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] text-rose-700 ring-1 ring-rose-100"
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
                {open?.mode === "edit" ? "Edit portfolio piece" : "Add to your portfolio"}
              </DialogTitle>
              <DialogDescription>
                Use a high-quality image. Caption tells the story; tags help
                couples find you.
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
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? "");
  const [caption, setCaption] = useState(item?.caption ?? "");
  const [eventType, setEventType] = useState<EventTypeOption>(
    (item?.event_type as EventTypeOption | null) ?? "none"
  );
  const [tags, setTags] = useState<string[]>(styleTagsArray(item?.style_tags));
  const [tagDraft, setTagDraft] = useState("");

  const create = trpc.planner.portfolio.create.useMutation({
    onSuccess: () => {
      toast.success("Added to portfolio");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const update = trpc.planner.portfolio.update.useMutation({
    onSuccess: () => {
      toast.success("Portfolio piece updated");
      onDone();
    },
    onError: (e) => toast.error(e.message),
  });

  const submitting = create.isPending || update.isPending;

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
    if (!imageUrl.trim()) {
      toast.error("Image URL is required");
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
      <div className="space-y-1.5">
        <Label htmlFor="image">Image URL</Label>
        <Input
          id="image"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://…"
          disabled={mode === "edit"}
        />
        {mode === "edit" && (
          <p className="text-[11px] text-muted-foreground">
            Image URL is locked once a piece is added.
          </p>
        )}
      </div>
      {imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="aspect-[4/3] w-full rounded-lg object-cover"
        />
      )}
      <div className="space-y-1.5">
        <Label htmlFor="caption">Caption</Label>
        <Textarea
          id="caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="A barefoot vow on the North Coast."
          className="resize-none"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="event-type">Event type</Label>
        <Select
          items={EVENT_TYPES}
          value={eventType}
          onValueChange={(v) => v && setEventType(v as EventTypeOption)}
        >
          <SelectTrigger id="event-type" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EVENT_TYPES.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tags">Style tags</Label>
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
            id="tags"
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={onTagKey}
            placeholder={tags.length === 0 ? "Beachfront, Garden..." : ""}
            className="flex-1 min-w-[120px] bg-transparent text-sm outline-none"
          />
        </div>
      </div>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>
          Cancel
        </DialogClose>
        <Button
          type="submit"
          disabled={submitting}
          className="bg-gradient-to-r from-rose-600 to-amber-500 text-white"
        >
          {submitting ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
          {mode === "create" ? "Add piece" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
