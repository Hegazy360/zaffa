import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { notifyMessageReceived } from "@/server/services/notifications/dispatchers";

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
      const created = await prisma.message.create({
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

      // Figure out who the *other* participant is and notify them. We
      // don't notify the sender, and we don't care if the event has no
      // planner yet (then there's no one else to ping).
      const event = await prisma.event.findUnique({
        where: { id: input.eventId },
        select: {
          id: true,
          client_id: true,
          planner: { select: { user_id: true } },
        },
      });
      if (event) {
        const plannerUserId = event.planner?.user_id ?? null;
        const recipientUserId =
          ctx.user.id === event.client_id ? plannerUserId : event.client_id;
        if (recipientUserId && recipientUserId !== ctx.user.id) {
          // Build a short preview. Multi-line / long messages collapse to
          // a single ellipsised line so the notification card stays compact.
          const preview =
            input.content.length > 140
              ? `${input.content.slice(0, 137).replace(/\s+/g, " ").trim()}…`
              : input.content.replace(/\s+/g, " ").trim();
          const recipientRole =
            recipientUserId === event.client_id ? "client" : "planner";
          await notifyMessageReceived({
            recipientUserId,
            senderName: created.sender.full_name,
            preview,
            eventId: input.eventId,
            recipientRole,
            messageId: created.id,
          });
        }
      }

      return created;
    }),
});
