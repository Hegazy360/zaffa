import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// fetch is stubbed per test: nothing here reaches OpenRouter.
const { loggerInfo } = vi.hoisted(() => ({ loggerInfo: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({
  logger: { info: loggerInfo, warn: vi.fn(), error: vi.fn() },
  reportError: vi.fn(),
}));

const { chatCompletion, chatCompletionJson, designLlmModel } = await import(
  "@/server/llm/openrouter"
);

const fetchMock = vi.fn();

function completion(content: string, cost?: number): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      ...(cost != null ? { usage: { cost } } : {}),
    }),
    { status: 200 },
  );
}

function sentInit(): RequestInit {
  return fetchMock.mock.calls[0][1] as RequestInit;
}

function sentBody(): Record<string, unknown> {
  return JSON.parse(sentInit().body as string) as Record<string, unknown>;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("OPENAI_API_KEY", "sk-or-test");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  fetchMock.mockReset();
  loggerInfo.mockReset();
});

describe("chatCompletionJson", () => {
  it("sends strict json_schema output when a schema is given", async () => {
    fetchMock.mockResolvedValue(completion('{"ok":true}'));
    const schema = {
      type: "object",
      properties: { ok: { type: "boolean" } },
      required: ["ok"],
      additionalProperties: false,
    };
    const out = await chatCompletionJson<{ ok: boolean }>({
      messages: [{ role: "user", content: "hi" }],
      jsonSchema: { name: "intake_check", schema },
    });
    expect(out).toEqual({ ok: true });
    expect(sentBody().response_format).toEqual({
      type: "json_schema",
      json_schema: { name: "intake_check", strict: true, schema },
    });
  });

  it("keeps json_object mode for callers that pass no schema", async () => {
    fetchMock.mockResolvedValue(completion("{}"));
    await chatCompletionJson({
      model: "openai/gpt-4.1-mini",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(sentBody()).toMatchObject({
      model: "openai/gpt-4.1-mini",
      response_format: { type: "json_object" },
    });
  });

  it("defaults the model to the design LLM, overridable by env", async () => {
    vi.stubEnv("DESIGN_LLM_MODEL", undefined as unknown as string);
    expect(designLlmModel()).toBe("google/gemini-3.5-flash-lite");
    fetchMock.mockResolvedValue(completion("{}"));
    await chatCompletionJson({ messages: [{ role: "user", content: "hi" }] });
    expect(sentBody().model).toBe("google/gemini-3.5-flash-lite");

    vi.stubEnv("DESIGN_LLM_MODEL", "openai/gpt-5.4-nano");
    expect(designLlmModel()).toBe("openai/gpt-5.4-nano");
  });

  it("aborts after 30s by default, and honours a caller's own timeout", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(completion("{}"));
    await chatCompletionJson({ messages: [{ role: "user", content: "hi" }] });
    expect(timeoutSpy).toHaveBeenLastCalledWith(30_000);
    expect(sentInit().signal).toBeInstanceOf(AbortSignal);

    fetchMock.mockResolvedValue(completion("{}"));
    await chatCompletionJson({
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 5_000,
    });
    expect(timeoutSpy).toHaveBeenLastCalledWith(5_000);
  });

  it("passes multimodal parts through untouched", async () => {
    fetchMock.mockResolvedValue(completion("{}"));
    const content = [
      { type: "text" as const, text: "What decor is in this render?" },
      {
        type: "image_url" as const,
        image_url: { url: "https://res.cloudinary.com/zaffa/r.png" },
      },
    ];
    await chatCompletionJson({ messages: [{ role: "user", content }] });
    expect((sentBody().messages as Array<{ content: unknown }>)[0].content).toEqual(
      content,
    );
  });
});

describe("chatCompletion", () => {
  it("logs what the call cost with the model and app title", async () => {
    fetchMock.mockResolvedValue(completion("hello", 0.0007));
    await chatCompletion({
      model: "google/gemini-3.5-flash-lite",
      messages: [{ role: "user", content: "hi" }],
      appTitle: "Zaffa Design",
    });
    expect(loggerInfo).toHaveBeenCalledWith("llm.completed", {
      model: "google/gemini-3.5-flash-lite",
      appTitle: "Zaffa Design",
      costUsd: 0.0007,
    });
  });

  it("keeps the existing callers' shape: no timeout, no response_format", async () => {
    fetchMock.mockResolvedValue(completion("hello"));
    const out = await chatCompletion({
      model: "openai/gpt-4.1-mini",
      messages: [{ role: "user", content: "hi" }],
      maxTokens: 350,
    });
    expect(out).toBe("hello");
    expect(sentInit().signal).toBeUndefined();
    expect(sentBody()).not.toHaveProperty("response_format");
    expect(sentBody()).toMatchObject({ max_tokens: 350, temperature: 0.7 });
    expect(loggerInfo).toHaveBeenCalledWith(
      "llm.completed",
      expect.objectContaining({ costUsd: null }),
    );
  });

  it("throws with the status and a truncated body on a non-OK response", async () => {
    fetchMock.mockResolvedValue(
      new Response(`{"error":"Insufficient credits"}${"z".repeat(1000)}`, {
        status: 402,
      }),
    );
    const err = await chatCompletion({
      model: "m",
      messages: [{ role: "user", content: "hi" }],
    }).catch((e: Error) => e);
    expect((err as Error).message).toMatch(/^LLM 402: \{"error":"Insufficient credits"\}/);
    expect((err as Error).message.length).toBeLessThanOrEqual("LLM 402: ".length + 400);
  });

  it("turns a non-JSON body into a readable error, not a bare SyntaxError", async () => {
    fetchMock.mockResolvedValue(new Response("<html>502</html>", { status: 200 }));
    await expect(
      chatCompletion({ model: "m", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow("LLM returned non-JSON body: <html>502</html>");
  });

  it("refuses an empty completion", async () => {
    fetchMock.mockResolvedValue(completion(""));
    await expect(
      chatCompletion({ model: "m", messages: [{ role: "user", content: "hi" }] }),
    ).rejects.toThrow("LLM returned empty content");
  });
});
