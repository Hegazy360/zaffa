import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { prisma } from "@/lib/prisma";
import { isFlagEnabled } from "@/lib/flags";
import { enforceTrpc, ipFromRequest } from "@/lib/rate-limit";
import { trackServer } from "@/lib/posthog";
import { ANALYTICS_EVENTS } from "@/lib/analytics-events";
import {
  loadSharePayload,
  newShareToken,
  numberVersions,
  sharePath,
  shareTokenSchema,
} from "@/server/services/design-shares";

/**
 * Kill switch, checked in every procedure that serves or collects anything
 * (as well as in the UI) because this is the check that cannot lag a flag
 * flip. Off, every live link answers as if it did not exist.
 */
function assertEnabled(): void {
  if (!isFlagEnabled("familyShare")) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "FAMILY_SHARE_DISABLED" });
  }
}

/**
 * The caller's own design, or NOT_FOUND: the same answer for someone else's
 * id as for one that does not exist.
 */
async function ownDesign(designId: string, userId: string) {
  const design = await prisma.venueDesign.findFirst({
    where: { id: designId, user_id: userId },
    select: { id: true },
  });
  if (!design) throw new TRPCError({ code: "NOT_FOUND" });
  return design;
}

/**
 * An anonymous couple has not seen their render until they give an email
 * at the gate: sharing it before then would hand family what the gate is
 * there to trade for that email. Signed-in couples always may.
 */
async function mustPassEmailGate(user: { id: string; is_anonymous: boolean }): Promise<boolean> {
  if (!user.is_anonymous) return false;
  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { free_render_email: true },
  });
  return !profile?.free_render_email;
}

const designInput = z.object({ designId: z.string().uuid() });

export const designSharesRouter = router({
  /**
   * The design's family link: the live one if there is one, else a new one.
   * Idempotent on purpose, so the button can be pressed twice, from two tabs
   * or after a refresh, and everyone still holds the same link.
   */
  create: protectedProcedure.input(designInput).mutation(async ({ ctx, input }) => {
    assertEnabled();
    await ownDesign(input.designId, ctx.user.id);
    if (await mustPassEmailGate(ctx.user)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "EMAIL_REQUIRED" });
    }
    const renders = await prisma.venueDesignMedia.count({
      where: { design_id: input.designId, type: "render" },
    });
    // Nothing to vote on yet: a link to an empty page only confuses family.
    if (renders === 0) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "NO_RENDERS" });
    }

    const live = await prisma.designShare.findFirst({
      where: { design_id: input.designId, revoked_at: null },
      orderBy: { created_at: "desc" },
      select: { token: true },
    });
    if (live) {
      return { token: live.token, path: sharePath(live.token), created: false as const };
    }

    // Only minting spends the bucket: handing back the live link is free.
    await enforceTrpc("shareCreate", ctx.user.id, "SHARE_RATE_LIMITED");
    const share = await prisma.designShare.create({
      data: { design_id: input.designId, token: newShareToken() },
      select: { token: true },
    });
    await trackServer(ctx.user.id, ANALYTICS_EVENTS.DESIGN_SHARED, {
      design_id: input.designId,
      renders,
    });
    return { token: share.token, path: sharePath(share.token), created: true as const };
  }),

  /**
   * Stop sharing: every live link of the design dies at once (a leaked link
   * is the reason to press this). Votes already cast stay with the old
   * link and stop counting. Not behind the kill switch: with the feature
   * off the links are dead anyway, and closing one must always be possible.
   */
  revoke: protectedProcedure.input(designInput).mutation(async ({ ctx, input }) => {
    await ownDesign(input.designId, ctx.user.id);
    const { count } = await prisma.designShare.updateMany({
      where: { design_id: input.designId, revoked_at: null },
      data: { revoked_at: new Date() },
    });
    return { revoked: count };
  }),

  /**
   * The couple's view: their live link, and who voted for which version.
   * Votes are counted across every live link of the design, so two links
   * minted by a double tap never split the family's answer.
   */
  forOwner: protectedProcedure.input(designInput).query(async ({ ctx, input }) => {
    assertEnabled();
    await ownDesign(input.designId, ctx.user.id);
    if (await mustPassEmailGate(ctx.user)) {
      return { needsEmail: true as const, share: null, votes: [], voterCount: 0 };
    }

    const shares = await prisma.designShare.findMany({
      where: { design_id: input.designId, revoked_at: null },
      orderBy: { created_at: "desc" },
      select: { id: true, token: true, created_at: true },
    });
    const newest = shares[0];
    if (!newest) {
      return { needsEmail: false as const, share: null, votes: [], voterCount: 0 };
    }

    const [renders, votes] = await Promise.all([
      prisma.venueDesignMedia.findMany({
        where: { design_id: input.designId, type: "render" },
        select: { id: true, created_at: true },
      }),
      prisma.designVote.findMany({
        where: { share_id: { in: shares.map((s) => s.id) } },
        orderBy: { updated_at: "desc" },
        select: { media_id: true, voter_name: true, comment: true, updated_at: true },
      }),
    ]);
    const numbers = numberVersions(renders);

    const byMedia = new Map<
      string,
      { mediaId: string; number: number; count: number; voters: Array<{ name: string; comment: string | null; at: Date }> }
    >();
    for (const vote of votes) {
      const number = numbers.get(vote.media_id);
      // A vote for a render that is no longer a render of this design.
      if (number === undefined) continue;
      const entry = byMedia.get(vote.media_id) ?? {
        mediaId: vote.media_id,
        number,
        count: 0,
        voters: [],
      };
      entry.count += 1;
      entry.voters.push({ name: vote.voter_name, comment: vote.comment, at: vote.updated_at });
      byMedia.set(vote.media_id, entry);
    }
    const tally = [...byMedia.values()].sort(
      (a, b) => b.count - a.count || a.number - b.number,
    );

    return {
      needsEmail: false as const,
      share: { token: newest.token, path: sharePath(newest.token), createdAt: newest.created_at },
      votes: tally,
      voterCount: tally.reduce((sum, v) => sum + v.count, 0),
    };
  }),

  /**
   * What a family member sees on `/s/[token]`. Public: the token is the
   * permission. NOT_FOUND for an unknown or revoked link.
   */
  getByToken: publicProcedure
    .input(z.object({ token: z.string().max(128) }))
    .query(async ({ input }) => {
      assertEnabled();
      const payload = await loadSharePayload(input.token);
      if (!payload) throw new TRPCError({ code: "NOT_FOUND" });
      return payload;
    }),

  /**
   * A family member's pick. One vote per person per link: `voterKey` is a
   * random id their browser keeps, so a second vote from the same phone
   * changes their answer instead of adding one. Limited per IP, since the
   * voter has no session to key on.
   */
  vote: publicProcedure
    .input(
      z.object({
        token: shareTokenSchema,
        mediaId: z.string().uuid(),
        voterKey: z.string().uuid(),
        voterName: z.string().trim().min(1).max(40),
        comment: z.string().trim().max(280).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertEnabled();
      // Before any read, so a script walking tokens is slowed down too.
      await enforceTrpc(
        "shareVote",
        ctx.req ? ipFromRequest(ctx.req) : "unknown",
        "VOTE_RATE_LIMITED",
      );

      const share = await prisma.designShare.findUnique({
        where: { token: input.token },
        select: {
          id: true,
          revoked_at: true,
          design_id: true,
          design: { select: { user_id: true } },
        },
      });
      if (!share || share.revoked_at) throw new TRPCError({ code: "NOT_FOUND" });

      const media = await prisma.venueDesignMedia.findFirst({
        where: { id: input.mediaId, design_id: share.design_id, type: "render" },
        select: { id: true },
      });
      if (!media) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "MEDIA_NOT_IN_DESIGN" });
      }

      const key = { share_id: share.id, voter_key: input.voterKey };
      const previous = await prisma.designVote.findUnique({
        where: { share_id_voter_key: key },
        select: { media_id: true },
      });
      const comment = input.comment ? input.comment : null;
      await prisma.designVote.upsert({
        where: { share_id_voter_key: key },
        create: { ...key, media_id: media.id, voter_name: input.voterName, comment },
        update: { media_id: media.id, voter_name: input.voterName, comment },
      });

      // On the couple's person: it is their design the family is weighing.
      await trackServer(share.design.user_id, ANALYTICS_EVENTS.DESIGN_VOTE_CAST, {
        design_id: share.design_id,
        first_vote: !previous,
        changed_mind: Boolean(previous && previous.media_id !== media.id),
        has_comment: Boolean(comment),
      });
      return { ok: true as const, mediaId: media.id };
    }),
});
