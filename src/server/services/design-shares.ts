import "server-only";
import { randomBytes } from "node:crypto";
import { cache } from "react";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { watermarkedUrl } from "@/lib/cloudinary";
import { FREE_PACK_SKU_ID } from "@/lib/vision-pack";
import { parseMediaMeta } from "@/lib/design-media-meta";

// "Ask your family" (F6, docs/plan-design-partner-2026-09.md): a couple
// sends a private link, family open it with no account and vote for the
// version they love. This module is the one place that decides what a share
// link may show, so the tRPC procedure, the page and its link preview can
// never disagree about it.
//
// What a share page may show: the couple's first name, the design's name,
// its renders (tier-watermarked) and, for a talked edit, what the couple
// asked for. Never the venue photo, the notes, the references, the
// Cloudinary ids as fields, what a render cost or which model made it.

/**
 * 16 random bytes, base64url: 22 characters, 128 bits. Unguessable, so the
 * link itself is the permission, and short enough to sit in a WhatsApp
 * message without wrapping twice.
 */
export function newShareToken(): string {
  return randomBytes(16).toString("base64url");
}

/** What a share token can look like. Anything else is refused before a read. */
export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

/** The public path a share token opens. */
export function sharePath(token: string): string {
  return `/s/${token}`;
}

/**
 * Whether the design's owner holds a PAID pack right now (active, or
 * fulfilled with everything spent). Only then may a share page show clean
 * renders.
 *
 * Deliberately stricter than the designer's own tier read: that one picks
 * the newest pack by `paid_at`, and a couple with no pack at all is served
 * clean URLs. A share link travels through WhatsApp groups and link-preview
 * caches, so here "not provably paid" means watermarked.
 */
async function ownerHasPaidPack(userId: string): Promise<boolean> {
  const paid = await prisma.visionPack.count({
    where: {
      recipient_user_id: userId,
      status: { in: ["active", "fulfilled"] },
      sku: { not: FREE_PACK_SKU_ID },
    },
  });
  return paid > 0;
}

/**
 * Version numbers the couple and their family share: 1 for the design's
 * first render, in the order they were made. Both the share page and the
 * couple's vote results number from the design's full list of renders, so
 * "version 3" is the same picture on both sides even when the page has to
 * leave one out.
 */
export function numberVersions(
  rows: ReadonlyArray<{ id: string; created_at: Date }>,
): Map<string, number> {
  const ordered = [...rows].sort(
    (a, b) => a.created_at.getTime() - b.created_at.getTime(),
  );
  return new Map(ordered.map((row, i) => [row.id, i + 1]));
}

/**
 * The first word of the couple's name, for "Help Noor choose". Null when
 * there is no usable name: a missing profile name, or one that is really
 * an email address (never shown to strangers).
 */
export function coupleFirstName(fullName: string | null | undefined): string | null {
  const first = fullName?.trim().split(/\s+/)[0] ?? "";
  if (!first || first.includes("@") || first.length > 40) return null;
  return first;
}

/** The designer's placeholder name says nothing to a family member. */
const DEFAULT_DESIGN_NAME = "Untitled Design";

function publicDesignName(name: string | null | undefined): string | null {
  const trimmed = name?.trim() ?? "";
  if (!trimmed || trimmed === DEFAULT_DESIGN_NAME) return null;
  return trimmed.slice(0, 120);
}

/** A caption is the couple's own words for a talked edit, capped for layout. */
const CAPTION_MAX = 280;

export interface SharedVersion {
  /** The render's media id, what a vote names. */
  id: string;
  /** 1-based, in the order the design's renders were made. */
  number: number;
  /** Tier URL: watermarked unless the owner holds a paid pack. */
  url: string;
  /** What the couple asked to change, for a talked edit. */
  caption: string | null;
}

export interface SharePayload {
  coupleName: string | null;
  designName: string | null;
  /** Oldest first. */
  versions: SharedVersion[];
}

interface LoadedShare {
  coupleName: string | null;
  designName: string | null;
  paid: boolean;
  renders: Array<{
    id: string;
    number: number;
    url: string;
    publicId: string | null;
    caption: string | null;
  }>;
}

/**
 * One read per request for a live share (the page, its metadata and its
 * link preview all ask), null for a malformed, unknown or revoked token.
 */
const loadShare = cache(async (token: string): Promise<LoadedShare | null> => {
  if (!shareTokenSchema.safeParse(token).success) return null;
  const share = await prisma.designShare.findUnique({
    where: { token },
    select: {
      revoked_at: true,
      design: {
        select: {
          name: true,
          user_id: true,
          user: { select: { full_name: true } },
          media: {
            where: { type: "render" },
            orderBy: { created_at: "asc" },
            select: {
              id: true,
              url: true,
              cloudinary_public_id: true,
              meta: true,
              created_at: true,
            },
          },
        },
      },
    },
  });
  if (!share || share.revoked_at) return null;

  const { design } = share;
  const paid = await ownerHasPaidPack(design.user_id);
  const numbers = numberVersions(design.media);
  return {
    coupleName: coupleFirstName(design.user.full_name),
    designName: publicDesignName(design.name),
    paid,
    renders: design.media.map((row) => {
      const meta = parseMediaMeta(row.meta);
      const caption =
        meta?.mode === "refine" && meta.instructionRaw?.trim()
          ? meta.instructionRaw.trim().slice(0, CAPTION_MAX)
          : null;
      return {
        id: row.id,
        number: numbers.get(row.id) ?? 0,
        url: row.url,
        publicId: row.cloudinary_public_id,
        caption,
      };
    }),
  };
});

/**
 * What `/s/[token]` shows, or null when the link is not live.
 *
 * A free couple's render is only ever served watermarked. A render with no
 * Cloudinary public id (legacy, provider-hosted) cannot be watermarked, so
 * on a free couple's page it is left out rather than shown clean.
 */
export async function loadSharePayload(token: string): Promise<SharePayload | null> {
  const share = await loadShare(token);
  if (!share) return null;
  const versions: SharedVersion[] = [];
  for (const render of share.renders) {
    if (share.paid) {
      versions.push({ id: render.id, number: render.number, url: render.url, caption: render.caption });
    } else if (render.publicId) {
      versions.push({
        id: render.id,
        number: render.number,
        url: watermarkedUrl(render.publicId),
        caption: render.caption,
      });
    }
  }
  return { coupleName: share.coupleName, designName: share.designName, versions };
}

/**
 * The link preview for a share: the couple's first name and the newest
 * render, ALWAYS watermarked whatever the tier, because a preview is copied
 * into the caches of every server the link passes through. Null when the
 * link is not live; `imageUrl` is null when no render can be watermarked.
 */
export async function loadShareOgCard(
  token: string,
): Promise<{ coupleName: string | null; imageUrl: string | null } | null> {
  const share = await loadShare(token);
  if (!share) return null;
  const newest = [...share.renders].reverse().find((r) => r.publicId);
  return {
    coupleName: share.coupleName,
    imageUrl: newest?.publicId ? watermarkedUrl(newest.publicId) : null,
  };
}
