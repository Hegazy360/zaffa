import Link from "next/link";
import { Building2, ArrowRight, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dashboard-auth";
import { VISION_PACK_SKU_ID } from "@/lib/vision-pack";
import { format } from "date-fns";

/**
 * Admin event list — lists events with a higher-tier Vision Pack so
 * the operator can curate venue recommendations for them. Lower-tier
 * (Design Pack) events don't appear because that SKU has no venue
 * recommendations product on top.
 *
 * Server component because the data is small (recent events) and
 * doesn't change on user interaction — clicking through goes to the
 * per-event recommendations editor.
 */
export default async function AdminEventsPage() {
  await requireRole("admin");

  // Pull events whose linked Vision Pack is the higher-tier SKU. We
  // join via vision_packs rather than filtering by status so admins
  // can recommend venues even for a pack that's still pending payment
  // (the recommendation will surface as soon as the couple's pack
  // activates). Capped at 100 — old events get archived from the queue.
  const events = await prisma.event.findMany({
    where: {
      vision_packs: { some: { sku: VISION_PACK_SKU_ID } },
    },
    orderBy: [{ created_at: "desc" }],
    take: 100,
    select: {
      id: true,
      title: true,
      event_type: true,
      event_date: true,
      venue: true,
      created_at: true,
      client: { select: { full_name: true, avatar_url: true } },
      _count: { select: { venue_recommendations: true } },
    },
  });

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/40 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <header className="mb-8 space-y-3">
          <p className="text-eyebrow font-medium text-rose-700/80">
            Vision Pack events
          </p>
          <h1 className="font-display text-balance text-4xl font-light leading-tight tracking-tight">
            Curate venue recommendations
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Higher-tier Vision Pack events that get Zaffa-curated venue
            recommendations. Click an event to manage which venues the
            couple sees.
          </p>
        </header>

        {events.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-muted/20 px-6 py-16 text-center">
            <Building2 className="mx-auto size-8 text-rose-400" />
            <p className="mt-4 text-sm text-muted-foreground">
              No higher-tier events yet.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-rose-100/70 rounded-2xl border border-brand-line bg-white/80 backdrop-blur-sm">
            {events.map((event) => (
              <li key={event.id}>
                <Link
                  href={`/dashboard/admin/events/${event.id}`}
                  className="flex items-center gap-4 px-5 py-4 transition hover:bg-rose-50/40"
                >
                  <div className="grid size-10 shrink-0 place-items-center rounded-full bg-rose-100 text-rose-700">
                    <Sparkles className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.client.full_name} · {event.event_type}
                      {event.event_date ? (
                        <>
                          {" · "}
                          {format(event.event_date, "MMM d, yyyy")}
                        </>
                      ) : null}
                      {event.venue ? ` · ${event.venue}` : ""}
                    </p>
                  </div>
                  <span className="hidden shrink-0 rounded-full bg-rose-50 px-2 py-1 text-xs font-medium uppercase tracking-wider text-rose-700 sm:inline-flex">
                    {event._count.venue_recommendations} rec
                    {event._count.venue_recommendations === 1 ? "" : "s"}
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground rtl:-scale-x-100" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
