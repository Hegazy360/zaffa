"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  Building2,
  Loader2,
  Plus,
  Search,
  Trash2,
  Pencil,
  Eye,
  EyeOff,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Admin venues directory.
 *
 * Lists every Zaffa-curated venue with a quick search by name/city/slug
 * and basic CRUD entry points. New venues route to a fresh editor page
 * (`/dashboard/admin/venues/new`); existing venues open in
 * `/dashboard/admin/venues/[id]`.
 *
 * The directory is admin-curated for v1 — no venue self-serve flow yet.
 * The schema's nullable `user_id` keeps the door open for v2 without a
 * follow-up migration.
 */
export default function AdminVenuesPage() {
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const { data, isLoading } = trpc.venues.adminList.useQuery({ query });

  const remove = trpc.venues.adminDelete.useMutation({
    onSuccess: () => {
      utils.venues.adminList.invalidate();
      toast.success("Venue removed");
    },
    onError: (e) => toast.error(e.message),
  });

  const items = data?.items ?? [];

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/40 via-background to-background dark:from-rose-950/15">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-3">
            <p className="text-[0.65rem] font-medium uppercase tracking-[0.3em] text-rose-700/80">
              Venues
            </p>
            <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight">
              Venue directory
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              Zaffa-curated partner venues we recommend to higher-tier
              Vision Pack couples. Add, edit, or hide venues here; recommend
              them per-event from the admin event view.
            </p>
          </div>
          <Button
            size="sm"
            render={<Link href="/dashboard/admin/venues/new" />}
            className="h-9 gap-1.5 bg-brand-gradient text-white hover:opacity-90"
          >
            <Plus className="size-3.5" />
            Add venue
          </Button>
        </header>

        <div className="mb-4 flex items-center gap-2 rounded-md border bg-background px-3 py-1.5">
          <Search className="size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, city, or slug…"
            className="h-7 border-0 px-0 focus-visible:ring-0"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-5 animate-spin text-rose-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center">
            <Building2 className="mx-auto size-8 text-rose-400" />
            <p className="mt-4 text-sm text-muted-foreground">
              No venues yet. Click <strong>Add venue</strong> to seed the
              directory.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {items.map((venue) => (
              <li
                key={venue.id}
                className="group relative overflow-hidden rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm transition hover:border-rose-200 dark:border-rose-900/30 dark:bg-card/80 dark:hover:border-rose-800"
              >
                <Link
                  href={`/dashboard/admin/venues/${venue.id}`}
                  className="block"
                >
                  {venue.cover_image ? (
                    <div className="relative h-40 w-full overflow-hidden bg-muted">
                      <Image
                        src={venue.cover_image}
                        alt={venue.name}
                        fill
                        sizes="(min-width: 640px) 50vw, 100vw"
                        className="object-cover transition-transform group-hover:scale-105"
                      />
                    </div>
                  ) : (
                    <div className="grid h-40 w-full place-items-center bg-rose-50/60 dark:bg-rose-950/20">
                      <Building2 className="size-8 text-rose-400" />
                    </div>
                  )}
                  <div className="space-y-1.5 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="line-clamp-1 text-sm font-medium">
                        {venue.name}
                      </h3>
                      {venue.published ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-emerald-700">
                          <Eye className="size-3" /> Live
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-amber-700">
                          <EyeOff className="size-3" /> Hidden
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {venue.city}, {venue.country}
                      {venue.capacity_max ? (
                        <>
                          {" · "}
                          {venue.capacity_min ?? 0}–{venue.capacity_max} guests
                        </>
                      ) : null}
                    </p>
                    <p className="text-[11px] text-muted-foreground/85">
                      {venue._count.recommendations} recommendation
                      {venue._count.recommendations === 1 ? "" : "s"}
                    </p>
                  </div>
                </Link>
                <div className="absolute end-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button
                    render={
                      <Link href={`/dashboard/admin/venues/${venue.id}`} />
                    }
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 bg-white/90 text-xs backdrop-blur"
                  >
                    <Pencil className="size-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 bg-white/90 text-xs text-destructive backdrop-blur hover:text-destructive"
                    disabled={remove.isPending}
                    onClick={(e) => {
                      e.preventDefault();
                      if (
                        window.confirm(
                          `Remove "${venue.name}" from the directory? This also removes any active recommendations.`,
                        )
                      ) {
                        remove.mutate({ id: venue.id });
                      }
                    }}
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
