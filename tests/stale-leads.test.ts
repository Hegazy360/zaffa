import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockReset, type DeepMockProxy } from "vitest-mock-extended";
import { randomUUID } from "node:crypto";

const { prismaMock, sendEmailMock, trackMock, resolveEmailsMock } = await vi.hoisted(
  async () => {
    const { mockDeep } = await import("vitest-mock-extended");
    return {
      prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>(),
      sendEmailMock: vi.fn(),
      trackMock: vi.fn(),
      resolveEmailsMock: vi.fn(),
    };
  },
);

vi.mock("server-only", () => ({}));
// The real email renderer is used below; only the Resend client is stubbed.
vi.mock("@/lib/resend", () => ({ resend: null }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/posthog", () => ({ trackServer: trackMock, captureServer: vi.fn() }));
vi.mock("@/server/services/notifications/email", () => ({
  sendNotificationEmail: sendEmailMock,
}));
vi.mock("@/server/services/notifications/notify", () => ({
  resolveUserEmails: resolveEmailsMock,
}));

const { sendStaleLeadDigest, staleLeadDigestCopy, STALE_AFTER_HOURS, DIGEST_MAX_ROWS } =
  await import("@/server/services/stale-leads");
const { renderEmail } = await vi.importActual<
  typeof import("@/server/services/notifications/email")
>("@/server/services/notifications/email");

const NOW = new Date("2026-09-23T09:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

const ADMIN_EN = randomUUID();
const ADMIN_AR = randomUUID();

const COUPLE_A = {
  id: randomUUID(),
  full_name: "Couple A",
  source: "design_approved",
  created_at: hoursAgo(16 * 24),
};
const COUPLE_C = {
  id: randomUUID(),
  full_name: "Mariam",
  source: "whole_wedding_home",
  created_at: hoursAgo(13),
};

beforeEach(() => {
  sendEmailMock.mockReset();
  sendEmailMock.mockResolvedValue(true);
  trackMock.mockReset();
  resolveEmailsMock.mockReset();
  resolveEmailsMock.mockResolvedValue(
    new Map([
      [ADMIN_EN, "founder@zaffa.test"],
      [ADMIN_AR, "ops@zaffa.test"],
    ]),
  );
  prismaMock.enquiry.count.mockResolvedValue(2 as never);
  prismaMock.enquiry.findMany.mockResolvedValue([COUPLE_C, COUPLE_A] as never);
  prismaMock.profile.findMany.mockResolvedValue([
    { id: ADMIN_EN, locale: "en" },
    { id: ADMIN_AR, locale: "ar" },
  ] as never);
});

afterEach(() => {
  mockReset(prismaMock as unknown as DeepMockProxy<typeof prismaMock>);
});

describe("sendStaleLeadDigest", () => {
  it("looks only at leads still `new` after 12 hours, newest first", async () => {
    await sendStaleLeadDigest(NOW);
    const args = prismaMock.enquiry.findMany.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      where: { status: "new", created_at: { lt: hoursAgo(STALE_AFTER_HOURS) } },
      orderBy: { created_at: "desc" },
      take: DIGEST_MAX_ROWS,
    });
  });

  it("sends each admin exactly one digest, in their language", async () => {
    const res = await sendStaleLeadDigest(NOW);
    expect(res).toEqual({ stale: 2, emailed: 2 });
    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    const [en, ar] = sendEmailMock.mock.calls.map((c) => c[0]);
    expect(en).toMatchObject({ to: "founder@zaffa.test", locale: "en", userId: ADMIN_EN });
    expect(ar).toMatchObject({ to: "ops@zaffa.test", locale: "ar", userId: ADMIN_AR });
    expect(en.copy.title).toBe("2 leads are still waiting for a reply");
    expect(en.ctaHref).toBe("/dashboard/admin/enquiries");
  });

  it("skips admins who unsubscribed", async () => {
    await sendStaleLeadDigest(NOW);
    expect(prismaMock.profile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: "admin", email_unsubscribed_at: null },
      }),
    );
  });

  it("sends nothing and tracks nothing when no lead is stale", async () => {
    prismaMock.enquiry.count.mockResolvedValue(0 as never);
    prismaMock.enquiry.findMany.mockResolvedValue([] as never);
    const res = await sendStaleLeadDigest(NOW);
    expect(res).toEqual({ stale: 0, emailed: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(trackMock).not.toHaveBeenCalled();
  });

  it("tracks one nag per lead, only once a digest actually went out", async () => {
    await sendStaleLeadDigest(NOW);
    expect(trackMock).toHaveBeenCalledTimes(2);
    expect(trackMock).toHaveBeenCalledWith("zaffa-ops", "enquiry.stale_nagged", {
      enquiry_id: COUPLE_A.id,
      source: "design_approved",
      age_hours: 16 * 24,
    });

    trackMock.mockReset();
    sendEmailMock.mockResolvedValue(false);
    const res = await sendStaleLeadDigest(NOW);
    expect(res.emailed).toBe(0);
    expect(trackMock).not.toHaveBeenCalled();
  });
});

describe("staleLeadDigestCopy", () => {
  it("lists name, source and age, each row linking to its enquiry", () => {
    const copy = staleLeadDigestCopy([COUPLE_C, COUPLE_A], 2, NOW, "en");
    expect(copy.facts).toEqual([
      {
        label: "Mariam",
        value: "Enquiry form · 13 hours ago",
        href: `/dashboard/admin/enquiries/${COUPLE_C.id}`,
      },
      {
        label: "Couple A",
        value: "Approved design · 16 days ago",
        href: `/dashboard/admin/enquiries/${COUPLE_A.id}`,
      },
    ]);
  });

  it("writes Arabic with Latin digits and no dashes", () => {
    const copy = staleLeadDigestCopy([COUPLE_A], 1, NOW, "ar");
    expect(copy.title).toBe("طلب واحد ما زال بانتظار الرد");
    expect(copy.facts?.[0]?.value).toContain("16");
    expect(copy.facts?.[0]?.value).not.toMatch(/[\u0660-\u0669]/);
    const all = [copy.title, copy.body, copy.eyebrow, copy.ctaLabel].join(" ");
    expect(all).not.toMatch(/[\u2013\u2014]/);
  });

  it("says when the list is cut short", () => {
    const copy = staleLeadDigestCopy([COUPLE_C], 30, NOW, "en");
    expect(copy.title).toBe("30 leads are still waiting for a reply");
    expect(copy.body).toContain("The newest 1 are listed");
  });

  it("renders each row as a link in the email, and in its text part", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://zaffa.ai";
    process.env.NOTIFICATION_UNSUBSCRIBE_SECRET ??= "test-secret-at-least-16";
    const copy = staleLeadDigestCopy([COUPLE_A], 1, NOW, "en");
    const { html, text } = renderEmail({
      locale: "en",
      copy,
      ctaHref: "/dashboard/admin/enquiries",
      userId: ADMIN_EN,
    });
    const href = `https://zaffa.ai/dashboard/admin/enquiries/${COUPLE_A.id}`;
    expect(html).toContain(`<a href="${href}"`);
    expect(text).toContain(href);
    delete process.env.NEXT_PUBLIC_APP_URL;
  });
});
