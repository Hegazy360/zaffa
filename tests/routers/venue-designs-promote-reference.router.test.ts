import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

// F3: "Is this your venue? Use it as the canvas." A reference the couple
// uploaded, which the intake check thought was a photo of their own empty
// venue, is copied into their venue folder and comes back as a venue photo
// `save` accepts. Only the caller's own uploads qualify, and the copy is
// made from a URL the server builds, never from the one the client sent.
// Cloudinary and the rate limiter are mocked; nothing leaves the process.

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>() };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const reportError = vi.fn();
vi.mock("@/lib/logger", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

const trackServer = vi.fn();
vi.mock("@/lib/posthog", () => ({
  captureServer: vi.fn(),
  trackServer: (...args: unknown[]) => trackServer(...args),
}));

const upload = vi.fn();
vi.mock("@/lib/cloudinary", () => ({
  cloudinary: { uploader: { upload: (...args: unknown[]) => upload(...args) } },
  watermarkedUrl: vi.fn((id: string) => `https://wm.example/${id}`),
  referenceAsVenueSourceUrl: vi.fn(
    (id: string) => `https://res.cloudinary.com/signed/c_limit,h_2048,w_2048/${id}.jpg`,
  ),
}));

const enforceTrpc = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  enforceTrpc: (...args: unknown[]) => enforceTrpc(...args),
}));

vi.mock("@/server/services/notifications/dispatchers", () => ({
  notifyDesignApproved: vi.fn(),
}));

const { venueDesignsRouter } = await import("@/server/routers/venue-designs");

const CLOUD = "zaffa-test-cloud";
const USER_ID = randomUUID();
const OTHER_USER_ID = randomUUID();
const REF_PUBLIC_ID = `zaffa-references/${USER_ID}/lawn42`;
const REF_URL = `https://res.cloudinary.com/${CLOUD}/image/upload/v1712/${REF_PUBLIC_ID}.jpg`;
const VENUE_PUBLIC_ID = `zaffa-venues/${USER_ID}/copied7`;

function caller(isAnonymous = true) {
  return venueDesignsRouter.createCaller({
    user: { id: USER_ID, email: null, is_anonymous: isAnonymous },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  delete process.env.FLAG_VENUE_PHOTO;
  enforceTrpc.mockResolvedValue(undefined);
  upload.mockResolvedValue({
    secure_url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1800/${VENUE_PUBLIC_ID}.jpg`,
    public_id: VENUE_PUBLIC_ID,
    width: 2048,
    height: 1365,
  });
});

afterEach(() => {
  delete process.env.FLAG_VENUE_PHOTO;
});

describe("venueDesigns.promoteReferenceToVenue", () => {
  it("copies the couple's own upload into their venue folder from a server-built URL", async () => {
    const photo = await caller().promoteReferenceToVenue({ url: REF_URL });
    expect(upload).toHaveBeenCalledWith(
      `https://res.cloudinary.com/signed/c_limit,h_2048,w_2048/${REF_PUBLIC_ID}.jpg`,
      { folder: `zaffa-venues/${USER_ID}`, resource_type: "image", type: "upload" },
    );
    expect(photo).toEqual({
      url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1800/${VENUE_PUBLIC_ID}.jpg`,
      publicId: VENUE_PUBLIC_ID,
      width: 2048,
      height: 1365,
    });
    expect(enforceTrpc).toHaveBeenCalledWith("imageUpload", USER_ID, expect.any(String));
    expect(trackServer).toHaveBeenCalledWith(USER_ID, "design.venue_photo_added", {
      width: 2048,
      height: 1365,
      source: "reference",
    });
  });

  it.each([
    [
      "another couple's reference",
      `https://res.cloudinary.com/${CLOUD}/image/upload/v1/zaffa-references/${OTHER_USER_ID}/x.jpg`,
    ],
    [
      "a render, not a reference",
      `https://res.cloudinary.com/${CLOUD}/image/upload/v1/zaffa-renders/abc.png`,
    ],
    [
      "another Cloudinary account",
      `https://res.cloudinary.com/someone-else/image/upload/v1/${REF_PUBLIC_ID}.jpg`,
    ],
    ["another host", `https://evil.example/${REF_PUBLIC_ID}.jpg`],
    [
      "a transformed URL",
      `https://res.cloudinary.com/${CLOUD}/image/upload/c_crop,w_10/v1/${REF_PUBLIC_ID}.jpg`,
    ],
    [
      "a path that climbs out of the folder",
      `https://res.cloudinary.com/${CLOUD}/image/upload/v1/zaffa-references/${USER_ID}/../${OTHER_USER_ID}/x.jpg`,
    ],
  ])("refuses %s before uploading anything", async (_label, url) => {
    await expect(caller().promoteReferenceToVenue({ url })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "REFERENCE_NOT_PROMOTABLE",
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("is off with the venue photo kill switch", async () => {
    process.env.FLAG_VENUE_PHOTO = "0";
    await expect(caller().promoteReferenceToVenue({ url: REF_URL })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "VENUE_PHOTO_DISABLED",
    });
    expect(upload).not.toHaveBeenCalled();
  });

  it("reports a failed copy with a stable code", async () => {
    upload.mockRejectedValueOnce(new Error("Cloudinary 500"));
    await expect(caller().promoteReferenceToVenue({ url: REF_URL })).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "VENUE_PHOTO_UPLOAD_FAILED",
    });
    expect(reportError).toHaveBeenCalledWith(
      "venue_designs.promote_reference_failed",
      expect.any(Error),
      expect.objectContaining({ userId: USER_ID, publicId: REF_PUBLIC_ID }),
    );
    expect(trackServer).not.toHaveBeenCalled();
  });

  it("counts against the upload limit", async () => {
    const { TRPCError } = await import("@trpc/server");
    enforceTrpc.mockRejectedValueOnce(
      new TRPCError({ code: "TOO_MANY_REQUESTS", message: "slow down" }),
    );
    await expect(caller().promoteReferenceToVenue({ url: REF_URL })).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(upload).not.toHaveBeenCalled();
  });
});
