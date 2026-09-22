// Typed shapes for the JSON columns the design partner release added
// (docs/plan-design-partner-2026-09.md, F0):
//
//   - `venue_designs.venue_photo`: the couple's own venue photo.
//   - `venue_design_media.meta`: how a render was made (mode, model, cost,
//     the refine instruction that produced it, the cached decor analysis).
//
// Both columns are `Json?` in Prisma, so every read comes back as
// `unknown`-ish data that older code, a half-finished write or a hand edit
// in the dashboard may have shaped differently. The parse helpers below are
// the only way code should read them: they never throw, and they return
// null rather than a half-trusted object when the essentials are missing.
// A render with unreadable meta must still render; it just loses its
// provenance.
//
// Importable from client and server: zod only, no Node or Prisma deps.

import { z } from "zod";

/** The couple's venue photo, as uploaded through `venueDesigns.uploadVenuePhoto`. */
export const venuePhotoSchema = z.object({
  url: z.string().url().startsWith("https://"),
  publicId: z.string().min(1).max(300),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

export type VenuePhoto = z.infer<typeof venuePhotoSchema>;

/**
 * How a render row came to be. `generate` is the classic prompt-only render,
 * `dress_venue` decorates the couple's own photo (F1), `refine` is a talked
 * edit of an earlier render (F2, the row's `parent_id` is the source).
 */
export const MEDIA_MODES = ["generate", "dress_venue", "refine"] as const;
export type MediaMode = (typeof MEDIA_MODES)[number];

/**
 * Every optional field `.catch(undefined)`s on its own, so one malformed
 * value (a cost written as a string, say) drops that field instead of
 * throwing away the whole provenance record. `mode` is the one field we
 * refuse to guess: without it the row is treated as having no meta.
 *
 * `looseObject` on purpose: keys a later feature adds (F4's decor analysis
 * grows over time) survive a read-modify-write by code that predates them.
 */
export const mediaMetaSchema = z.looseObject({
  mode: z.enum(MEDIA_MODES),
  model: z.string().optional().catch(undefined),
  costUsd: z.number().nonnegative().optional().catch(undefined),
  /** What the couple typed, verbatim, in whatever language or dialect. */
  instructionRaw: z.string().optional().catch(undefined),
  /** The normalised English edit the image model actually received. */
  instructionEn: z.string().optional().catch(undefined),
  /** Short confirmation shown back to the couple, in their language. */
  confirmation: z.string().optional().catch(undefined),
  /** Cloudinary public id of the venue photo a `dress_venue` render used. */
  venuePublicId: z.string().optional().catch(undefined),
  // Typed by F4 (decor plan). Kept as an opaque record until then so F0
  // does not have to guess the analysis shape.
  decor: z.record(z.string(), z.unknown()).optional().catch(undefined),
});

export type MediaMeta = z.infer<typeof mediaMetaSchema>;

/** Tolerant read of `venue_design_media.meta`. Never throws. */
export function parseMediaMeta(json: unknown): MediaMeta | null {
  try {
    const parsed = mediaMetaSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Tolerant read of `venue_designs.venue_photo`. Never throws. */
export function parseVenuePhoto(json: unknown): VenuePhoto | null {
  try {
    const parsed = venuePhotoSchema.safeParse(json);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * The slice of a media row's meta that may reach the couple's browser.
 * `model` and `costUsd` are ours (what we pay which provider per image),
 * and `instructionEn` is a prompt-engineering artefact, so none of them
 * leave the server. Returns null when the row has no readable meta.
 */
export interface ClientMediaMeta {
  mode: MediaMode;
  instructionRaw: string | null;
  confirmation: string | null;
  /**
   * The venue photo a dress-venue render dressed. The couple's own photo,
   * so nothing to hide; the designer needs it to tell whether the photo on
   * the design now is still this render's "before".
   */
  venuePublicId: string | null;
}

export function toClientMediaMeta(json: unknown): ClientMediaMeta | null {
  const meta = parseMediaMeta(json);
  if (!meta) return null;
  return {
    mode: meta.mode,
    instructionRaw: meta.instructionRaw ?? null,
    confirmation: meta.confirmation ?? null,
    venuePublicId: meta.venuePublicId ?? null,
  };
}
