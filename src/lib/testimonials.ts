/**
 * Real testimonials, and nothing else.
 *
 * This file is empty on purpose. Zaffa has not delivered its first weddings
 * yet, so there is nothing truthful to quote - and the homepage previously
 * carried four stock headshots and an invented "4.9" precisely because an
 * empty section felt like something to fill. It is not. An empty section is
 * accurate; a filled one would be a lie on the page that asks couples to
 * trust us with their wedding.
 *
 * Rules for adding an entry, all of which are non-negotiable:
 *
 *  1. The couple said it. Not a paraphrase, not a composite, not a rewrite.
 *  2. They gave permission to publish it, attributed as it appears here.
 *  3. `weddingDate` is in the past - we quote weddings we ran, not ones we
 *     have been booked for.
 *  4. Quote them in the language they said it in, and translate only into
 *     the other locales, keeping the original in `locale`.
 *
 * The `testimonials` flag stays OFF until this array has at least three
 * entries; below that a testimonials section reads as thin rather than
 * reassuring. `TestimonialsSection` enforces the count on its own, so the
 * flag can be flipped early without risk.
 */

export interface Testimonial {
  /** Stable key, used as the React key and for analytics. */
  id: string;
  /** Exactly what they said, in `locale`. */
  quote: string;
  /** BCP-47 tag of the language the quote was given in. */
  locale: "en" | "ar" | "fr" | "de";
  /** How they want to be credited - first names are fine, initials are not. */
  attribution: string;
  /** Where the wedding happened, e.g. "Dubai" or "Cairo". */
  city: string;
  /** ISO date of the wedding. Must be in the past. */
  weddingDate: string;
  /**
   * Optional public microsite slug, so a reader can see the actual wedding
   * behind the quote. Only set this when that microsite is already public.
   */
  micrositeSlug?: string;
}

/** The smallest set that reads as evidence rather than a single anecdote. */
export const MIN_TESTIMONIALS = 3;

export const TESTIMONIALS: readonly Testimonial[] = [];
