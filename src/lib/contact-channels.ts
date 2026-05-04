// Single source of truth for the public-facing contact channels we
// expose on marketing pages (footer pills, /contact channel cards,
// future help-widgets, etc.). Centralising here means swapping the
// WhatsApp business number is a one-line change.
//
// We export both the digits-only form (required by the `wa.me` deep
// link) and a human-readable form for display + screen-reader labels.
// The digits MUST be in international format with no `+`, no spaces,
// and no separators per WhatsApp's URL spec.

export const WHATSAPP_NUMBER_E164 = "+33769999707";
/** Display format used in UI labels and aria-labels. */
export const WHATSAPP_NUMBER_DISPLAY = "+33 7 69 99 97 07";
/** Digits only, no leading + — what `wa.me` expects in the path. */
export const WHATSAPP_NUMBER_DIGITS = WHATSAPP_NUMBER_E164.replace(/\D/g, "");
/** Tap-to-chat link. Opens the native WhatsApp app or the web client. */
export const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUMBER_DIGITS}`;
