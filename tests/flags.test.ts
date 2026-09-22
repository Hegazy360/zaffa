import { afterEach, describe, expect, it } from "vitest";
import { isFlagEnabled, type FlagKey } from "@/lib/flags";

// The design partner release ships five kill switches. They default ON and
// `FLAG_<NAME>=0` in Vercel settings must turn each one off without a
// deploy, because the procedure check is what stops the spend.
const DESIGN_PARTNER_FLAGS: Array<[FlagKey, string]> = [
  ["venuePhoto", "FLAG_VENUE_PHOTO"],
  ["refineRender", "FLAG_REFINE_RENDER"],
  ["intakeCheck", "FLAG_INTAKE_CHECK"],
  ["decorPlan", "FLAG_DECOR_PLAN"],
  ["familyShare", "FLAG_FAMILY_SHARE"],
];

afterEach(() => {
  for (const [, env] of DESIGN_PARTNER_FLAGS) delete process.env[env];
});

describe("design partner kill switches", () => {
  it.each(DESIGN_PARTNER_FLAGS)("%s is on by default", (key) => {
    expect(isFlagEnabled(key)).toBe(true);
  });

  it.each(DESIGN_PARTNER_FLAGS)("%s turns off with %s=0", (key, env) => {
    process.env[env] = "0";
    expect(isFlagEnabled(key)).toBe(false);
  });
});
