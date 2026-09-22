import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";
import {
  router,
  protectedProcedure,
  publicProcedure,
  nonAnonymousProcedure,
} from "../trpc";
import { prisma } from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { paymentSuccessUrlBase, platformName } from "@/lib/payments";
import {
  DEFAULT_PACK_SKU,
  FREE_PACK_SKU_ID,
  PACK_SKUS,
  PACK_SKU_ORDER,
  PURCHASABLE_PACK_SKUS,
  type PackSkuId,
  VISION_PACK_CHECKOUT_KIND,
  VISION_PACK_UPGRADE_CHECKOUT_KIND,
  VISION_PACK_WINDOW_DAYS,
  generateMicrositeSlug,
  getPackSku,
  isFreePack,
  isPackExhausted,
  isPackWindowExpired,
  requirePackSku,
} from "@/lib/vision-pack";
import {
  resolveAllVisionPackPricing,
  resolveCountryFromRequest,
  resolveVisionPackPricing,
} from "@/server/services/vision-pack-pricing";
import { reportError } from "@/lib/logger";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";

const packSkuSchema = z.enum(
  Object.keys(PACK_SKUS) as [PackSkuId, ...PackSkuId[]],
);

/**
 * Only the paid tiers are valid SKUs for `startCheckout`. The free SKU
 * is granted server-side via `ensureFreePack` and never sold through
 * Stripe.
 */
const purchasableSkuSchema = z.enum(
  PURCHASABLE_PACK_SKUS as readonly PackSkuId[] as [PackSkuId, ...PackSkuId[]],
);

/**
 * Read the recipient's currently-active pack, if any. Returns null when
 * none exists. Used by the paywall, the designer header, and the success
 * page. Treats both `active` and `fulfilled` as "the user has a pack" -
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
   * when the user has never bought a pack, the UI uses that to gate
   * the marketing CTA.
   */
  current: protectedProcedure.query(async ({ ctx }) => {
    const pack = await loadPackForUser(ctx.user.id);
    if (!pack) return null;
    const expired = isPackWindowExpired(pack.expires_at);
    const rendersLeft = Math.max(0, pack.renders_quota - pack.renders_used);
    const videosLeft = Math.max(0, pack.videos_quota - pack.videos_used);
    const editsLeft = Math.max(0, pack.edits_quota - pack.edits_used);
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysLeft = pack.expires_at
      ? Math.max(
          0,
          Math.ceil((pack.expires_at.getTime() - Date.now()) / msPerDay),
        )
      : 0;
    const skuMeta = getPackSku(pack.sku);
    return {
      id: pack.id,
      sku: pack.sku,
      sku_name: skuMeta?.name ?? pack.sku,
      includes_planner_match: skuMeta?.includesPlannerMatch ?? false,
      includes_venue_recs: skuMeta?.includesVenueRecs ?? false,
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
      edits_quota: pack.edits_quota,
      edits_used: pack.edits_used,
      edits_left: editsLeft,
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
   * Targeted post-checkout poll. The success page lands at
   * `/venue-designer/welcome?pack=<id>[&upgrade=<id>]` and needs to
   * watch *that specific* pack/upgrade row flip from `pending_payment`
   * to `active`, not "the user's currently-active pack" - otherwise a
   * pre-existing free `wedding_free_taste_v1` (or a previously active
   * paid pack on the upgrade path) makes `current` return `active`
   * immediately and the success page bounces the user to the return
   * URL before the webhook has actually credited the purchase.
   *
   * Scoped to the recipient so users can't poll a stranger's pack;
   * returns null when the id doesn't belong to them so the caller
   * stays on the spinner / stalled state instead of crashing.
   */
  checkoutStatus: protectedProcedure
    .input(
      z.object({
        packId: z.string().min(1).optional(),
        upgradeId: z.string().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!input.packId && !input.upgradeId) return null;

      // Upgrade flow takes precedence: during an upgrade, the parent
      // pack row is already `active`, only the upgrade row carries
      // the pending-payment state we're waiting on. Once it flips,
      // `activateUpgradeFromCheckout` has already bumped pack.sku +
      // quotas, so it's safe to bounce the user back.
      if (input.upgradeId) {
        const upgrade = await prisma.visionPackUpgrade.findUnique({
          where: { id: input.upgradeId },
          select: {
            id: true,
            status: true,
            to_sku: true,
            pack: {
              select: {
                id: true,
                recipient_user_id: true,
              },
            },
          },
        });
        if (!upgrade || upgrade.pack.recipient_user_id !== ctx.user.id) {
          return null;
        }
        return {
          kind: "upgrade" as const,
          status: upgrade.status,
          packId: upgrade.pack.id,
          sku: upgrade.to_sku,
          ready: upgrade.status === "active",
        };
      }

      const pack = await prisma.visionPack.findUnique({
        where: { id: input.packId! },
        select: {
          id: true,
          sku: true,
          status: true,
          recipient_user_id: true,
        },
      });
      if (!pack || pack.recipient_user_id !== ctx.user.id) return null;
      return {
        kind: "pack" as const,
        status: pack.status,
        packId: pack.id,
        sku: pack.sku,
        ready: pack.status === "active" || pack.status === "fulfilled",
      };
    }),

  /**
   * Resolve the visitor's country and the effective price/currency for
   * that market. Public so the marketing surface, paywall, and
   * post-checkout pages can all consume the same source of truth.
   *
   * The pricing pipeline is:
   *   geo cookie/header → DB override (sku, country) → DB override
   *   (sku, DEFAULT) → seed (country) → seed (EU expansion) → seed
   *   (DEFAULT)
   *
   * Pass a SKU to fetch a single tier's price; omit it to fetch every
   * tier in one round-trip (used by the home/comparison surfaces).
   *
   * Callers should treat `amount` + `currency` as opaque and feed them
   * through `formatPriceLabel` for display.
   */
  pricing: publicProcedure
    .input(z.object({ sku: packSkuSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const country = resolveCountryFromRequest(ctx.req);
      if (input?.sku) {
        const pricing = await resolveVisionPackPricing(country, input.sku);
        return { country, tiers: [pricing] };
      }
      const tiers = await resolveAllVisionPackPricing(country, PACK_SKU_ORDER);
      return { country, tiers };
    }),

  /**
   * Self-purchase checkout. Creates a `VisionPack` row in
   * `pending_payment`, opens a Stripe Checkout Session, and returns the
   * URL. The webhook flips the row to `active` on success.
   *
   * Gifting (buyer != recipient) is a v2 milestone; the column shape
   * supports it but we don't expose it through this mutation yet.
   *
   * Only purchasable SKUs (`wedding_design_pack_v1` and
   * `wedding_vision_pack_v1`) are accepted here, the free SKU is
   * granted server-side via `ensureFreePack` and never sold.
   */
  startCheckout: nonAnonymousProcedure
    .input(
      z
        .object({
          // Which tier the user is buying. Defaults to the entry-tier
          // Design Pack so legacy CTAs that never passed a SKU still
          // resolve to a valid SKU.
          sku: purchasableSkuSchema.optional(),
          // Optional: where to bounce back to after success/cancel, lets
          // the gallery, microsite, and marketing pages all share the
          // same checkout flow.
          returnPath: z.string().max(500).optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      // Block stacking: if the user already has an active *paid* pack,
      // send them there instead of charging twice. Free packs do not
      // count as "active" for this check, buying a paid tier should
      // always be available even when the free render hasn't been used
      // yet (free pack stays as historical state once paid is granted).
      // Window-expired packs also don't count.
      const existing = await loadPackForUser(ctx.user.id);
      if (
        existing &&
        !isFreePack(existing.sku) &&
        !isPackWindowExpired(existing.expires_at)
      ) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "PACK_ALREADY_ACTIVE",
        });
      }

      const skuId: PackSkuId = input?.sku ?? DEFAULT_PACK_SKU;
      const skuMeta = requirePackSku(skuId);

      // Resolve per-country pricing from the geo cookie/header. Falls
      // back to the global default when the visitor is in an unmapped
      // market, the seed always provides a USD floor.
      const country = resolveCountryFromRequest(ctx.req);
      const pricing = await resolveVisionPackPricing(country, skuId);

      const pack = await prisma.visionPack.create({
        data: {
          sku: skuId,
          buyer_user_id: ctx.user.id,
          recipient_user_id: ctx.user.id,
          status: "pending_payment",
          // `amount` is in minor units (e.g. 1999 for $19.99), see
          // schema comment on VisionPack.amount.
          amount: pricing.amount,
          currency: pricing.currency,
          // Stamp the original-market country so a later upgrade
          // resolves the destination tier's price in the SAME market
          // (USD → USD delta even if the buyer relocates).
          purchase_country: pricing.country ?? null,
          renders_quota: skuMeta.quotas.renders,
          videos_quota: skuMeta.quotas.videos,
          edits_quota: skuMeta.quotas.edits,
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
      const venueDescriptor = skuMeta.includesVenueRecs
        ? " plus curated venue recommendations"
        : "";
      const plannerDescriptor = skuMeta.includesPlannerMatch
        ? " and an optional planner match"
        : "";
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: pricing.currency.toLowerCase(),
              product_data: {
                name: `${platformName()} - ${skuMeta.name}`,
                description: `${skuMeta.quotas.renders} renders, ${skuMeta.quotas.videos} videos, lookbook & microsite${venueDescriptor}${plannerDescriptor}. ${skuMeta.durationDays}-day window.`,
              },
              // DB amounts are already in Stripe's smallest-currency
              // units, so we forward them verbatim.
              unit_amount: pricing.amount,
            },
            quantity: 1,
          },
        ],
        ...(buyerEmail ? { customer_email: buyerEmail } : {}),
        metadata: {
          kind: VISION_PACK_CHECKOUT_KIND,
          packId: pack.id,
          sku: skuId,
          buyerId: ctx.user.id,
          country: pricing.country ?? "",
          pricingSource: pricing.source,
        },
        payment_intent_data: {
          metadata: {
            kind: VISION_PACK_CHECKOUT_KIND,
            packId: pack.id,
            sku: skuId,
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
          sku: skuId,
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
          //, that's the recipient's expectation when they flip the
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
   * refund tripwire - once this is set, refunds are off (per
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
   * Public microsite read by slug. Returns the minimal shape the
   * `/v/<slug>` page needs. Always public, the route is the share
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
      // references, style notes - i.e. the pack's actual visual content.
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
});

/**
 * Server-side helper used by `ai.renderScene` and `ai.startVideo` to
 * gate the cost-incurring AI surfaces behind a paid (or free) pack.
 *
 * Returns the loaded pack on success. Throws `FORBIDDEN PACK_REQUIRED`
 * when no usable pack exists. The atomic decrement happens AFTER the
 * AI call succeeds (see `consumeQuota`) - gating here, billing on the
 * way out.
 *
 * The free email-gated tier (`wedding_free_taste_v1`) participates in
 * the same quota plumbing, `requireActivePack` doesn't distinguish
 * tiers. Callers that want tier-specific behaviour (e.g. videos blocked
 * on free) inspect `pack.sku` on the returned row.
 */
export async function requireActivePack(
  userId: string,
  kind: "render" | "video" | "edit",
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
    // A free taste whose one render is spent now stays `active` while its
    // edits last (see `isPackExhausted`). Before edits existed it flipped to
    // `fulfilled` and this path threw PACK_REQUIRED, which opens the
    // "Unlock generation" paywall. Keep that: "you've used everything in
    // your pack" is the wrong thing to tell someone who never bought one.
    throw new TRPCError({
      code: "FORBIDDEN",
      message: isFreePack(pack.sku) ? "PACK_REQUIRED" : "PACK_QUOTA_RENDERS",
    });
  }
  if (kind === "video" && pack.videos_used >= pack.videos_quota) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "PACK_QUOTA_VIDEOS",
    });
  }
  // A read-only pre-check so the paywall opens before any LLM or image
  // work starts. It is not the guarantee: two concurrent refinements can
  // both pass it. `reserveEdit` is the atomic gate that actually holds.
  if (kind === "edit" && pack.edits_used >= pack.edits_quota) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "PACK_QUOTA_EDITS",
    });
  }
  return pack;
}

/**
 * Grant the free `wedding_free_taste_v1` pack to a user who doesn't
 * have any active pack yet. Idempotent: if the user already has any
 * active pack (free or paid), this is a no-op and returns the existing
 * row. Otherwise creates a new free pack with renders_quota=1,
 * edits_quota=3 and a 7-day window.
 *
 * Called at the top of `ai.renderScene` so anonymous + not-yet-paid
 * users can run exactly one render. The email-uniqueness check in
 * `auth.requestEmailUpgrade` ensures a single email can't burn through
 * multiple free renders across browsers.
 */
export async function ensureFreePack(userId: string) {
  const existing = await prisma.visionPack.findFirst({
    where: {
      recipient_user_id: userId,
      status: { in: ["active", "fulfilled"] },
    },
    orderBy: { paid_at: "desc" },
  });
  if (existing) return existing;

  const skuMeta = requirePackSku(FREE_PACK_SKU_ID);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + skuMeta.durationDays * 24 * 60 * 60 * 1000,
  );
  return prisma.visionPack.create({
    data: {
      sku: FREE_PACK_SKU_ID,
      buyer_user_id: userId,
      recipient_user_id: userId,
      status: "active",
      // No Stripe linkage, amount in minor units is zero and the
      // currency column stays at its schema default (EGP). Display
      // helpers never format the free pack price; `amount === 0` is
      // the canonical signal.
      amount: 0,
      paid_at: now,
      expires_at: expiresAt,
      renders_quota: skuMeta.quotas.renders,
      videos_quota: skuMeta.quotas.videos,
      edits_quota: skuMeta.quotas.edits,
      // Self-purchase shape so the microsite paths behave
      // even though those features are blocked at the SKU layer.
      redeemed_at: now,
    },
  });
}

/**
 * Atomically increment the relevant `*_used` counter and flip the pack
 * to `fulfilled` when every counter (renders, videos AND edits) is
 * exhausted. Called from `ai.renderScene` and `ai.startVideo` after the
 * model call succeeds. Edits do not come through here, they are reserved
 * up front by `reserveEdit`.
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
        edits_used: true,
        edits_quota: true,
        status: true,
      },
    });
    if (isPackExhausted(updated) && updated.status === "active") {
      await tx.visionPack.update({
        where: { id: packId },
        data: { status: "fulfilled" },
      });
    }
  });
}

/**
 * Reserve one edit on the pack BEFORE the edit model is called. Returns
 * false when nothing was reserved (pack not active, or no edits left), in
 * which case the caller must not spend anything.
 *
 * Why reserve-first rather than bill-after like renders: refining invites
 * double-taps, and a read-then-bill gate lets N parallel requests all pass
 * the read, all pay the provider, and then all but one die on the
 * `edits_used <= edits_quota` CHECK with the image already paid for and
 * orphaned. The conditional UPDATE is the gate: Postgres row-locks the
 * pack, so exactly `edits_quota - edits_used` concurrent callers get a row
 * back and everyone else gets none.
 *
 * The comparison is column-to-column (`edits_used < edits_quota`), which
 * Prisma's `updateMany` cannot express, hence raw SQL. The same statement
 * flips the pack to `fulfilled` when this edit was the last thing left
 * anywhere on it. SET expressions all read the pre-update row, so
 * `edits_used + 1` is the new value; the rule mirrors `isPackExhausted`.
 * `updated_at` is set by hand because `@updatedAt` is a Prisma-client
 * feature raw SQL bypasses, and scripts/pulse.mjs reads it.
 *
 * Callers pair every successful reserve with `releaseEdit` on failure.
 */
export async function reserveEdit(packId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    UPDATE vision_packs
       SET edits_used = edits_used + 1,
           status = CASE
             WHEN renders_used >= renders_quota
              AND videos_used >= videos_quota
              AND edits_used + 1 >= edits_quota
             THEN 'fulfilled'::"VisionPackStatus"
             ELSE status
           END,
           updated_at = now()
     WHERE id = ${packId}::uuid
       AND status = 'active'::"VisionPackStatus"
       AND edits_used < edits_quota
    RETURNING id
  `);
  return rows.length > 0;
}

/**
 * Give back an edit reserved by `reserveEdit` when the edit then failed
 * (model error, safety block, upload failure). `GREATEST` keeps a double
 * release from ever driving the counter negative into the CHECK.
 *
 * If the reservation was the pack's last unit it flipped the pack to
 * `fulfilled`; handing the unit back reopens it, otherwise the couple
 * would lose the edit they never received. Only `fulfilled` is reopened,
 * an `expired` or `refunded` pack stays where it is.
 */
export async function releaseEdit(packId: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE vision_packs
       SET edits_used = GREATEST(edits_used - 1, 0),
           status = CASE
             WHEN status = 'fulfilled'::"VisionPackStatus" AND edits_used > 0
             THEN 'active'::"VisionPackStatus"
             ELSE status
           END,
           updated_at = now()
     WHERE id = ${packId}::uuid
  `);
}

/**
 * Webhook side-effect for `checkout.session.completed`. Flips a
 * pending-payment pack into `active`, sets the generation window,
 * issues the microsite slug, and (for self-purchase) marks the pack as
 * redeemed. Idempotent, safe to call twice.
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
      sku: true,
      edits_quota: true,
    },
  });
  if (!pack) return;
  if (pack.status !== "pending_payment") return;

  // Quotas are stamped at checkout, not here. But a checkout opened by the
  // build that predates edits (F2) wrote the column default, 0, and the
  // migration's backfill only saw the rows that existed when it ran. Top
  // such a row up to the registry's allowance on activation, so a couple
  // whose payment straddled the deploy is not sold a pack with no changes.
  const skuEdits = getPackSku(pack.sku)?.quotas.edits ?? 0;
  const editsBackfill =
    pack.edits_quota === 0 && skuEdits > 0 ? { edits_quota: skuEdits } : {};

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
      ...editsBackfill,
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
 * to a state where the user can retry a fresh checkout, i.e. deletes
 * the pending row so they don't see "you already have a pack" on retry.
 */
export async function expirePendingCheckout(packId: string): Promise<void> {
  await prisma.visionPack.deleteMany({
    where: { id: packId, status: "pending_payment" },
  });
}

/**
 * Webhook side-effect for `checkout.session.completed` when the
 * `kind` metadata is `vision_pack_upgrade`. Atomically:
 *   - flips the `VisionPackUpgrade` row to `active` with a `paid_at`
 *   - bumps the pack's `sku` to the destination tier
 *   - **adds** (not replaces) the destination tier's quota delta to
 *     the pack's `renders_quota` / `videos_quota` / `edits_quota` so already-used
 *     renders aren't double-counted
 *   - resets `paid_at` + `expires_at` so the refund window and
 *     generation window both start from the most recent payment
 *   - re-activates a `fulfilled` pack (quota delta is fresh capacity)
 *
 * Idempotent, short-circuits if the upgrade row is already `active`
 * so webhook retries are safe.
 */
export async function activateUpgradeFromCheckout(args: {
  upgradeId: string;
  paymentIntentId: string | null;
}): Promise<void> {
  const upgrade = await prisma.visionPackUpgrade.findUnique({
    where: { id: args.upgradeId },
    select: {
      id: true,
      pack_id: true,
      from_sku: true,
      to_sku: true,
      status: true,
    },
  });
  if (!upgrade) return;
  if (upgrade.status === "active") return;

  const fromMeta = getPackSku(upgrade.from_sku);
  const toMeta = getPackSku(upgrade.to_sku);
  if (!fromMeta || !toMeta) {
    // Unknown SKUs, fail loudly into the webhook logger but don't
    // throw so Stripe doesn't retry endlessly. An ops alert in
    // `cron.upgrade.unknown_sku` can be wired up separately.
    return;
  }

  const rendersDelta = Math.max(
    0,
    toMeta.quotas.renders - fromMeta.quotas.renders,
  );
  const videosDelta = Math.max(
    0,
    toMeta.quotas.videos - fromMeta.quotas.videos,
  );
  const editsDelta = Math.max(
    0,
    toMeta.quotas.edits - fromMeta.quotas.edits,
  );

  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + toMeta.durationDays * 24 * 60 * 60 * 1000,
  );

  await prisma.$transaction(async (tx) => {
    await tx.visionPackUpgrade.update({
      where: { id: upgrade.id },
      data: {
        status: "active",
        paid_at: now,
        stripe_payment_intent_id: args.paymentIntentId,
      },
    });
    await tx.visionPack.update({
      where: { id: upgrade.pack_id },
      data: {
        sku: upgrade.to_sku,
        renders_quota: { increment: rendersDelta },
        videos_quota: { increment: videosDelta },
        edits_quota: { increment: editsDelta },
        // Refund window + generation window now start from the latest
        // payment. The original `paid_at` is preserved on the upgrade
        // row for audit.
        paid_at: now,
        expires_at: expiresAt,
        // A `fulfilled` pack regains capacity from the upgrade -
        // re-activate so the user can keep generating.
        status: "active",
      },
    });
  });
}

export {
  PACK_SKUS,
  VISION_PACK_WINDOW_DAYS,
};
