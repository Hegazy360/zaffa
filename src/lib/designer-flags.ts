// The design partner kill switches the designer UI reads.
//
// `isFlagEnabled` reads `process.env`, and in the browser only NEXT_PUBLIC_
// variables exist, so a client component calling it sees the static default
// and never a `FLAG_VENUE_PHOTO=0` set in Vercel. The designer layout (a
// server component) reads these once with `readDesignerFlags()` and hands
// them down through `DesignerFlagsProvider`; client components ask
// `useDesignerFlag`. The procedures check the same flags themselves, so the
// UI check is about not offering a switched-off feature, not about safety.

import { isFlagEnabled } from "@/lib/flags";

export const DESIGNER_FLAG_KEYS = [
  "venuePhoto",
  "refineRender",
  "intakeCheck",
  "decorPlan",
  "familyShare",
] as const;

export type DesignerFlagKey = (typeof DESIGNER_FLAG_KEYS)[number];
export type DesignerFlags = Record<DesignerFlagKey, boolean>;

export function readDesignerFlags(): DesignerFlags {
  return Object.fromEntries(
    DESIGNER_FLAG_KEYS.map((key) => [key, isFlagEnabled(key)]),
  ) as DesignerFlags;
}
