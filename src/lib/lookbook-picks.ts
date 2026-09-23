// Which renders the lookbook's design partner pages are about (F4). Pure, so
// the choices can be tested without Chromium, Prisma or a model.

import { parseMediaMeta, parseVenuePhoto, type VenuePhoto } from "@/lib/design-media-meta";

export interface LookbookMediaRow {
  id: string;
  type: string;
  meta?: unknown;
}

/**
 * The render the plan prices: the one the couple chose when it is still a
 * render of this design, else the newest. `media` is newest first, as the
 * route reads it.
 */
export function pickPlanRender<T extends LookbookMediaRow>(
  media: readonly T[],
  selectedMediaId: string | null | undefined,
): T | null {
  const renders = media.filter((m) => m.type === "render");
  return (
    (selectedMediaId ? renders.find((m) => m.id === selectedMediaId) : undefined) ??
    renders[0] ??
    null
  );
}

/**
 * The couple's venue photo next to a render that dressed THAT photo.
 *
 * A dress render records the public id of the photo it decorated. If the
 * couple has since swapped the photo, that render dressed a different room
 * and would make a false "before and after", so it is skipped. A render
 * without the id (written before it was recorded) is taken at its word.
 * The chosen version wins when it qualifies, else the newest that does.
 */
export function pickBeforeAfter<T extends LookbookMediaRow>(
  venuePhotoJson: unknown,
  media: readonly T[],
  selectedMediaId: string | null | undefined,
): { venuePhoto: VenuePhoto; render: T } | null {
  const venuePhoto = parseVenuePhoto(venuePhotoJson);
  if (!venuePhoto) return null;
  const dressed = media.filter((m) => {
    if (m.type !== "render") return false;
    const meta = parseMediaMeta(m.meta);
    if (meta?.mode !== "dress_venue") return false;
    return !meta.venuePublicId || meta.venuePublicId === venuePhoto.publicId;
  });
  const render =
    (selectedMediaId ? dressed.find((m) => m.id === selectedMediaId) : undefined) ??
    dressed[0];
  return render ? { venuePhoto, render } : null;
}
