/**
 * The design id to send with `ai.renderScene`: flush the design save
 * first (a new design gets its id from this very save) and send what it
 * resolves with.
 *
 * If the save fails, send no id at all rather than the one we already
 * had. The server refuses the whole render (NOT_FOUND) when the id is not
 * a design the caller owns, before anything is spent, and a failed save
 * is exactly how a stale id shows itself: the anonymous user behind it
 * was cleaned up after 14 days, or the link was opened in another
 * browser, so the middleware signed the visitor in as someone new and
 * `save({ id })` finds nothing to update. Sending that id again turned an
 * autosave hiccup into a render that failed on every retry. With no id
 * the render goes ahead and the server returns the old response shape,
 * so the panel falls back to `saveMedia`, which either persists it (a
 * transient save failure) or fails on its own without costing the couple
 * the image they asked for.
 */
export async function designIdForRender(
  saveNow: () => Promise<string>,
): Promise<string | null> {
  try {
    return await saveNow();
  } catch {
    return null;
  }
}

/**
 * Whether a render may go out with the design id the flush resolved with.
 *
 * A couple with a venue photo was told "We'll dress your venue photo", and
 * the server only ever reads that photo from the saved design, never from
 * the request. With no design id the render would come back as an imagined
 * hall and still use up a render (on the free tier, their only one), so a
 * venue render waits for a save that works. Without a photo a failed save
 * changes nothing about the image, and the render goes ahead as above.
 */
export function canSendRender(
  designId: string | null,
  hasVenuePhoto: boolean,
): boolean {
  return designId !== null || !hasVenuePhoto;
}
