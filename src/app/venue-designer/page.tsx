"use client";

import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import {
  Plus,
  Loader2,
  Trash2,
  Sparkles,
  ArrowRight,
  Image as ImageIcon,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";

interface NormalizedPalette {
  colors: string[];
}

function normalizePalette(value: unknown): NormalizedPalette {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const colors = Array.isArray(obj.colors)
      ? (obj.colors.filter((c): c is string => typeof c === "string"))
      : [];
    return { colors };
  }
  return { colors: [] };
}

export default function VenueDesignerGalleryPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { data: designs, isLoading } = trpc.venueDesigns.list.useQuery();
  const utils = trpc.useUtils();

  const deleteMutation = trpc.venueDesigns.delete.useMutation({
    onSuccess: () => utils.venueDesigns.list.invalidate(),
  });

  const handleDelete = (
    e: React.MouseEvent,
    id: string,
    name: string
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (window.confirm(`Delete "${name}"? This cannot be undone.`)) {
      deleteMutation.mutate({ id });
    }
  };

  return (
    <>
    <Navbar />
    <div className="relative isolate min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background dark:from-rose-950/15">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-200/30 to-amber-200/20 blur-3xl dark:from-rose-900/15 dark:to-amber-900/10"
      />

      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <motion.header
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="mb-12 flex flex-col items-start gap-5 sm:mb-14 sm:flex-row sm:items-end sm:justify-between"
        >
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-[11px] font-medium tracking-[0.18em] text-rose-700 uppercase backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
              <Sparkles className="size-3" />
              Your atelier
            </div>
            <h1 className="font-display text-balance text-4xl leading-tight font-light tracking-tight sm:text-5xl">
              My designs
            </h1>
            <p className="max-w-lg text-pretty text-sm text-muted-foreground sm:text-base">
              Each design is a complete brief — basics, palette, references, and the AI renders you&apos;ve generated for it.
            </p>
          </div>
          <Button
            size="lg"
            onClick={() => router.push("/venue-designer/new")}
            className="h-11 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-5 text-white shadow-lg shadow-rose-500/20 hover:opacity-90 hover:shadow-rose-500/30"
          >
            <Plus className="size-4" />
            New design
          </Button>
        </motion.header>

        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl bg-card/80 ring-1 ring-foreground/[0.06] backdrop-blur-sm"
              >
                <div className="aspect-[4/3] animate-pulse bg-gradient-to-br from-rose-50 to-amber-50/60 dark:from-rose-950/30 dark:to-amber-950/20" />
                <div className="space-y-2.5 p-5">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
            <div className="col-span-full flex items-center justify-center py-2">
              <Loader2 className="size-5 animate-spin text-rose-500" />
            </div>
          </div>
        ) : !designs || designs.length === 0 ? (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="flex flex-col items-center justify-center py-24 text-center"
          >
            <div className="mb-6 grid size-16 place-items-center rounded-full bg-gradient-to-br from-rose-100 to-amber-100 ring-1 ring-rose-200/60 dark:from-rose-950/50 dark:to-amber-950/30 dark:ring-rose-900/40">
              <Sparkles className="size-7 text-rose-600 dark:text-rose-300" />
            </div>
            <h2 className="font-display text-2xl font-light tracking-tight">
              No designs yet
            </h2>
            <p className="mt-2 max-w-md text-pretty text-sm text-muted-foreground">
              Start your first one — pick a vibe, palette, and a few references, and we&apos;ll bring it to life with AI.
            </p>
            <div aria-hidden className="champagne-hairline mx-auto mt-6 h-px w-32" />
            <Button
              size="lg"
              onClick={() => router.push("/venue-designer/new")}
              className="mt-7 h-11 gap-2 bg-gradient-to-r from-rose-600 to-amber-500 px-5 text-white shadow-lg shadow-rose-500/20 hover:opacity-90"
            >
              <Plus className="size-4" />
              Create your first design
            </Button>
          </motion.div>
        ) : (
          <motion.div
            initial={reduceMotion ? false : "hidden"}
            animate="show"
            variants={{
              hidden: {},
              show: { transition: { staggerChildren: 0.04 } },
            }}
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          >
            {designs.map((design) => {
              const palette = normalizePalette(design.palette);
              const heroImage =
                design.media[0]?.url ?? design.thumbnail ?? null;

              return (
                <motion.article
                  key={design.id}
                  variants={{
                    hidden: { opacity: 0, y: 12 },
                    show: { opacity: 1, y: 0 },
                  }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={reduceMotion ? undefined : { y: -2 }}
                  onClick={() => router.push(`/venue-designer/${design.id}`)}
                  className="group relative cursor-pointer overflow-hidden rounded-2xl bg-card/80 ring-1 ring-foreground/[0.06] backdrop-blur-sm transition-shadow hover:shadow-[0_20px_50px_-20px_rgba(244,63,94,0.25)]"
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                    {heroImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={heroImage}
                        alt={design.name}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-rose-50 via-rose-50/60 to-amber-50 dark:from-rose-950/40 dark:via-rose-950/20 dark:to-amber-950/30">
                        <div className="text-center">
                          <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-white/70 ring-1 ring-rose-200/60 backdrop-blur-sm dark:bg-rose-950/50 dark:ring-rose-900/50">
                            <Sparkles className="size-5 text-rose-500 dark:text-rose-300" />
                          </div>
                          <p className="text-[11px] tracking-wide text-muted-foreground">
                            No render yet
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                    <div className="absolute left-2.5 top-2.5 flex items-center gap-1.5">
                      <span className="inline-flex items-center rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white capitalize backdrop-blur-sm">
                        {design.event_type}
                      </span>
                      {palette.colors.length > 0 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-1 backdrop-blur-sm">
                          {palette.colors.slice(0, 4).map((c) => (
                            <span
                              key={c}
                              className="block size-2 rounded-full ring-1 ring-white/40"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, design.id, design.name)}
                      aria-label={`Delete ${design.name}`}
                      className="absolute right-2.5 top-2.5 grid size-7 place-items-center rounded-full bg-black/55 text-white opacity-0 backdrop-blur-sm transition-opacity hover:bg-black/80 group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>

                    <div
                      aria-hidden
                      className="pointer-events-none absolute bottom-3 right-3 grid size-9 translate-y-2 place-items-center rounded-full bg-white/95 text-rose-600 opacity-0 shadow-lg transition-all group-hover:translate-y-0 group-hover:opacity-100 dark:bg-rose-50/90"
                    >
                      <ArrowRight className="size-4" />
                    </div>
                  </div>

                  <div className="space-y-2 p-5">
                    <h3 className="font-display text-lg leading-tight font-medium tracking-tight">
                      {design.name}
                    </h3>
                    <p className="text-xs text-muted-foreground capitalize">
                      {design.size} · {design.setting}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span>
                        {formatDistanceToNow(new Date(design.updated_at), {
                          addSuffix: true,
                        })}
                      </span>
                      {design._count.media > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-1.5 py-0.5 text-rose-700 ring-1 ring-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50">
                          <ImageIcon className="size-3" />
                          {design._count.media}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
    </>
  );
}
