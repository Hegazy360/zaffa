// The couple's own venue photo (F1): where it lives, and which renders it
// is the "before" of.
//
// Importable from client and server: types only, no Node or Prisma deps.
// The render panel and the reveal page both decide whether to show the
// before/after slider with `compareBeforePhoto`, so the two surfaces can
// never disagree about it.

import type { MediaMode, VenuePhoto } from "@/lib/design-media-meta";

/**
 * Cloudinary folder for a user's venue photos. One folder per user so
 * ownership can be proven from the public id alone: the render path loads
 * the photo from `venue_designs.venue_photo` and must never be steered at
 * someone else's image by a stored or client-supplied value.
 */
export function venuePhotoFolder(userId: string): string {
  return `zaffa-venues/${userId}`;
}

/** True when `publicId` is inside `userId`'s venue folder. */
export function isOwnVenuePublicId(publicId: string, userId: string): boolean {
  return publicId.startsWith(`${venuePhotoFolder(userId)}/`);
}

/**
 * Cloudinary folder for a user's reference images: their own uploads and
 * the Pinterest pins re-hosted for them (`uploadReference`, `rehostUrl`).
 */
export function referenceFolder(userId: string): string {
  return `zaffa-references/${userId}`;
}

/** True when `publicId` is inside `userId`'s reference folder. */
export function isOwnReferencePublicId(publicId: string, userId: string): boolean {
  return publicId.startsWith(`${referenceFolder(userId)}/`);
}

/** The slice of a media row the lineage walk needs. */
export interface LineageRow {
  id: string;
  parent_id: string | null;
  mode: MediaMode | null;
  venuePublicId: string | null;
}

// Refinements chain one row per edit. Far past any real chain (a pack
// allows 60 edits), and it keeps a corrupted parent loop from spinning.
const MAX_LINEAGE_DEPTH = 100;

/**
 * Walk from a render up through the renders it was refined from, and
 * return the render that ties it to the couple's venue photo, or null
 * when the chain never dressed one (a prompt-only render, or an edit of
 * one).
 *
 * That is the dress-venue render at the root when the chain reaches it.
 * A chain can also be cut short: `parent_id` is ON DELETE SET NULL, so
 * deleting a version (the root included) leaves its changes with no
 * parent. A change only records `venuePublicId` when it was made from a
 * dressed venue (see `ai.refineRender`), so the oldest surviving change
 * that recorded one stands in for the lost root, and its recorded photo
 * is checked like the root's would be. Without it, one delete took the
 * venue photo, the "structure is off limits" rule and the slider away
 * from every later change.
 */
export function findDressVenueAncestor(
  mediaId: string,
  rows: readonly LineageRow[],
): LineageRow | null {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  let current = byId.get(mediaId);
  let standIn: LineageRow | null = null;
  for (let depth = 0; current && depth < MAX_LINEAGE_DEPTH; depth++) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    if (current.mode === "dress_venue") return current;
    if (current.mode === "refine" && current.venuePublicId) standIn = current;
    const parent = current.parent_id ? byId.get(current.parent_id) : undefined;
    if (!parent) {
      // A real root that is not a dress anchors nothing. A change with no
      // parent, or one whose parent is gone, is a cut chain.
      const cut = current.mode === "refine" || current.parent_id !== null;
      return cut ? standIn : null;
    }
    current = parent;
  }
  return null;
}

/**
 * The photo to show as "before" next to a render, or null for no slider.
 *
 * Only a render that descends from a dress-venue render gets one, and only
 * while the design still holds the photo that render dressed. A couple who
 * replaced their photo would otherwise see the new venue as the "before"
 * of a render made from the old one, and one who removed it asked for it
 * to be gone. A dress-venue row without a recorded public id (written
 * before the field existed) is trusted to be the current photo.
 */
export function compareBeforePhoto(
  mediaId: string | null | undefined,
  rows: readonly LineageRow[],
  photo: VenuePhoto | null | undefined,
): VenuePhoto | null {
  if (!mediaId || !photo) return null;
  const root = findDressVenueAncestor(mediaId, rows);
  if (!root) return null;
  if (root.venuePublicId && root.venuePublicId !== photo.publicId) return null;
  return photo;
}
