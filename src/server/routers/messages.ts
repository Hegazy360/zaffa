import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";

// Both the client and the planner attached to the event are allowed to read
// and post messages. Anyone else is rejected as not-found so we don't leak
// the existence of an event id.
async function assertEventParticipant(eventId: string, userId: string) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      OR: [{ client_id: userId }, { planner: { user_id: userId } }],
    },
    select: { id: true },
  });
  if (!event) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Event not found" });
  }
  return event;
}

export const messagesRouter = router({
  byEvent: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertEventParticipant(input.eventId, ctx.user.id);
      return prisma.message.findMany({
        where: { event_id: input.eventId },
        orderBy: { created_at: "asc" },
        include: {
          sender: {
            select: {
              id: true,
              full_name: true,
              avatar_url: true,
              role: true,
            },
          },
        },
      });
    }),

  // Inbox view: every event the user participates in plus the latest message
  // and a basic count. Used by the /dashboard/client/messages list page.
  inbox: protectedProcedure.query(async ({ ctx }) => {
    const events = await prisma.event.findMany({
      where: {
        OR: [
          { client_id: ctx.user.id },
          { planner: { user_id: ctx.user.id } },
        ],
      },
      select: {
        id: true,
        title: true,
        event_date: true,
        venue: true,
        designs: {
          orderBy: { approved_at: "desc" },
          take: 1,
          select: {
            thumbnail: true,
            media: {
              where: { type: "render" },
              orderBy: { created_at: "desc" },
              take: 1,
              select: { url: true },
            },
          },
        },
        messages: {
          orderBy: { created_at: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            created_at: true,
            sender: {
              select: { id: true, full_name: true },
            },
          },
        },
        _count: { select: { messages: true } },
      },
    });

    return events.map((e) => ({
      id: e.id,
      title: e.title,
      event_date: e.event_date,
      venue: e.venue,
      thumbnail:
        e.designs[0]?.media[0]?.url ?? e.designs[0]?.thumbnail ?? null,
      lastMessage: e.messages[0] ?? null,
      messageCount: e._count.messages,
    }));
  }),

  send: protectedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        content: z.string().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertEventParticipant(input.eventId, ctx.user.id);
      return prisma.message.create({
        data: {
          event_id: input.eventId,
          sender_id: ctx.user.id,
          content: input.content,
        },
        include: {
          sender: {
            select: {
              id: true,
              full_name: true,
              avatar_url: true,
              role: true,
            },
          },
        },
      });
    }),
});
