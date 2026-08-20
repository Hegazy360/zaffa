import "server-only";

/**
 * The one OpenRouter chat-completions caller.
 *
 * There were three hand-rolled copies of this fetch (posts, prospects, and
 * the chat widget would have been the fourth), each with its own auth-header
 * block and error shaping. Consolidated because the failure handling is the
 * part that matters and the part that drifted: non-2xx bodies must be
 * truncated into the error (OpenRouter's 4xx bodies explain the problem —
 * the 402 credits message is how we found the account was empty), and a
 * non-JSON body must not surface as a bare SyntaxError.
 *
 * `OPENAI_API_KEY` is a misnomer kept for compatibility: it holds an
 * OpenRouter key (`sk-or-...`) and every existing env/deploy already sets it.
 *
 * Image generation stays in `src/server/ai/image-gen.ts` — its multimodal
 * request/response shape is genuinely different.
 */

const BASE_URL = "https://openrouter.ai/api/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionArgs {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Set to force `response_format: {type:"json_object"}`. */
  responseFormat?: "json_object";
  /** Shows up in OpenRouter's per-app usage breakdown. */
  appTitle?: string;
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

/** Returns the assistant message content, or throws with a truncated,
 *  diagnosable error. Never returns empty. */
export async function chatCompletion({
  model,
  messages,
  temperature = 0.7,
  maxTokens,
  responseFormat,
  appTitle = "Zaffa",
}: ChatCompletionArgs): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: authHeaders(appTitle),
    body: JSON.stringify({
      model,
      messages,
      temperature,
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
      ...(responseFormat ? { response_format: { type: responseFormat } } : {}),
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM ${res.status}: ${text.slice(0, 400)}`);
  }
  const raw = await res.text();
  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`LLM returned non-JSON body: ${raw.slice(0, 200)}`);
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM returned empty content");
  return content;
}

/** JSON-mode convenience: parses the assistant content as JSON. */
export async function chatCompletionJson<T>(
  args: Omit<ChatCompletionArgs, "responseFormat">,
): Promise<T> {
  const content = await chatCompletion({ ...args, responseFormat: "json_object" });
  return JSON.parse(content) as T;
}
