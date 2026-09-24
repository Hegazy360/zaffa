import "server-only";
import { logger } from "@/lib/logger";

/**
 * The one OpenRouter chat-completions caller.
 *
 * There were three hand-rolled copies of this fetch (posts, prospects, and
 * the chat widget would have been the fourth), each with its own auth-header
 * block and error shaping. Consolidated because the failure handling is the
 * part that matters and the part that drifted: non-2xx bodies must be
 * truncated into the error (OpenRouter's 4xx bodies explain the problem -
 * the 402 credits message is how we found the account was empty), and a
 * non-JSON body must not surface as a bare SyntaxError.
 *
 * `OPENAI_API_KEY` is a misnomer kept for compatibility: it holds an
 * OpenRouter key (`sk-or-...`) and every existing env/deploy already sets it.
 *
 * Image generation stays in `src/server/ai/image-gen.ts`, its multimodal
 * request/response shape is genuinely different. Image INPUT is supported
 * here though: a user message can carry `image_url` parts, which is how the
 * design partner release reads a render or a reference photo with a cheap
 * vision model (intake check, refine normalisation, decor analysis).
 */

const BASE_URL = "https://openrouter.ai/api/v1";

/**
 * The cheap vision + text model behind the design partner features:
 * smart intake (F3), refine-instruction normalisation (F2) and decor
 * analysis (F4). `gemini-3.5-flash-lite` with `json_schema` output read a
 * render into structured decor attributes for ~$0.0007 in ~5s in the
 * bake-off. One env var for all three so a model swap is one setting.
 */
export function designLlmModel(): string {
  return process.env.DESIGN_LLM_MODEL ?? "google/gemini-3.5-flash-lite";
}

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  /** Plain text, or multimodal parts (text plus image URLs). */
  content: string | ChatContentPart[];
}

/** A JSON Schema for OpenRouter's strict structured output. */
export interface JsonSchemaFormat {
  /** Identifier the provider echoes back; letters, digits, `_` and `-`. */
  name: string;
  schema: object;
}

export interface ChatCompletionArgs {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Set to force `response_format: {type:"json_object"}`. */
  responseFormat?: "json_object";
  /**
   * Strict structured output. Takes precedence over `responseFormat`:
   * sent as `response_format: {type:"json_schema", json_schema:{name,
   * strict:true, schema}}`, so the model cannot return keys or enum
   * values the caller did not declare.
   */
  jsonSchema?: JsonSchemaFormat;
  /** Shows up in OpenRouter's per-app usage breakdown. */
  appTitle?: string;
  /**
   * Abort the request after this many ms. Unset means no timeout, which is
   * what the existing callers (chat widget, posts, prospects) have always
   * had; `chatCompletionJson` defaults it for the new interactive callers.
   */
  timeoutMs?: number;
}

function responseFormatBody(
  jsonSchema: JsonSchemaFormat | undefined,
  responseFormat: "json_object" | undefined,
): Record<string, unknown> {
  if (jsonSchema) {
    return {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: jsonSchema.name,
          strict: true,
          schema: jsonSchema.schema,
        },
      },
    };
  }
  if (responseFormat) return { response_format: { type: responseFormat } };
  return {};
}

function authHeaders(appTitle: string): Record<string, string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for LLM calls");
  }
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://zaffa.ai",
    "X-Title": appTitle,
  };
}

/**
 * What `chatCompletion` throws when OpenRouter answered but not usefully,
 * so a caller can tell "the provider is down" from "the model said
 * nothing" without matching on message text. The messages are the
 * diagnosable ones described at the top of this file. A failure of
 * `fetch` itself (network, `timeoutMs`) is not wrapped: it surfaces as
 * undici's `TypeError` or a `TimeoutError`.
 *
 *  - `http`: a non-2xx status (`status` is set).
 *  - `envelope`: a 2xx whose body is not JSON (a gateway error page).
 *  - `empty`: a well-formed answer with no content, which is also how a
 *    provider's safety block can come back.
 */
export class LlmError extends Error {
  constructor(
    message: string,
    readonly kind: "http" | "envelope" | "empty",
    readonly status?: number,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

/** Returns the assistant message content, or throws with a truncated,
 *  diagnosable error. Never returns empty. */
export async function chatCompletion({
  model,
  messages,
  temperature = 0.7,
  maxTokens,
  responseFormat,
  jsonSchema,
  appTitle = "Zaffa",
  timeoutMs,
}: ChatCompletionArgs): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: authHeaders(appTitle),
    body: JSON.stringify({
      model,
      messages,
      temperature,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...responseFormatBody(jsonSchema, responseFormat),
    }),
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new LlmError(
      `LLM ${res.status}: ${text.slice(0, 400)}`,
      "http",
      res.status,
    );
  }
  const raw = await res.text();
  let data: {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { cost?: number };
  };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new LlmError(
      `LLM returned non-JSON body: ${raw.slice(0, 200)}`,
      "envelope",
    );
  }
  // One line per billed call, like `image.generated`. Text calls are cheap
  // one at a time, but the design partner features make several per
  // design, and all of it drains the same single OpenRouter balance.
  logger.info("llm.completed", {
    model,
    appTitle,
    costUsd: data.usage?.cost ?? null,
  });
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new LlmError("LLM returned empty content", "empty");
  return content;
}

/** Default ceiling for `chatCompletionJson`, see `timeoutMs` below. */
const JSON_COMPLETION_TIMEOUT_MS = 30_000;

/**
 * JSON-mode convenience: parses the assistant content as JSON.
 *
 * - `jsonSchema` switches from `json_object` to strict `json_schema`
 *   output. Callers should still validate the parsed value (zod), a
 *   provider that ignores `strict` would otherwise slip through.
 * - `model` defaults to `designLlmModel()`.
 * - `timeoutMs` defaults to 30s. The design partner calls sit in front of
 *   a person waiting on a button, and a hung provider should fail into the
 *   caller's fallback rather than hold the request open until the platform
 *   kills it. The older callers (posts, prospects) get the same ceiling:
 *   they ask for short JSON, and one that genuinely needs longer can pass
 *   its own `timeoutMs`.
 */
export async function chatCompletionJson<T>(
  args: Omit<ChatCompletionArgs, "responseFormat" | "model"> & {
    model?: string;
  },
): Promise<T> {
  const content = await chatCompletion({
    ...args,
    model: args.model ?? designLlmModel(),
    responseFormat: "json_object",
    timeoutMs: args.timeoutMs ?? JSON_COMPLETION_TIMEOUT_MS,
  });
  return JSON.parse(content) as T;
}
