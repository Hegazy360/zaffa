"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  Building2,
  Heart,
  Loader2,
  Plus,
  Search,
  Trash2,
  X as XIcon,
} from "lucide-react";
import { format } from "date-fns";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Client-side panel mounted on the admin event page. Lists existing
 * recommendations and exposes a dialog to add new ones via the venue
 * directory search. Couples don't see dismissed recommendations on
 * their event page, but admins do here so the surface honestly
 * reflects what's been sent.
 */
export function RecommendationsPanel({ eventId }: { eventId: string }) {
  const utils = trpc.useUtils();
  const { data: recs, isLoading } =
    trpc.venues.adminListForEvent.useQuery({ eventId });

  const remove = trpc.venues.adminUnrecommend.useMutation({
    onSuccess: () => {
      utils.venues.adminListForEvent.invalidate({ eventId });
      toast.success("Recommendation removed");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold tracking-tight">
          Recommended venues
        </h2>
        <RecommendDialog eventId={eventId} />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-rose-500" />
        </div>
      ) : !recs || recs.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center">
          <Building2 className="mx-auto size-8 text-rose-400" />
          <p className="mt-4 text-sm text-muted-foreground">
            No venues recommended yet. Use the “Recommend a venue” button
            to curate options.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {recs.map((rec) => {
            const cover =
              rec.venue.cover_image ?? rec.venue.images[0]?.url ?? null;
            return (
              <li
                key={rec.id}
                className="group flex flex-col gap-3 overflow-hidden rounded-2xl border border-brand-line bg-white/80 p-4 backdrop-blur-sm sm:flex-row"
              >
                {cover ? (
                  <div className="relative h-32 w-full shrink-0 overflow-hidden rounded-xl bg-muted sm:size-32">
                    <Image
                      src={cover}
                      alt={rec.venue.name}
                      fill
                      sizes="(min-width: 640px) 128px, 100vw"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="grid h-32 w-full shrink-0 place-items-center rounded-xl bg-rose-50/60 sm:size-32">
                    <Building2 className="size-6 text-rose-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      href={`/dashboard/admin/venues/${rec.venue.id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {rec.venue.name}
                    </Link>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (window.confirm("Remove this recommendation?")) {
                          remove.mutate({ id: rec.id });
                        }
                      }}
                    >
                      <Trash2 className="size-3" />
                      Remove
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {rec.venue.city}, {rec.venue.country}
                    {rec.venue.capacity_max ? (
                      <>
                        {" · "}
                        {rec.venue.capacity_min ?? 0}–{rec.venue.capacity_max}{" "}
                        guests
                      </>
                    ) : null}
                    {rec.venue.price_tier ? <> · {rec.venue.price_tier}</> : null}
                  </p>
                  {rec.note ? (
                    <p className="rounded-md bg-rose-50/60 px-3 py-2 text-xs text-rose-900/90 italic">
                      “{rec.note}”
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-muted-foreground">
                    {rec.interested_at ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                        <Heart className="size-3" />
                        Couple interested ·{" "}
                        {format(rec.interested_at, "MMM d")}
                      </span>
                    ) : null}
                    {rec.dismissed_at ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
                        <XIcon className="size-3" />
                        Dismissed
                      </span>
                    ) : null}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RecommendDialog({ eventId }: { eventId: string }) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const { data: hits, isFetching } = trpc.venues.adminSearch.useQuery(
    { query: search, limit: 10 },
    { enabled: open },
  );

  const recommend = trpc.venues.adminRecommend.useMutation({
    onSuccess: () => {
      utils.venues.adminListForEvent.invalidate({ eventId });
      toast.success("Venue recommended");
      setOpen(false);
      setSelectedId(null);
      setNote("");
      setSearch("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-brand-gradient text-xs text-white hover:opacity-90"
          />
        }
      >
        <Plus className="size-3" />
        Recommend a venue
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Recommend a venue</DialogTitle>
          <DialogDescription>
            Pick a venue from the directory and add a personal note for
            the couple. They&apos;ll see this on their event page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border bg-background px-3 py-1.5">
            <Search className="size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search venues by name or city…"
              className="h-7 border-0 px-0 focus-visible:ring-0"
            />
          </div>

          <ul className="max-h-72 space-y-1 overflow-y-auto rounded-md border bg-muted/20 p-1">
            {isFetching ? (
              <li className="flex items-center justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </li>
            ) : !hits || hits.length === 0 ? (
              <li className="px-3 py-6 text-center text-xs text-muted-foreground">
                No venues match that search.
              </li>
            ) : (
              hits.map((hit) => (
                <li key={hit.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(hit.id)}
                    className={
                      "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-start transition " +
                      (selectedId === hit.id
                        ? "bg-rose-100/80"
                        : "hover:bg-rose-50")
                    }
                  >
                    {hit.cover_image ? (
                      <div className="relative size-10 shrink-0 overflow-hidden rounded-md bg-muted">
                        <Image
                          src={hit.cover_image}
                          alt={hit.name}
                          fill
                          sizes="40px"
                          className="object-cover"
                        />
                      </div>
                    ) : (
                      <div className="grid size-10 shrink-0 place-items-center rounded-md bg-rose-100 text-rose-700">
                        <Building2 className="size-4" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{hit.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {hit.city}, {hit.country}
                        {hit.capacity_max ? (
                          <>
                            {" · "}
                            {hit.capacity_min ?? 0}–{hit.capacity_max}
                          </>
                        ) : null}
                      </p>
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>

          <div className="space-y-1.5">
            <label className="text-xs font-medium" htmlFor="note">
              Note for the couple
            </label>
            <Textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this venue fits — palette, vibe, capacity, anything personal."
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!selectedId || recommend.isPending}
            onClick={() => {
              if (!selectedId) return;
              recommend.mutate({
                eventId,
                venueId: selectedId,
                note: note.trim() || undefined,
              });
            }}
            className="gap-1.5 bg-brand-gradient text-white hover:opacity-90"
          >
            {recommend.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : null}
            Recommend
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
