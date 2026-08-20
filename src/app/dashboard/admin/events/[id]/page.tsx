import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/dashboard-auth";
import { Button } from "@/components/ui/button";
import { RecommendationsPanel } from "./_components/recommendations-panel";

/**
 * Admin per-event page focused on the venue-recommendations workflow.
 *
 * Server-rendered header: pulls the event metadata directly via Prisma
 * since the existing `events.byId` tRPC route is gated to the event's
 * client/planner. The recommendations CRUD lives in the client
 * `RecommendationsPanel` and uses admin-scoped tRPC procedures from
 * the `venues` router.
 */
export default async function AdminEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("admin");
  const { id } = await params;

  const event = await prisma.event.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      event_type: true,
      event_date: true,
      venue: true,
      status: true,
      created_at: true,
      client: {
        select: { id: true, full_name: true, avatar_url: true },
      },
      vision_packs: {
        select: {
          id: true,
          sku: true,
          status: true,
          paid_at: true,
        },
        orderBy: { created_at: "desc" },
        take: 1,
      },
    },
  });
  if (!event) notFound();

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] w-full overflow-x-hidden bg-gradient-to-b from-rose-50/40 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-30"
      />
      <div className="relative mx-auto max-w-3xl px-6 py-10 sm:py-14">
        <div className="mb-6">
          <Button
            render={<Link href="/dashboard/admin/events" />}
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
          >
            <ArrowLeft className="size-3.5" />
            All events
          </Button>
        </div>

        <header className="mb-8 space-y-2">
          <p className="text-[0.6rem] font-semibold uppercase tracking-[0.3em] text-rose-700/80">
            Event
          </p>
          <h1 className="font-display text-3xl font-light tracking-tight">
            {event.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {event.client.full_name} · {event.event_type}
            {event.event_date ? (
              <> · {format(event.event_date, "MMM d, yyyy")}</>
            ) : null}
            {event.venue ? <> · {event.venue}</> : null}
          </p>
          {event.vision_packs[0] ? (
            <p className="text-[11px] text-muted-foreground/85">
              Vision Pack: <span className="font-mono">{event.vision_packs[0].sku}</span>
              {" · "}
              {event.vision_packs[0].status}
            </p>
          ) : null}
        </header>

        <RecommendationsPanel eventId={event.id} />
      </div>
    </div>
  );
}
