import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Never a real network call: fetch is stubbed per test and Cloudinary's
// uploader is a mock, so these run free and offline.
const { uploadMock, loggerInfo } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock("@/lib/cloudinary", () => ({
  cloudinary: { uploader: { upload: uploadMock } },
}));
vi.mock("@/lib/logger", () => ({
  logger: { info: loggerInfo, warn: vi.fn(), error: vi.fn() },
  reportError: vi.fn(),
}));

const {
  generateImage,
  generateImageViaImagesApi,
  venueImageModel,
  editImageModel,
} = await import("@/server/ai/image-gen");

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sentBody(): Record<string, unknown> {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function sentHeaders(): Record<string, string> {
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  return init.headers as Record<string, string>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENAI_API_KEY", "sk-or-test");
  uploadMock.mockImplementation(async (_data: string, opts: { folder: string }) => ({
    secure_url: `https://res.cloudinary.com/zaffa/image/upload/v1/${opts.folder}/abc.png`,
    public_id: `${opts.folder}/abc`,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  fetchMock.mockReset();
  uploadMock.mockReset();
  loggerInfo.mockReset();
});

describe("generateImage (chat/completions path)", () => {
  it("mirrors the LAST image entry, the final render by Google's contract", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content: "here you go",
              images: [
                { image_url: { url: "data:image/png;base64,INTERIM" } },
                { image_url: { url: "data:image/png;base64,FINAL" } },
              ],
            },
          },
        ],
        usage: { cost: 0.136232 },
      }),
    );

    const out = await generateImage({ prompt: "a garden reception", mode: "generate" });

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(uploadMock.mock.calls[0][0]).toBe("data:image/png;base64,FINAL");
    expect(out).toMatchObject({
      imageUrl: expect.stringContaining("zaffa-renders/abc.png"),
      publicId: "zaffa-renders/abc",
      text: "here you go",
      costUsd: 0.136232,
    });
    expect(out.model).toBe(
      process.env.AI_IMAGE_MODEL ?? "google/gemini-3-pro-image-preview",
    );
  });

  it("sends references before the prompt and logs mode, model and cost", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { images: [{ image_url: { url: "data:image/png;base64,X" } }] } }],
        usage: { cost: 0.13 },
      }),
    );

    await generateImage({
      prompt: "p",
      references: [{ url: "https://a/1.jpg" }, { url: "https://a/2.jpg" }],
      mode: "generate",
    });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/v1/chat/completions",
    );
    const body = sentBody();
    const content = (body.messages as Array<{ content: unknown[] }>)[0].content;
    expect(content).toEqual([
      { type: "image_url", image_url: { url: "https://a/1.jpg" } },
      { type: "image_url", image_url: { url: "https://a/2.jpg" } },
      { type: "text", text: "p" },
    ]);
    expect(body.modalities).toEqual(["image", "text"]);
    expect(loggerInfo).toHaveBeenCalledWith(
      "image.generated",
      expect.objectContaining({
        mode: "generate",
        costUsd: 0.13,
        appTitle: "Zaffa Renders",
        imagesReturned: 1,
      }),
    );
  });

  it("throws with the status and a truncated body on a non-OK response", async () => {
    fetchMock.mockResolvedValue(
      new Response(`{"error":"insufficient credits"}${"x".repeat(1000)}`, {
        status: 402,
      }),
    );
    const err = await generateImage({ prompt: "p" }).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/^Image generation failed: 402 /);
    expect((err as Error).message).toContain("insufficient credits");
    expect((err as Error).message.length).toBeLessThan(450);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("throws when the model returned no image (safety block)", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ choices: [{ message: { content: "I can't", images: [] } }] }),
    );
    await expect(generateImage({ prompt: "p" })).rejects.toThrow(
      "No image was generated",
    );
  });
});

describe("generateImageViaImagesApi (POST /images path)", () => {
  it("sends the Images API body with the base image first", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [{ b64_json: "QUJD", media_type: "image/webp" }],
        usage: { cost: 0.057 },
      }),
    );

    await generateImageViaImagesApi({
      model: "openai/gpt-image-2.5-sunburst",
      prompt: "dress this lawn",
      references: [{ url: "https://venue/lawn.jpg" }, { url: "https://mood/1.jpg" }],
      quality: "high",
      mode: "dress_venue",
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/images");
    expect((fetchMock.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(sentBody()).toEqual({
      model: "openai/gpt-image-2.5-sunburst",
      prompt: "dress this lawn",
      input_references: [
        { type: "image_url", image_url: { url: "https://venue/lawn.jpg" } },
        { type: "image_url", image_url: { url: "https://mood/1.jpg" } },
      ],
      n: 1,
      aspect_ratio: "auto",
      quality: "high",
    });
    expect(sentHeaders()).toMatchObject({
      Authorization: "Bearer sk-or-test",
      "X-Title": "Zaffa Renders",
    });
  });

  it("mirrors data[0] to Cloudinary as a data URL and returns the shared result shape", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: [{ b64_json: "QUJD", media_type: "image/webp" }],
        usage: { cost: 0.022 },
      }),
    );

    const out = await generateImageViaImagesApi({
      model: "openai/gpt-image-2.5-flare",
      prompt: "warmer lights",
      references: [{ url: "https://render/1.png" }],
      mode: "refine",
    });

    expect(uploadMock.mock.calls[0][0]).toBe("data:image/webp;base64,QUJD");
    expect(uploadMock.mock.calls[0][1]).toMatchObject({ folder: "zaffa-renders" });
    expect(out).toEqual({
      imageUrl: expect.stringContaining("zaffa-renders/abc.png"),
      publicId: "zaffa-renders/abc",
      text: null,
      model: "openai/gpt-image-2.5-flare",
      costUsd: 0.022,
    });
    expect(loggerInfo).toHaveBeenCalledWith(
      "image.generated",
      expect.objectContaining({
        mode: "refine",
        model: "openai/gpt-image-2.5-flare",
        costUsd: 0.022,
        appTitle: "Zaffa Renders",
      }),
    );
  });

  it("defaults the media type to image/png and omits unset quality", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [{ b64_json: "QUJD" }] }));
    const out = await generateImageViaImagesApi({ model: "m", prompt: "p" });
    expect(uploadMock.mock.calls[0][0]).toBe("data:image/png;base64,QUJD");
    expect(sentBody()).not.toHaveProperty("quality");
    expect(out.costUsd).toBeNull();
  });

  it("throws with the status and at most 400 chars of the body on a non-OK response", async () => {
    const long = `{"error":{"message":"moderation_blocked"}}${"y".repeat(2000)}`;
    fetchMock.mockResolvedValue(new Response(long, { status: 400 }));
    const err = await generateImageViaImagesApi({ model: "m", prompt: "p" }).catch(
      (e: Error) => e,
    );
    expect((err as Error).message).toBe(
      `Image generation failed: 400 ${long.slice(0, 400)}`,
    );
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("throws when no image came back, so the caller releases any reserved quota", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [] }));
    await expect(
      generateImageViaImagesApi({ model: "m", prompt: "p" }),
    ).rejects.toThrow("No image was generated");
  });

  it("refuses to call out without an API key", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(
      generateImageViaImagesApi({ model: "m", prompt: "p" }),
    ).rejects.toThrow("OPENAI_API_KEY is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("model selection", () => {
  it("defaults the venue model to sunburst at high quality", () => {
    vi.stubEnv("AI_VENUE_IMAGE_MODEL", undefined as unknown as string);
    vi.stubEnv("AI_VENUE_IMAGE_QUALITY", undefined as unknown as string);
    expect(venueImageModel()).toEqual({
      model: "openai/gpt-image-2.5-sunburst",
      quality: "high",
    });
  });

  it("defaults the edit model to flare at medium quality", () => {
    vi.stubEnv("AI_EDIT_IMAGE_MODEL", undefined as unknown as string);
    vi.stubEnv("AI_EDIT_IMAGE_QUALITY", undefined as unknown as string);
    expect(editImageModel()).toEqual({
      model: "openai/gpt-image-2.5-flare",
      quality: "medium",
    });
  });

  it("lets env roll either model back without a deploy", () => {
    vi.stubEnv("AI_VENUE_IMAGE_MODEL", "openai/gpt-image-2");
    vi.stubEnv("AI_EDIT_IMAGE_QUALITY", "low");
    expect(venueImageModel().model).toBe("openai/gpt-image-2");
    expect(editImageModel().quality).toBe("low");
  });
});
