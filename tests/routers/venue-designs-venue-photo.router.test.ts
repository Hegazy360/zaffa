import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@/generated/prisma/client";

// The venue photo data path (F1, built in F0): upload into the caller's own
// folder, attach it to a design only if it provably came from there, and
// read the new JSON columns back parsed, with our costs stripped. Cloudinary
// and the rate limiter are mocked; nothing leaves the process.

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
const DESIGN_ID = randomUUID();

function caller(isAnonymous = false) {
  return venueDesignsRouter.createCaller({
    user: { id: USER_ID, email: null, is_anonymous: isAnonymous },
  } as never);
}

function photo(overrides: Partial<Record<string, unknown>> = {}) {
  const publicId = `zaffa-venues/${USER_ID}/lawn123`;
  return {
    url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1789/${publicId}.jpg`,
    publicId,
    width: 2048,
    height: 1536,
    ...overrides,
  };
}

const SAVE = {
  id: DESIGN_ID,
  name: "Our lawn",
  event_type: "wedding" as const,
  setting: "outdoor" as const,
  size: "medium" as const,
  guest_count: 120,
  palette: { colors: [] },
  style_notes: null,
  thumbnail: null,
};

// A small but syntactically valid JPEG data URL; Cloudinary is mocked.
const JPEG_DATA_URL = `data:image/jpeg;base64,${"A".repeat(200)}`;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CLOUDINARY_CLOUD_NAME = CLOUD;
  delete process.env.FLAG_VENUE_PHOTO;
  enforceTrpc.mockResolvedValue(undefined);
  prismaMock.venueDesign.update.mockResolvedValue({ id: DESIGN_ID } as never);
  prismaMock.venueDesign.create.mockResolvedValue({ id: DESIGN_ID } as never);
  upload.mockResolvedValue({
    secure_url: photo().url,
    public_id: photo().publicId,
    width: 2048,
    height: 1536,
  });
});

afterEach(() => {
  delete process.env.FLAG_VENUE_PHOTO;
});

describe("venueDesigns.save with a venue photo", () => {
  it("stores a photo from the caller's own venue folder", async () => {
    await caller().save({ ...SAVE, venue_photo: photo() });
    expect(prismaMock.venueDesign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DESIGN_ID, user_id: USER_ID },
        data: expect.objectContaining({ venue_photo: photo() }),
      }),
    );
  });

  it.each([
    [
      "an image outside our Cloudinary account",
      photo({ url: `https://evil.example/${photo().publicId}.jpg` }),
    ],
    [
      "another Cloudinary account",
      photo({
        url: `https://res.cloudinary.com/someone-else/image/upload/v1/${photo().publicId}.jpg`,
      }),
    ],
    [
      "another couple's venue folder",
      photo({
        publicId: `zaffa-venues/${OTHER_USER_ID}/lawn123`,
        url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/zaffa-venues/${OTHER_USER_ID}/lawn123.jpg`,
      }),
    ],
    [
      "a render or reference rather than a venue photo",
      photo({
        publicId: "zaffa-renders/abc",
        url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/zaffa-renders/abc.png`,
      }),
    ],
    [
      "a URL that is not the asset its public id names",
      photo({
        url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/zaffa-venues/${OTHER_USER_ID}/lawn123.jpg`,
      }),
    ],
  ])("rejects %s before writing anything", async (_label, bad) => {
    await expect(
      caller().save({ ...SAVE, venue_photo: bad }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "VENUE_PHOTO_INVALID" });
    expect(prismaMock.venueDesign.update).not.toHaveBeenCalled();
    expect(prismaMock.venueDesign.create).not.toHaveBeenCalled();
  });

  it("clears the photo with DbNull when sent null", async () => {
    await caller().save({ ...SAVE, venue_photo: null });
    const data = prismaMock.venueDesign.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data.venue_photo).toBe(Prisma.DbNull);
  });

  it("leaves the stored photo alone when the field is omitted (older clients)", async () => {
    await caller().save(SAVE);
    const data = prismaMock.venueDesign.update.mock.calls[0][0].data as Record<
      string,
      unknown
    >;
    expect(data).not.toHaveProperty("venue_photo");
  });
});

describe("venueDesigns.getById (new JSON columns)", () => {
  function designRow(overrides: Record<string, unknown> = {}) {
    return {
      id: DESIGN_ID,
      user_id: USER_ID,
      name: "Our lawn",
      venue_photo: photo(),
      selected_media_id: null,
      media: [
        {
          id: randomUUID(),
          design_id: DESIGN_ID,
          parent_id: null,
          type: "render",
          url: "https://res.cloudinary.com/x/image/upload/v1/zaffa-renders/r1.png",
          cloudinary_public_id: "zaffa-renders/r1",
          created_at: new Date(),
          meta: {
            mode: "refine",
            model: "openai/gpt-image-2.5-flare",
            costUsd: 0.022,
            instructionRaw: "كبّروا الكوشة",
            instructionEn: "Make the stage bigger",
            confirmation: "كبّرنا الكوشة",
          },
        },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    prismaMock.visionPack.findFirst.mockResolvedValue({
      id: randomUUID(),
      sku: "wedding_design_pack_v1",
    } as never);
  });

  it("returns the venue photo parsed and each render's client-safe meta", async () => {
    const selected = randomUUID();
    prismaMock.venueDesign.findFirst.mockResolvedValue(
      designRow({ selected_media_id: selected }) as never,
    );
    const res = await caller().getById({ id: DESIGN_ID });
    expect(res?.venue_photo).toEqual(photo());
    expect(res?.selected_media_id).toBe(selected);
    expect(res?.media[0].meta).toEqual({
      mode: "refine",
      instructionRaw: "كبّروا الكوشة",
      confirmation: "كبّرنا الكوشة",
    });
  });

  it("never sends the browser the model or what the render cost us", async () => {
    prismaMock.venueDesign.findFirst.mockResolvedValue(designRow() as never);
    const res = await caller().getById({ id: DESIGN_ID });
    const wire = JSON.stringify(res);
    expect(wire).not.toContain("costUsd");
    expect(wire).not.toContain("gpt-image");
    expect(wire).not.toContain("instructionEn");
  });

  it("reads a malformed photo or meta as null instead of passing it through", async () => {
    prismaMock.venueDesign.findFirst.mockResolvedValue(
      designRow({
        venue_photo: { url: "not a url" },
        media: [
          {
            ...designRow().media[0],
            meta: { costUsd: 1 },
          },
        ],
      }) as never,
    );
    const res = await caller().getById({ id: DESIGN_ID });
    expect(res?.venue_photo).toBeNull();
    expect(res?.media[0].meta).toBeNull();
  });
});

describe("venueDesigns.uploadVenuePhoto", () => {
  it("uploads into the caller's own venue folder and returns what save accepts", async () => {
    const res = await caller(true).uploadVenuePhoto({ dataUrl: JPEG_DATA_URL });
    expect(upload).toHaveBeenCalledWith(JPEG_DATA_URL, {
      folder: `zaffa-venues/${USER_ID}`,
      resource_type: "image",
      type: "upload",
    });
    expect(res).toEqual(photo());
    // Round trip: the returned shape is accepted by save.
    await caller(true).save({ ...SAVE, venue_photo: res });
    expect(prismaMock.venueDesign.update).toHaveBeenCalled();
  });

  it("consumes the per-user imageUpload bucket before uploading", async () => {
    await caller().uploadVenuePhoto({ dataUrl: JPEG_DATA_URL });
    expect(enforceTrpc).toHaveBeenCalledWith(
      "imageUpload",
      USER_ID,
      expect.any(String),
    );
    expect(enforceTrpc.mock.invocationCallOrder[0]).toBeLessThan(
      upload.mock.invocationCallOrder[0],
    );
  });

  it("does not upload when the limiter refuses", async () => {
    enforceTrpc.mockRejectedValueOnce(
      new TRPCError({ code: "TOO_MANY_REQUESTS", message: "slow down" }),
    );
    await expect(
      caller().uploadVenuePhoto({ dataUrl: JPEG_DATA_URL }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("is off when the venuePhoto kill switch is flipped", async () => {
    process.env.FLAG_VENUE_PHOTO = "0";
    await expect(
      caller().uploadVenuePhoto({ dataUrl: JPEG_DATA_URL }),
    ).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "VENUE_PHOTO_DISABLED",
    });
    expect(enforceTrpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it.each([
    ["a GIF", `data:image/gif;base64,${"A".repeat(200)}`],
    ["an SVG", `data:image/svg+xml;base64,${"A".repeat(200)}`],
    ["a remote URL", "https://example.com/lawn.jpg"],
    ["a non-base64 data URL", "data:image/jpeg,rawbytes"],
  ])("refuses %s", async (_label, dataUrl) => {
    await expect(
      caller().uploadVenuePhoto({ dataUrl }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("refuses a data URL over 7,000,000 characters", async () => {
    const huge = `data:image/png;base64,${"A".repeat(7_000_000)}`;
    await expect(
      caller().uploadVenuePhoto({ dataUrl: huge }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("fails loudly if Cloudinary hands back a public id outside the folder", async () => {
    upload.mockResolvedValue({
      secure_url: `https://res.cloudinary.com/${CLOUD}/image/upload/v1/lawn123.jpg`,
      public_id: "lawn123",
      width: 2048,
      height: 1536,
    });
    await expect(
      caller().uploadVenuePhoto({ dataUrl: JPEG_DATA_URL }),
    ).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
      message: "VENUE_PHOTO_UPLOAD_FAILED",
    });
    expect(reportError).toHaveBeenCalledWith(
      "venue_designs.venue_photo_shape_unexpected",
      expect.anything(),
      expect.objectContaining({ userId: USER_ID, publicId: "lawn123" }),
    );
  });

  it("records the venue photo on the funnel", async () => {
    await caller().uploadVenuePhoto({ dataUrl: JPEG_DATA_URL });
    expect(trackServer).toHaveBeenCalledWith(
      USER_ID,
      "design.venue_photo_added",
      { width: 2048, height: 1536 },
    );
  });
});

describe("reference uploads share the imageUpload bucket", () => {
  it("rate limits uploadReference per user", async () => {
    upload.mockResolvedValue({ secure_url: "https://x", public_id: "p" });
    await caller().uploadReference({ dataUrl: JPEG_DATA_URL });
    expect(enforceTrpc).toHaveBeenCalledWith(
      "imageUpload",
      USER_ID,
      expect.any(String),
    );
  });

  it("rate limits rehostUrl per user, before Cloudinary fetches anything", async () => {
    enforceTrpc.mockRejectedValueOnce(
      new TRPCError({ code: "TOO_MANY_REQUESTS", message: "slow down" }),
    );
    await expect(
      caller().rehostUrl({ url: "https://i.pinimg.com/originals/a.jpg" }),
    ).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(enforceTrpc).toHaveBeenCalledWith(
      "imageUpload",
      USER_ID,
      expect.any(String),
    );
    expect(upload).not.toHaveBeenCalled();
  });
});
