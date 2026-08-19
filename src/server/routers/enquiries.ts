import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { assertAdmin } from "@/lib/admin-guard";
import { resend } from "@/lib/resend";
import { enforceTrpcMany } from "@/lib/rate-limit";
import { logger, reportError } from "@/lib/logger";
import { captureServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { notifyEnquiryReceived } from "@/server/services/notifications/dispatchers";
import { EnquiryStatus, EnquiryChannel } from "@/generated/prisma/enums";
import { getStripe } from "@/lib/stripe";
import { toStripeAmount, CONCIERGE_INSTALLMENT_KIND } from "@/lib/payments";
import { getSupabaseAdmin } from "@/lib/supabase/admin";


/**
 * Full-service enquiries — the only inbound channel for "The Whole Wedding".
 *
 * The ordering inside `submit` is the whole point of this router. Before it
 * existed the flagship tier's pipeline was a single Resend email that returned
 * `{ ok: true }` even when `RESEND_API_KEY` was absent, so a misconfigured
 * environment silently dropped leads. Here the row is written FIRST and every
 * side effect afterwards is best-effort: an outage in email, notifications or
 * analytics can never cost us the lead.
 */

const CHANNEL = z.enum(["whatsapp", "email", "phone"]);
const SOURCE = z.enum(["whole_wedding_home", "render_page", "contact", "admin"]);

/**
 * Forward-only transitions, plus `lost` from anywhere. Encoded as data rather
 * than as `if` chains so the admin UI can render exactly the buttons that are
 * legal from the current state, and so an illegal transition is a server-side
 * error rather than a UI oversight.
 */
const ALLOWED_TRANSITIONS: Record<EnquiryStatus, EnquiryStatus[]> = {
  new: ["contacted", "lost"],
  contacted: ["call_scheduled", "quote_sent", "lost"],
  call_scheduled: ["quote_sent", "lost"],
  quote_sent: ["accepted", "lost"],
  accepted: ["deposit_paid", "lost"],
  deposit_paid: ["in_planning", "lost"],
  in_planning: ["delivered", "lost"],
  delivered: [],
  lost: [],
};

export function allowedNextStatuses(from: EnquiryStatus): EnquiryStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? [];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Acknowledgement copy. فصحى on the Arabic side — this is a money surface. */
function ackBody(locale: string | null | undefined, name: string) {
  const ar = locale === "ar";
  return ar
    ? {
        subject: "وصلنا طلبكم — زفّة",
        html: `<p>أهلًا ${escapeHtml(name)}،</p>
<p>وصلنا طلبكم بخصوص تنظيم زفافكم بالكامل، وسنعود إليكم قريبًا عبر واتساب لنتحدّث عن يومكم.</p>
<p>لا شيء يبدأ قبل أن تروا السعر وتوافقوا عليه.</p>
<p>— فريق زفّة</p>`,
      }
    : {
        subject: "We've got your enquiry — Zaffa",
        html: `<p>Hi ${escapeHtml(name)},</p>
<p>We've received your enquiry about running your whole wedding, and we'll be in touch shortly on WhatsApp to talk about your day.</p>
<p>Nothing starts until you've seen the price and said yes.</p>
<p>— The Zaffa team</p>`,
      };
}

export const enquiriesRouter = router({
  /**
   * Public submit. Open to anonymous visitors on purpose: the wizard is
   * reachable from the marketing pages, where the middleware has not minted a
   * Supabase user. `ctx.user` is linked opportunistically when present.
   */
  submit: publicProcedure
    .input(
      z
        .object({
          fullName: z.string().trim().min(1).max(120),
          email: z.string().trim().email().max(200).optional(),
          phone: z.string().trim().min(6).max(30).optional(),
          preferredChannel: CHANNEL.default("whatsapp"),
          country: z.string().trim().length(2).toUpperCase().optional(),
          city: z.string().trim().max(120).optional(),
          eventDate: z.coerce.date().optional(),
          dateFlexible: z.boolean().default(false),
          guestBand: z.string().trim().max(40).optional(),
          budgetBand: z.string().trim().max(60).optional(),
          budgetCurrency: z.string().trim().length(3).toUpperCase().optional(),
          message: z.string().trim().max(4000).optional(),
          designId: z.string().uuid().optional(),
          source: SOURCE.default("whole_wedding_home"),
          locale: z.string().trim().max(5).optional(),
          // Honeypot — invisible in the rendered form, so a non-empty value
          // means a bot. We fake success rather than erroring so it stops
          // retrying, exactly as the contact form does.
          hp: z.string().max(0).optional(),
        })
        // Enforced here rather than in the database so the message can be
        // translated and attached to the right field.
        .refine((v) => Boolean(v.email || v.phone), {
          message: "Provide an email address or a phone number",
          path: ["email"],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.hp) {
        logger.info("enquiry.honeypot_tripped");
        return { ok: true as const, id: null };
      }

      const rateKey = ctx.user?.id ?? input.email?.toLowerCase() ?? input.phone ?? "anon";
      await enforceTrpcMany(
        [{ key: "enquiryForm" }, { key: "enquiryFormDaily" }],
        rateKey,
      );

      // Only link a design the submitter can actually claim. A forged id would
      // otherwise attach someone else's render to this lead.
      let designId: string | null = null;
      if (input.designId && ctx.user?.id) {
        const owned = await prisma.venueDesign.findFirst({
          where: { id: input.designId, user_id: ctx.user.id },
          select: { id: true },
        });
        designId = owned?.id ?? null;
      }

      // ---- The row. Everything after this point is best-effort. ----
      const enquiry = await prisma.enquiry.create({
        data: {
          user_id: ctx.user?.id ?? null,
          full_name: input.fullName,
          email: input.email ?? null,
          phone: input.phone ?? null,
          preferred_channel: input.preferredChannel as EnquiryChannel,
          country: input.country ?? null,
          city: input.city ?? null,
          event_date: input.eventDate ?? null,
          date_flexible: input.dateFlexible,
          guest_band: input.guestBand ?? null,
          budget_band: input.budgetBand ?? null,
          budget_currency: input.budgetCurrency ?? null,
          message: input.message ?? null,
          design_id: designId,
          source: input.source,
          locale: input.locale ?? null,
        },
        select: { id: true },
      });

      // Admin fan-out. Response latency is where these deals die, so a
      // failure here is logged loudly but never surfaced to the buyer.
      try {
        await notifyEnquiryReceived({
          enquiryId: enquiry.id,
          fullName: input.fullName,
          city: input.city ?? input.country ?? "—",
          guests: input.guestBand ?? "—",
          channel: input.preferredChannel,
        });
      } catch (err) {
        reportError("enquiry.notify_failed", err, { enquiryId: enquiry.id });
      }

      // Acknowledgement. Deliberately after the row: a missing RESEND_API_KEY
      // is the exact failure that used to lose leads entirely.
      if (input.email && resend) {
        try {
          const body = ackBody(input.locale, input.fullName);
          await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL ?? "hello@zaffa.ai",
            to: input.email,
            subject: body.subject,
            html: body.html,
          });
        } catch (err) {
          reportError("enquiry.ack_email_failed", err, { enquiryId: enquiry.id });
        }
      }

      captureServer(ctx.user?.id ?? enquiry.id, ANALYTICS_EVENTS.ENQUIRY_SUBMITTED, {
        source: input.source,
        country: input.country ?? null,
        guest_band: input.guestBand ?? null,
        budget_band: input.budgetBand ?? null,
        preferred_channel: input.preferredChannel,
        has_design: Boolean(designId),
        authed: Boolean(ctx.user?.id),
      });

      return { ok: true as const, id: enquiry.id };
    }),

  /** The couple's own enquiries, for the "we're on it" dashboard card. */
  mine: protectedProcedure.query(async ({ ctx }) => {
    return prisma.enquiry.findMany({
      where: { user_id: ctx.user.id },
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        status: true,
        created_at: true,
        city: true,
        event_date: true,
        quoted_amount: true,
        quoted_currency: true,
        event_id: true,
      },
    });
  }),

  // ---------------------------------------------------------------- admin --
  // There is no `adminProcedure` in this codebase; every admin router asserts
  // inline as its first statement. Following that convention rather than
  // introducing a second pattern.

  list: protectedProcedure
    .input(
      z.object({
        status: z.nativeEnum(EnquiryStatus).optional(),
        cursor: z.string().uuid().nullish(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const items = await prisma.enquiry.findMany({
        where: input.status ? { status: input.status } : undefined,
        orderBy: { created_at: "desc" },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          status: true,
          full_name: true,
          email: true,
          phone: true,
          preferred_channel: true,
          country: true,
          city: true,
          event_date: true,
          guest_band: true,
          budget_band: true,
          budget_currency: true,
          source: true,
          created_at: true,
        },
      });
      const nextCursor = items.length > input.limit ? items.pop()!.id : null;
      return { items, nextCursor };
    }),

  /** Counts per status — drives the pipeline tabs without a second round-trip. */
  counts: protectedProcedure.query(async ({ ctx }) => {
    await assertAdmin(ctx.user.id);
    const rows = await prisma.enquiry.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<
      Record<EnquiryStatus, number>
    >;
  }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const enquiry = await prisma.enquiry.findUnique({
        where: { id: input.id },
        include: {
          design: {
            select: { id: true, name: true, event_type: true, created_at: true },
          },
          user: { select: { id: true, full_name: true, avatar_url: true } },
          event: { select: { id: true, title: true } },
          notes: {
            orderBy: { created_at: "desc" },
            include: { author: { select: { id: true, full_name: true } } },
          },
        },
      });
      if (!enquiry) throw new TRPCError({ code: "NOT_FOUND" });

      // Their other designs give the operator context for the call without
      // needing a second screen.
      const otherDesigns = enquiry.user_id
        ? await prisma.venueDesign.findMany({
            where: { user_id: enquiry.user_id, ...(enquiry.design_id ? { id: { not: enquiry.design_id } } : {}) },
            orderBy: { created_at: "desc" },
            take: 6,
            select: { id: true, name: true, created_at: true },
          })
        : [];

      return {
        ...enquiry,
        otherDesigns,
        allowedNext: allowedNextStatuses(enquiry.status),
      };
    }),

  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.nativeEnum(EnquiryStatus),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const current = await prisma.enquiry.findUnique({
        where: { id: input.id },
        select: { status: true },
      });
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      if (!allowedNextStatuses(current.status).includes(input.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot move an enquiry from ${current.status} to ${input.status}`,
        });
      }
      return prisma.enquiry.update({
        where: { id: input.id },
        data: { status: input.status, status_changed_at: new Date() },
        select: { id: true, status: true, status_changed_at: true },
      });
    }),

  addNote: protectedProcedure
    .input(
      z.object({
        enquiryId: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.enquiryNote.create({
        data: {
          enquiry_id: input.enquiryId,
          author_id: ctx.user.id,
          body: input.body,
        },
        select: { id: true, created_at: true },
      });
    }),


  /**
   * Turn an accepted enquiry into a real Event the couple can see.
   *
   * Matches an existing Profile by the enquiry's user link first, then by
   * email, and only creates an account as a last resort — a couple who already
   * has a Zaffa account from the free render must not end up with a second
   * one, or their designs and their wedding live in different places.
   */
  convertToEvent: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const enquiry = await prisma.enquiry.findUnique({ where: { id: input.id } });
      if (!enquiry) throw new TRPCError({ code: "NOT_FOUND" });
      if (enquiry.event_id) {
        return { eventId: enquiry.event_id, created: false as const };
      }

      let clientId = enquiry.user_id;

      if (!clientId && enquiry.email) {
        // Supabase owns the email→user mapping; Profile doesn't store email.
        const admin = getSupabaseAdmin();
        const { data } = await admin.auth.admin.listUsers();
        const existing = data?.users?.find(
          (u) => u.email?.toLowerCase() === enquiry.email!.toLowerCase(),
        );
        if (existing) {
          clientId = existing.id;
        } else {
          const { data: created, error } = await admin.auth.admin.inviteUserByEmail(
            enquiry.email,
          );
          if (error || !created?.user) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: `Could not create an account for ${enquiry.email}: ${error?.message ?? "unknown"}`,
            });
          }
          clientId = created.user.id;
        }
      }

      if (!clientId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This enquiry has no email and no linked account, so there is nobody to attach the event to. Capture an email first.",
        });
      }

      // The invite creates an auth user; the profile row may lag behind it.
      await prisma.profile.upsert({
        where: { id: clientId },
        create: { id: clientId, role: "client", full_name: enquiry.full_name },
        update: {},
      });

      const event = await prisma.event.create({
        data: {
          client_id: clientId,
          title: enquiry.city
            ? `${enquiry.full_name} — ${enquiry.city}`
            : enquiry.full_name,
          event_type: "wedding",
          event_date: enquiry.event_date,
          status: "planning",
        },
        select: { id: true },
      });

      await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: {
          event_id: event.id,
          user_id: clientId,
          status: enquiry.status === "quote_sent" ? "accepted" : enquiry.status,
          status_changed_at: new Date(),
        },
      });

      return { eventId: event.id, created: true as const };
    }),

  /**
   * Write the quote as two schedule-less Payment rows and mint a Stripe
   * Payment Link for the deposit.
   *
   * `Payment` rows with `schedule_id = null` are an explicitly supported shape
   * ("legacy manual ledger rows"), which lets the concierge lane reuse the
   * existing refund, dispute and reminder machinery without touching
   * `PaymentSchedule` — that model requires a proposal and a planner, both of
   * which belong to the marketplace we just hid.
   *
   * The amounts are ZAFFA'S FEE ONLY. Vendor money stays vendor-direct until
   * the licensing question is settled; see docs/pricing-full-service.md.
   */
  createQuote: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        total: z.number().positive().max(100_000_000),
        depositAmount: z.number().positive(),
        currency: z.string().trim().length(3).toUpperCase(),
        balanceDueDate: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      if (input.depositAmount > input.total) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The deposit cannot be larger than the total.",
        });
      }
      const enquiry = await prisma.enquiry.findUnique({ where: { id: input.id } });
      if (!enquiry) throw new TRPCError({ code: "NOT_FOUND" });
      if (!enquiry.event_id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Convert the enquiry to an event before quoting.",
        });
      }

      const balance = Number((input.total - input.depositAmount).toFixed(2));

      const deposit = await prisma.payment.create({
        data: {
          event_id: enquiry.event_id,
          schedule_id: null,
          label: "Deposit",
          amount: input.depositAmount,
          currency: input.currency,
          status: "pending",
        },
        select: { id: true },
      });

      const balanceRow =
        balance > 0
          ? await prisma.payment.create({
              data: {
                event_id: enquiry.event_id,
                schedule_id: null,
                label: "Balance",
                amount: balance,
                currency: input.currency,
                status: "pending",
                due_date: input.balanceDueDate ?? null,
              },
              select: { id: true },
            })
          : null;

      const link = await createInstallmentLink({
        installmentId: deposit.id,
        enquiryId: enquiry.id,
        label: `Zaffa — deposit for ${enquiry.full_name}`,
        amount: input.depositAmount,
        currency: input.currency,
      });

      await prisma.payment.update({
        where: { id: deposit.id },
        data: {
          stripe_payment_link_id: link.id,
          payment_link_url: link.url,
          status: "awaiting_payment",
        },
      });

      await prisma.enquiry.update({
        where: { id: enquiry.id },
        data: {
          quoted_amount: input.total,
          quoted_currency: input.currency,
          status: "quote_sent",
          status_changed_at: new Date(),
        },
      });

      return {
        depositId: deposit.id,
        balanceId: balanceRow?.id ?? null,
        paymentLinkUrl: link.url,
      };
    }),

  /** Mint a link for an installment that doesn't have one yet (the balance). */
  createPaymentLink: protectedProcedure
    .input(z.object({ installmentId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      const row = await prisma.payment.findUnique({
        where: { id: input.installmentId },
        select: {
          id: true,
          amount: true,
          currency: true,
          label: true,
          payment_link_url: true,
          event_id: true,
        },
      });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      if (row.payment_link_url) return { paymentLinkUrl: row.payment_link_url };

      const enquiry = await prisma.enquiry.findFirst({
        where: { event_id: row.event_id },
        select: { id: true, full_name: true },
      });

      const link = await createInstallmentLink({
        installmentId: row.id,
        enquiryId: enquiry?.id ?? null,
        label: `Zaffa — ${row.label ?? "payment"}${enquiry ? ` for ${enquiry.full_name}` : ""}`,
        amount: Number(row.amount),
        currency: row.currency,
      });

      await prisma.payment.update({
        where: { id: row.id },
        data: {
          stripe_payment_link_id: link.id,
          payment_link_url: link.url,
          status: "awaiting_payment",
        },
      });
      return { paymentLinkUrl: link.url };
    }),

  setQuote: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        amount: z.number().positive().max(100_000_000),
        currency: z.string().trim().length(3).toUpperCase(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertAdmin(ctx.user.id);
      return prisma.enquiry.update({
        where: { id: input.id },
        data: { quoted_amount: input.amount, quoted_currency: input.currency },
        select: { id: true, quoted_amount: true, quoted_currency: true },
      });
    }),
});

/**
 * Create a single-use Stripe Payment Link for one installment.
 *
 * `restrictions.completed_sessions.limit = 1` matters: these links get
 * forwarded around WhatsApp groups, and without it a relative could pay the
 * deposit twice. The metadata is mirrored onto `payment_intent_data` so it
 * survives onto the charge, which is what the refund and dispute handlers
 * resolve against.
 */
async function createInstallmentLink(args: {
  installmentId: string;
  enquiryId: string | null;
  label: string;
  amount: number;
  currency: string;
}): Promise<{ id: string; url: string }> {
  const stripe = getStripe();
  const metadata: Record<string, string> = {
    kind: CONCIERGE_INSTALLMENT_KIND,
    installmentId: args.installmentId,
  };
  if (args.enquiryId) metadata.enquiryId = args.enquiryId;

  const price = await stripe.prices.create({
    currency: args.currency.toLowerCase(),
    unit_amount: toStripeAmount(args.amount, args.currency),
    product_data: { name: args.label },
  });

  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata,
    payment_intent_data: { metadata },
    restrictions: { completed_sessions: { limit: 1 } },
  });

  return { id: link.id, url: link.url };
}
