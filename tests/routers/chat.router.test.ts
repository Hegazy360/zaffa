import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";

const { prismaMock } = await vi.hoisted(async () => {
  const { mockDeep } = await import("vitest-mock-extended");
  return { prismaMock: mockDeep<typeof import("@/lib/prisma").prisma>() };
});

vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));
vi.mock("@/lib/logger", () => ({
  reportError: vi.fn(),
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock("@/lib/posthog", () => ({ captureServer: vi.fn(), trackServer: vi.fn() }));

const enforceTrpcMany = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  enforceTrpcMany: (...args: unknown[]) => enforceTrpcMany(...args),
  ipFromRequest: vi.fn(() => "1.2.3.4"),
}));

const verifyTurnstile = vi.fn(async (..._args: unknown[]) => ({ ok: true }));
vi.mock("@/lib/turnstile", () => ({
  verifyTurnstile: (...args: unknown[]) => verifyTurnstile(...args),
}));

const chatCompletion = vi.fn(async (..._args: unknown[]) => "Ahlan! Here's how Zaffa works.");
vi.mock("@/server/llm/openrouter", () => ({
  chatCompletion: (...args: unknown[]) => chatCompletion(...args),
}));

vi.mock("@/server/services/vision-pack-pricing", () => ({
  resolveCountryFromRequest: vi.fn(() => "EG"),
  resolveVisionPackPricing: vi.fn(async () => ({
    sku: "wedding_design_pack_v1",
    country: "EG",
    amount: 9900,
    currency: "egp",
    source: "seed_country",
  })),
}));

const { chatRouter } = await import("@/server/routers/chat");

const USER_ID = randomUUID();
const CONVO_ID = randomUUID();

function caller(user: { id: string; is_anonymous?: boolean } | null) {
  return chatRouter.createCaller({
    user,
    req: new Request("https://zaffa.ai", { headers: { cookie: "" } }),
  } as never);
}

const ASK = {
  messages: [{ role: "user" as const, content: "What is Zaffa?" }],
  locale: "en",
  turnstileToken: "tok",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("FLAG_AI_CHAT", "1");
  chatCompletion.mockResolvedValue("Ahlan! Here's how Zaffa works.");
  verifyTurnstile.mockResolvedValue({ ok: true });
  prismaMock.chatMessage.count.mockResolvedValue(0);
  prismaMock.chatConversation.create.mockResolvedValue({ id: CONVO_ID } as never);
  prismaMock.chatMessage.create.mockResolvedValue({ id: randomUUID() } as never);
  prismaMock.$transaction.mockResolvedValue([] as never);
});

describe("chat.ask", () => {
  it("refuses when the flag is off — the instant kill switch", async () => {
    vi.stubEnv("FLAG_AI_CHAT", "0");
    await expect(caller(null).ask(ASK)).rejects.toMatchObject({
      message: "CHAT_DISABLED",
    });
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("demands Turnstile on the first anonymous message only", async () => {
    verifyTurnstile.mockResolvedValue({ ok: false });
    await expect(caller(null).ask(ASK)).rejects.toMatchObject({
      message: "TURNSTILE_FAILED",
    });

    // Continuing an existing conversation skips the captcha.
    verifyTurnstile.mockClear();
    prismaMock.chatConversation.findUnique.mockResolvedValue({
      id: CONVO_ID,
    } as never);
    const res = await caller(null).ask({ ...ASK, conversationId: CONVO_ID });
    expect(res.reply).toContain("Zaffa");
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("exempts signed-in permanent users from Turnstile", async () => {
    verifyTurnstile.mockClear();
    await caller({ id: USER_ID, is_anonymous: false }).ask(ASK);
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it("consumes both Upstash buckets", async () => {
    await caller(null).ask(ASK);
    expect(enforceTrpcMany).toHaveBeenCalledWith(
      [{ key: "chat" }, { key: "chatDaily" }],
      "1.2.3.4",
    );
  });

  it("refuses at the Postgres global daily cap — the bound that cannot fail open", async () => {
    prismaMock.chatMessage.count.mockResolvedValue(2000);
    await expect(caller(null).ask(ASK)).rejects.toMatchObject({
      message: "CHAT_GLOBAL_CAP",
    });
    expect(chatCompletion).not.toHaveBeenCalled();
  });

  it("writes the user message BEFORE calling the model", async () => {
    const order: string[] = [];
    prismaMock.chatMessage.create.mockImplementationOnce((() => {
      order.push("persist");
      return Promise.resolve({ id: randomUUID() });
    }) as never);
    chatCompletion.mockImplementationOnce(async () => {
      order.push("llm");
      return "hi";
    });
    await caller(null).ask(ASK);
    expect(order).toEqual(["persist", "llm"]);
  });

  it("still surfaces the question when the model fails", async () => {
    chatCompletion.mockRejectedValueOnce(new Error("402 no credits"));
    await expect(caller(null).ask(ASK)).rejects.toMatchObject({
      message: "CHAT_UNAVAILABLE",
    });
    // The user's message row was written despite the failure.
    expect(prismaMock.chatMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "user" }),
      }),
    );
  });

  it("grounds the system prompt with the visitor's market prices", async () => {
    await caller(null).ask(ASK);
    const [{ messages }] = chatCompletion.mock.calls[0] as unknown as [
      { messages: Array<{ role: string; content: string }> },
    ];
    const system = messages[0];
    expect(system.role).toBe("system");
    expect(system.content).toContain("99 EGP");
    // The prohibition must be present (the rule necessarily names the
    // things it forbids — asserting their absence would fail on the rule).
    expect(system.content).toMatch(/never mention planner/i);
    expect(system.content).toContain("زفّة");
  });

  it("caps input: rejects over 8 turns and over-long messages", async () => {
    await expect(
      caller(null).ask({
        ...ASK,
        messages: Array.from({ length: 9 }, () => ({
          role: "user" as const,
          content: "hi",
        })),
      }),
    ).rejects.toThrow();
    await expect(
      caller(null).ask({
        ...ASK,
        messages: [{ role: "user" as const, content: "x".repeat(2001) }],
      }),
    ).rejects.toThrow();
  });
});
