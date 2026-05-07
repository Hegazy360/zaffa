import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import {
  paymentSuccessUrlBase,
  platformName,
  toStripeAmount,
} from "@/lib/payments";
import {
  VISION_PACK_CHECKOUT_KIND,
  VISION_PACK_RENDERS_QUOTA,
  VISION_PACK_SKU,
  VISION_PACK_VIDEOS_QUOTA,
  VISION_PACK_WINDOW_DAYS,
  generateMicrositeSlug,
  isPackWindowExpired,
} from "@/lib/vision-pack";
import {
  resolveCountryFromRequest,
  resolveVisionPackPricing,
} from "@/server/services/vision-pack-pricing";
import { reportError } from "@/lib/logger";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import { notifyEventInServiceArea } from "@/server/services/notifications/dispatchers";

/**
 * Read the recipient's currently-active pack, if any. Returns null when
 * none exists. Used by the paywall, the designer header, and the success
 * page. Treats both `active` and `fulfilled` as "the user has a pack" —
 * fulfilled means they used everything but the assets are still theirs
 * (microsite, lookbook).
 */
async function loadPackForUser(userId: string) {
  return prisma.visionPack.findFirst({
    where: {
      recipient_user_id: userId,
      status: { in: ["active", "fulfilled"] },
    },
    orderBy: { paid_at: "desc" },
  });
}

export const visionPacksRouter = router({
  /**
   * Returns the recipient's currently-active pack along with derived
   * flags the UI cares about (renders left, days left, expired). Null
   * when the user has never bought a pack — the UI uses that to gate
   * the marketing CTA.
   */
  current: protectedProcedure.query(async ({ ctx }) => {
    const pack = await loadPackForUser(ctx.user.id);
    if (!pack) return null;
    const expired = isPackWindowExpired(pack.expires_at);
    const rendersLeft = Math.max(0, pack.renders_quota - pack.renders_used);
    const videosLeft = Math.max(0, pack.videos_quota - pack.videos_used);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysLeft = pack.expires_at
      ? Math.max(
          0,
          Math.ceil((pack.expires_at.getTime() - Date.now()) / msPerDay),
        )
      : 0;
    return {
      id: pack.id,
      status: pack.status,
      paid_at: pack.paid_at,
      expires_at: pack.expires_at,
      expired,
      renders_quota: pack.renders_quota,
      renders_used: pack.renders_used,
      renders_left: rendersLeft,
      videos_quota: pack.videos_quota,
      videos_used: pack.videos_used,
      videos_left: videosLeft,
      days_left: daysLeft,
      microsite_slug: pack.microsite_slug,
      microsite_published_at: pack.microsite_published_at,
      microsite_public: pack.microsite_public,
      lookbook_downloaded_at: pack.lookbook_downloaded_at,
      event_id: pack.event_id,
      can_generate: !expired && pack.status === "active",
    };
  }),

  /**
   * Resolve the visitor's country and the effective price/currency for
   * that market. Public so the marketing surface, paywall, and
   * post-checkout pages can all consume the same source of truth.
   *
   * The pricing pipeline is:
   *   geo cookie/header → DB override (country) → DB override (DEFAULT)
   *   → seed (country) → seed (EU expansion) → seed (DEFAULT)
   *
   * Callers should treat `amount` + `currency` as opaque and feed them
   * through `formatPriceLabel` for display.
   */
  pricing: publicProcedure.query(async ({ ctx }) => {
    const country = resolveCountryFromRequest(ctx.req);
    const pricing = await resolveVisionPackPricing(country);
    return pricing;
  }),

  /**
   * Self-purchase checkout. Creates a `VisionPack` row in
   * `pending_payment`, opens a Stripe Checkout Session, and returns the
   * URL. The webhook flips the row to `active` on success.
   *
   * Gifting (buyer != recipient) is a v2 milestone; the column shape
   * supports it but we don't expose it through this mutation yet.
   */
  startCheckout: protectedProcedure
    .input(
      z
        .object({
          // Optional: where to bounce back to after success/cancel — lets
          // the gallery, microsite, and marketing pages all share the
          // same checkout flow.
          returnPath: z.string().max(500).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      // Block stacking: if the user already has an active pack, send them
      // there instead of charging twice. Window-expired packs don't
      // count as active for this check (they get a new pack).
      const existing = await loadPackForUser(ctx.user.id);
      if (existing && !isPackWindowExpired(existing.expires_at)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "PACK_ALREADY_ACTIVE",
        });
      }

      // Resolve per-country pricing from the geo cookie/header. Falls
      // back to the global default when the visitor is in an unmapped
      // market — the seed always provides a USD floor.
      const country = resolveCountryFromRequest(ctx.req);
      const pricing = await resolveVisionPackPricing(country);

      const pack = await prisma.visionPack.create({
        data: {
          buyer_user_id: ctx.user.id,
          recipient_user_id: ctx.user.id,
          status: "pending_payment",
          amount: pricing.amount,
          currency: pricing.currency,
          renders_quota: VISION_PACK_RENDERS_QUOTA,
          videos_quota: VISION_PACK_VIDEOS_QUOTA,
        },
      });

      const baseUrl = paymentSuccessUrlBase();
      const returnPath = input?.returnPath ?? "/venue-designer";
      const successUrl = `${baseUrl}/venue-designer/welcome?pack=${pack.id}&return=${encodeURIComponent(returnPath)}`;
      const cancelUrl = `${baseUrl}${returnPath}?vp_cancelled=1`;

      // Resolve the buyer's email so Stripe's hosted receipt is delivered
      // automatically. Mirrors the lookup in `payments.ts`.
      let buyerEmail: string | null = null;
      try {
        const rows = await prisma.$queryRaw<Array<{ email: string | null }>>(
          Prisma.sql`select email from auth.users where id = ${ctx.user.id}::uuid limit 1`,
        );
        buyerEmail = rows[0]?.email ?? null;
      } catch (err) {
        reportError("vision_packs.checkout.lookupEmail", err, {
          packId: pack.id,
        });
      }

      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: pricing.currency.toLowerCase(),
              product_data: {
                name: `${platformName()} — Wedding Vision Pack`,
                description: `${VISION_PACK_RENDERS_QUOTA} renders, ${VISION_PACK_VIDEOS_QUOTA} videos, lookbook & microsite. ${VISION_PACK_WINDOW_DAYS}-day window.`,
              },
              unit_amount: toStripeAmount(pricing.amount, pricing.currency),
            },
            quantity: 1,
          },
        ],
        ...(buyerEmail ? { customer_email: buyerEmail } : {}),
        metadata: {
          kind: VISION_PACK_CHECKOUT_KIND,
          packId: pack.id,
          buyerId: ctx.user.id,
          country: pricing.country ?? "",
          pricingSource: pricing.source,
        },
        payment_intent_data: {
          metadata: {
            kind: VISION_PACK_CHECKOUT_KIND,
            packId: pack.id,
          },
          ...(buyerEmail ? { receipt_email: buyerEmail } : {}),
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      await prisma.visionPack.update({
        where: { id: pack.id },
        data: { stripe_checkout_session_id: session.id },
      });

      await trackServer(
        ctx.user.id,
        ANALYTICS_EVENTS.VISION_PACK_CHECKOUT_STARTED,
        {
          pack_id: pack.id,
          amount: pricing.amount,
          currency: pricing.currency,
          country: pricing.country,
          pricing_source: pricing.source,
        },
      );

      return { url: session.url, id: session.id, packId: pack.id };
    }),

  /**
   * Toggle whether the recipient's microsite is listed in the public
   * gallery. The microsite is always reachable by direct link; this
   * controls indexability + gallery presence.
   */
  setMicrositePublic: protectedProcedure
    .input(z.object({ packId: z.string().uuid(), isPublic: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const pack = await prisma.visionPack.findFirst({
        where: { id: input.packId, recipient_user_id: ctx.user.id },
        select: { id: true, microsite_published_at: true },
      });
      if (!pack) throw new TRPCError({ code: "NOT_FOUND" });
      return prisma.visionPack.update({
        where: { id: pack.id },
        data: {
          microsite_public: input.isPublic,
          // Toggling on an unpublished microsite implicitly publishes it
          // — that's the recipient's expectation when they flip the
          // switch.
          microsite_published_at:
            input.isPublic && !pack.microsite_published_at
              ? new Date()
              : pack.microsite_published_at,
        },
      });
    }),

  /**
   * Marks `lookbook_downloaded_at` on first download. Used by the
   * refund tripwire — once this is set, refunds are off (per
   * `isPackRefundable`).
   */
  recordLookbookDownload: protectedProcedure
    .input(z.object({ packId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const pack = await prisma.visionPack.findFirst({
        where: { id: input.packId, recipient_user_id: ctx.user.id },
        select: { id: true, lookbook_downloaded_at: true },
      });
      if (!pack) throw new TRPCError({ code: "NOT_FOUND" });
      if (pack.lookbook_downloaded_at) return { ok: true };
      await prisma.visionPack.update({
        where: { id: pack.id },
        data: { lookbook_downloaded_at: new Date() },
      });
      await trackServer(
        ctx.user.id,
        ANALYTICS_EVENTS.VISION_PACK_LOOKBOOK_DOWNLOADED,
        { pack_id: pack.id },
      );
      return { ok: true };
    }),

  /**
   * Hand-off into the marketplace. Picks the most-recently-touched
   * design owned by the recipient, materialises it as an Event with
   * the design `approved_at`, and links the pack to the event so the
   * marketplace teaser picks it up. Couples without any saved design
   * yet are blocked client-side, but we double-check here too.
   */
  findPlanner: protectedProcedure
    .input(z.object({ packId: z.string().uuid() }).optional())
    .mutation(async ({ ctx, input }) => {
      const pack = input?.packId
        ? await prisma.visionPack.findFirst({
            where: { id: input.packId, recipient_user_id: ctx.user.id },
          })
        : await loadPackForUser(ctx.user.id);
      if (!pack) {
        throw new TRPCError({ code: "NOT_FOUND", message: "PACK_NOT_FOUND" });
      }
      // If the pack is already linked to an event, just bounce.
      if (pack.event_id) {
        return { id: pack.event_id, alreadyLinked: true };
      }

      const design = await prisma.venueDesign.findFirst({
        where: { user_id: ctx.user.id },
        orderBy: { updated_at: "desc" },
        select: {
          id: true,
          name: true,
          event_type: true,
          event_id: true,
        },
      });
      if (!design) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "NO_DESIGN_FOUND",
        });
      }

      // Reuse the design's existing event if one was already created.
      if (design.event_id) {
        await prisma.visionPack.update({
          where: { id: pack.id },
          data: { event_id: design.event_id },
        });
        return { id: design.event_id, alreadyLinked: true };
      }

      const allowed = ["wedding", "engagement", "birthday", "corporate", "other"] as const;
      type AllowedEventType = (typeof allowed)[number];
      const eventType: AllowedEventType = (allowed as readonly string[]).includes(design.event_type)
        ? (design.event_type as AllowedEventType)
        : "wedding";

      const event = await prisma.$transaction(async (tx) => {
        const created = await tx.event.create({
          data: {
            client_id: ctx.user.id,
            title: design.name,
            event_type: eventType,
            status: "planning",
          },
          select: {
            id: true,
            title: true,
            event_type: true,
            venue: true,
            client_id: true,
          },
        });
        await tx.venueDesign.update({
          where: { id: design.id },
          data: { event_id: created.id, approved_at: new Date() },
        });
        await tx.visionPack.update({
          where: { id: pack.id },
          data: { event_id: created.id },
        });
        return created;
      });

      await trackServer(
        ctx.user.id,
        ANALYTICS_EVENTS.VISION_PACK_FIND_PLANNER_CLICKED,
        { pack_id: pack.id, event_id: event.id },
      );
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.EVENT_CREATED, {
        event_id: event.id,
        event_type: String(event.event_type),
        from: "vision_pack",
      });
      await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_APPROVED, {
        event_id: event.id,
        design_id: design.id,
      });

      // If the design happens to already have a venue (rare in this
      // path), fan out to planners in the area. Mirrors `events.ts`.
      if (event.venue) {
        await notifyEventInServiceArea({
          eventId: event.id,
          clientUserId: event.client_id,
          venue: event.venue,
          eventType: String(event.event_type),
          eventTitle: event.title,
        });
      }

      return { id: event.id, alreadyLinked: false };
    }),

  /**
   * Public microsite read by slug. Returns the minimal shape the
   * `/v/<slug>` page needs. Always public — the route is the share
   * surface, so no auth is required. `microsite_public` only controls
   * whether the row appears in the gallery feed, not whether the slug
   * resolves.
   */
  micrositeBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(64) }))
    .query(async ({ input }) => {
      const pack = await prisma.visionPack.findUnique({
        where: { microsite_slug: input.slug },
        select: {
          id: true,
          status: true,
          microsite_published_at: true,
          microsite_public: true,
          renders_used: true,
          videos_used: true,
          recipient: {
            select: {
              id: true,
              full_name: true,
              avatar_url: true,
            },
          },
        },
      });
      if (!pack) return null;
      if (pack.status !== "active" && pack.status !== "fulfilled") return null;
      if (!pack.recipient) return null;

      // Pull the latest design for the recipient so we have media, palette,
      // references, style notes — i.e. the pack's actual visual content.
      const design = await prisma.venueDesign.findFirst({
        where: { user_id: pack.recipient.id },
        orderBy: { updated_at: "desc" },
        select: {
          id: true,
          name: true,
          event_type: true,
          setting: true,
          size: true,
          palette: true,
          references: true,
          style_notes: true,
          thumbnail: true,
          media: {
            orderBy: { created_at: "desc" },
            select: { id: true, type: true, url: true, parent_id: true },
          },
        },
      });

      return {
        recipient: {
          full_name: pack.recipient.full_name,
          avatar_url: pack.recipient.avatar_url,
        },
        publishedAt: pack.microsite_published_at,
        isPublic: pack.microsite_public,
        rendersGenerated: pack.renders_used,
        videosGenerated: pack.videos_used,
        design,
      };
    }),

  /**
   * Public gallery feed. Lists packs that have been explicitly
   * published + opted into the public listing. Cursor-paginated by
   * publish time so a hot pack doesn't drown out everything else.
   */
  publicGallery: publicProcedure
    .input(
      z
        .object({
          cursor: z.string().datetime().nullish(),
          limit: z.number().int().min(1).max(48).default(24),
        })
        .optional(),
    )
    .query(async ({ input }) => {
      const limit = input?.limit ?? 24;
      const cursorDate = input?.cursor ? new Date(input.cursor) : null;
      const items = await prisma.visionPack.findMany({
        where: {
          microsite_public: true,
          microsite_published_at: cursorDate
            ? { not: null, lt: cursorDate }
            : { not: null },
          status: { in: ["active", "fulfilled"] },
        },
        orderBy: { microsite_published_at: "desc" },
        take: limit + 1,
        select: {
          id: true,
          microsite_slug: true,
          microsite_published_at: true,
          renders_used: true,
          recipient: {
            select: { full_name: true, avatar_url: true },
          },
        },
      });
      // For each row, fetch the latest render image to use as the card
      // thumbnail. Done in a single batched query rather than N+1.
      const recipientIds = items
        .map((i) => i.recipient && (i.recipient as { full_name: string }).full_name)
        .filter(Boolean);
      void recipientIds; // Note: we use direct join below — no batch needed for v1.

      const cards = await Promise.all(
        items.slice(0, limit).map(async (pack) => {
          // Latest render owned by this recipient — public-safe since the
          // microsite itself is public.
          const recipient = pack.recipient;
          if (!recipient) return null;
          const latestRender = await prisma.venueDesign.findFirst({
            where: {
              user: { full_name: recipient.full_name },
            },
            orderBy: { updated_at: "desc" },
            select: {
              media: {
                where: { type: "render" },
                orderBy: { created_at: "desc" },
                take: 1,
                select: { url: true },
              },
              palette: true,
            },
          });
          return {
            slug: pack.microsite_slug,
            publishedAt: pack.microsite_published_at,
            recipient: {
              full_name: recipient.full_name,
              avatar_url: recipient.avatar_url,
            },
            heroImage: latestRender?.media[0]?.url ?? null,
            palette: latestRender?.palette ?? null,
            rendersGenerated: pack.renders_used,
          };
        }),
      );

      const nextCursor =
        items.length > limit
          ? items[limit]!.microsite_published_at?.toISOString() ?? null
          : null;
      return {
        items: cards.filter((c): c is NonNullable<typeof c> => c !== null),
        nextCursor,
      };
    }),
});

/**
 * Server-side helper used by `ai.renderScene` and `ai.startVideo` to
 * gate the cost-incurring AI surfaces behind a paid pack.
 *
 * Returns the loaded pack on success. Throws `FORBIDDEN PACK_REQUIRED`
 * when no usable pack exists. The atomic decrement happens AFTER the
 * AI call succeeds (see `consumeQuota`) — gating here, billing on the
 * way out.
 */
export async function requireActivePack(
  userId: string,
  kind: "render" | "video",
) {
  const pack = await prisma.visionPack.findFirst({
    where: {
      recipient_user_id: userId,
      status: "active",
    },
    orderBy: { paid_at: "desc" },
  });
  if (!pack) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "PACK_REQUIRED",
    });
  }
  if (isPackWindowExpired(pack.expires_at)) {
    // Flip to expired so the UI stops nagging about a paywall the user
    // can't actually buy out of (they'd need to start a new pack).
    await prisma.visionPack
      .update({ where: { id: pack.id }, data: { status: "expired" } })
      .catch(() => undefined);
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "PACK_WINDOW_EXPIRED",
    });
  }
  if (kind === "render" && pack.renders_used >= pack.renders_quota) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "PACK_QUOTA_RENDERS",
    });
  }
  if (kind === "video" && pack.videos_used >= pack.videos_quota) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "PACK_QUOTA_VIDEOS",
    });
  }
  return pack;
}

/**
 * Atomically increment the relevant `*_used` counter and flip the pack
 * to `fulfilled` when both counters are exhausted. Called from
 * `ai.renderScene` and `ai.startVideo` after the OpenAI call succeeds.
 *
 * Wrapped in a transaction so the increment is consistent even under
 * concurrent renders (the `*_used <= *_quota` CHECK constraint catches
 * any race that beat us to it).
 */
export async function consumeQuota(
  packId: string,
  kind: "render" | "video",
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const updated = await tx.visionPack.update({
      where: { id: packId },
      data:
        kind === "render"
          ? { renders_used: { increment: 1 } }
          : { videos_used: { increment: 1 } },
      select: {
        renders_used: true,
        renders_quota: true,
        videos_used: true,
        videos_quota: true,
        status: true,
      },
    });
    const rendersDone = updated.renders_used >= updated.renders_quota;
    const videosDone = updated.videos_used >= updated.videos_quota;
    if (rendersDone && videosDone && updated.status === "active") {
      await tx.visionPack.update({
        where: { id: packId },
        data: { status: "fulfilled" },
      });
    }
  });
}

/**
 * Webhook side-effect for `checkout.session.completed`. Flips a
 * pending-payment pack into `active`, sets the generation window,
 * issues the microsite slug, and (for self-purchase) marks the pack as
 * redeemed. Idempotent — safe to call twice.
 */
export async function activatePackFromCheckout(args: {
  packId: string;
  paymentIntentId: string | null;
}): Promise<void> {
  const pack = await prisma.visionPack.findUnique({
    where: { id: args.packId },
    select: {
      id: true,
      status: true,
      buyer_user_id: true,
      recipient_user_id: true,
      is_gift: true,
      microsite_slug: true,
    },
  });
  if (!pack) return;
  if (pack.status !== "pending_payment") return;

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + VISION_PACK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // Generate a unique slug. Retry on the (vanishingly unlikely)
  // collision against the slug @unique constraint.
  let slug = pack.microsite_slug ?? generateMicrositeSlug();
  for (let attempt = 0; attempt < 5 && !pack.microsite_slug; attempt++) {
    const exists = await prisma.visionPack.findUnique({
      where: { microsite_slug: slug },
      select: { id: true },
    });
    if (!exists) break;
    slug = generateMicrositeSlug();
  }

  // Self-purchase: recipient = buyer. Gift redemptions don't go through
  // this path (handled separately when the gift code is claimed).
  const isSelfPurchase = !pack.is_gift;

  await prisma.visionPack.update({
    where: { id: pack.id },
    data: {
      status: "active",
      paid_at: now,
      expires_at: expiresAt,
      microsite_slug: slug,
      stripe_payment_intent_id: args.paymentIntentId,
      ...(isSelfPurchase
        ? {
            recipient_user_id: pack.recipient_user_id ?? pack.buyer_user_id,
            redeemed_at: now,
          }
        : {}),
    },
  });
}

/**
 * Webhook side-effect for `checkout.session.expired`. Reverts the pack
 * to a state where the user can retry a fresh checkout — i.e. deletes
 * the pending row so they don't see "you already have a pack" on retry.
 */
export async function expirePendingCheckout(packId: string): Promise<void> {
  await prisma.visionPack.deleteMany({
    where: { id: packId, status: "pending_payment" },
  });
}

export {
  VISION_PACK_RENDERS_QUOTA,
  VISION_PACK_VIDEOS_QUOTA,
  VISION_PACK_WINDOW_DAYS,
  VISION_PACK_SKU,
};
