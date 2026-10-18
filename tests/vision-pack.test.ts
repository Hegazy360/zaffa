import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isPackExhausted,
  isPackRefundable,
  isPackWindowExpired,
  generateMicrositeSlug,
  PACK_SKUS,
  VISION_PACK_REFUND_HOURS,
} from "@/lib/vision-pack";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-06T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isPackRefundable (refund tripwire)", () => {
  const baseRefundable = {
    paid_at: new Date("2026-05-06T08:00:00.000Z"), // 2 hours ago
    microsite_published_at: null,
    lookbook_downloaded_at: null,
    status: "active",
    amount: 1999, // $19.99 in minor units - paid tier
  };

  it("returns true within the refund window when no tripwires fired", () => {
    expect(isPackRefundable(baseRefundable)).toBe(true);
  });

  it("returns false for free-tier packs (amount === 0)", () => {
    expect(
      isPackRefundable({ ...baseRefundable, amount: 0 }),
    ).toBe(false);
  });

  it("uses latest_paid_at over paid_at when both are set (upgrade flow)", () => {
    // Original purchase was 30 hours ago, past the 24h window from
    // paid_at alone - but the upgrade happened 2 hours ago, so the
    // refund window is open.
    const oldPaidAt = new Date(Date.now() - 30 * 60 * 60 * 1000);
    const recentUpgradeAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    expect(
      isPackRefundable({
        ...baseRefundable,
        paid_at: oldPaidAt,
        latest_paid_at: recentUpgradeAt,
      }),
    ).toBe(true);
  });

  it("returns false once the microsite is published (tripwire)", () => {
    expect(
      isPackRefundable({
        ...baseRefundable,
        microsite_published_at: new Date("2026-05-06T09:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("returns false once the lookbook has been downloaded (tripwire)", () => {
    expect(
      isPackRefundable({
        ...baseRefundable,
        lookbook_downloaded_at: new Date("2026-05-06T09:30:00.000Z"),
      }),
    ).toBe(false);
  });

  it("returns false past the refund window cutoff", () => {
    // 25h ago, beyond the 24h window.
    const tooLate = new Date(
      Date.now() - (VISION_PACK_REFUND_HOURS + 1) * 60 * 60 * 1000,
    );
    expect(
      isPackRefundable({ ...baseRefundable, paid_at: tooLate }),
    ).toBe(false);
  });

  it("returns false when the pack is in a non-active terminal state", () => {
    expect(
      isPackRefundable({ ...baseRefundable, status: "refunded" }),
    ).toBe(false);
    expect(
      isPackRefundable({ ...baseRefundable, status: "expired" }),
    ).toBe(false);
    expect(
      isPackRefundable({ ...baseRefundable, status: "pending_payment" }),
    ).toBe(false);
  });

  it("returns false when paid_at is missing", () => {
    expect(
      isPackRefundable({ ...baseRefundable, paid_at: null }),
    ).toBe(false);
  });
});

describe("isPackWindowExpired", () => {
  it("returns false for null expires_at", () => {
    expect(isPackWindowExpired(null)).toBe(false);
  });

  it("returns false for a future expiry", () => {
    expect(
      isPackWindowExpired(new Date("2026-06-01T00:00:00.000Z")),
    ).toBe(false);
  });

  it("returns true for a past expiry", () => {
    expect(
      isPackWindowExpired(new Date("2026-05-01T00:00:00.000Z")),
    ).toBe(true);
  });
});

describe("generateMicrositeSlug", () => {
  it("returns a 10-char slug made of url-safe lowercase chars", () => {
    for (let i = 0; i < 25; i++) {
      const slug = generateMicrositeSlug();
      expect(slug).toHaveLength(10);
      // Crockford-ish alphabet (no 0/O/1/I/L), keep the regex permissive
      // but still url-safe.
      expect(slug).toMatch(/^[a-z2-9]+$/);
    }
  });

  it("returns reasonably unique slugs across many invocations", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(generateMicrositeSlug());
    // Allow some collisions but expect substantial variety.
    expect(seen.size).toBeGreaterThan(150);
  });
});

describe("PACK_SKUS quotas (stamped onto every new pack row)", () => {
  // These numbers are promised in the paywall copy and priced against in
  // the design partner plan section 4. A change here is a
  // pricing decision, so it should fail a test and be made on purpose.
  it("free taste: one render, three talked edits, no video", () => {
    const q = PACK_SKUS.wedding_free_taste_v1.quotas;
    expect(q).toMatchObject({ renders: 1, edits: 3, videos: 0 });
  });

  it("design pack: twenty renders, sixty edits", () => {
    const q = PACK_SKUS.wedding_design_pack_v1.quotas;
    expect(q).toMatchObject({ renders: 20, edits: 60 });
  });

  it("legacy vision pack keeps the same edit allowance as the design pack", () => {
    expect(PACK_SKUS.wedding_vision_pack_v1.quotas.edits).toBe(
      PACK_SKUS.wedding_design_pack_v1.quotas.edits,
    );
  });

  it("every SKU declares an integer edit quota (0 would silently lock F2)", () => {
    for (const sku of Object.values(PACK_SKUS)) {
      expect(Number.isInteger(sku.quotas.edits)).toBe(true);
      expect(sku.quotas.edits).toBeGreaterThan(0);
    }
  });
});

describe("isPackExhausted (the fulfilled rule)", () => {
  const spentFree = {
    renders_used: 1,
    renders_quota: 1,
    videos_used: 0,
    videos_quota: 0,
    edits_used: 0,
    edits_quota: 3,
  };

  it("keeps a free pack open while its edits last, even with the render spent", () => {
    expect(isPackExhausted(spentFree)).toBe(false);
    expect(isPackExhausted({ ...spentFree, edits_used: 2 })).toBe(false);
  });

  it("is exhausted only when renders, videos AND edits are all spent", () => {
    expect(isPackExhausted({ ...spentFree, edits_used: 3 })).toBe(true);
  });

  it("is not exhausted while renders remain, whatever the edits say", () => {
    expect(
      isPackExhausted({ ...spentFree, renders_used: 0, edits_used: 3 }),
    ).toBe(false);
  });

  it("is not exhausted while videos remain", () => {
    expect(
      isPackExhausted({
        ...spentFree,
        edits_used: 3,
        videos_used: 1,
        videos_quota: 2,
      }),
    ).toBe(false);
  });
});
