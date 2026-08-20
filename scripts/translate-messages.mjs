#!/usr/bin/env node
// Mirror messages/en.json into messages/<locale>.json using OpenAI. Only
// keys that are missing or newly added in EN are translated, already
// translated keys are kept as-is so manual polish doesn't get clobbered.
//
// Usage:
//   OPENAI_API_KEY=... node scripts/translate-messages.mjs ar
//   node scripts/translate-messages.mjs ar --force      # retranslate everything
//
// Requires `OPENAI_API_KEY` in the environment (or .env.local).

import { promises as fs } from "node:fs";
import path from "node:path";

const SOURCE_LOCALE = "en";
const MESSAGES_DIR = path.resolve("messages");

// We support both OpenAI and OpenAI-compatible providers (e.g. OpenRouter).
// The script auto-detects OpenRouter from the key prefix unless OPENAI_BASE_URL
// is explicitly set.
function detectBaseUrl() {
  if (process.env.OPENAI_BASE_URL) return process.env.OPENAI_BASE_URL;
  const key = process.env.OPENAI_API_KEY ?? "";
  if (key.startsWith("sk-or-")) return "https://openrouter.ai/api/v1";
  return "https://api.openai.com/v1";
}

const args = process.argv.slice(2);
const force = args.includes("--force");
const target = args.find((a) => !a.startsWith("--"));

if (!target) {
  console.error("Usage: node scripts/translate-messages.mjs <locale> [--force]");
  process.exit(1);
}

if (!process.env.OPENAI_API_KEY) {
  // dotenv-style load of .env.local for parity with the dev server.
  try {
    const env = await fs.readFile(".env.local", "utf8");
    for (const line of env.split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
  } catch {}
}
if (!process.env.OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY is required (set in env or .env.local).");
  process.exit(1);
}

const BASE_URL = detectBaseUrl();
const isOpenRouter = BASE_URL.includes("openrouter");
const MODEL =
  process.env.OPENAI_TRANSLATE_MODEL ??
  (isOpenRouter ? "openai/gpt-4.1-mini" : "gpt-4.1-mini");

const enPath = path.join(MESSAGES_DIR, `${SOURCE_LOCALE}.json`);
const targetPath = path.join(MESSAGES_DIR, `${target}.json`);

const en = JSON.parse(await fs.readFile(enPath, "utf8"));
let existing = {};
try {
  existing = JSON.parse(await fs.readFile(targetPath, "utf8"));
} catch {}

// Walk the source tree and collect only the keys whose translation we need
// to fetch. We translate sentence by sentence so we can preserve ICU
// placeholders (e.g. {email}) without giving the model a chance to mangle
// them. Returns: [{ pointer, value }].
function collectMissing(en, current, base = []) {
  const out = [];
  for (const [k, v] of Object.entries(en)) {
    const ptr = [...base, k];
    if (typeof v === "string") {
      const existingVal = ptr.reduce(
        (acc, key) =>
          acc && typeof acc === "object" ? acc[key] : undefined,
        current,
      );
      if (force || typeof existingVal !== "string" || existingVal === "") {
        out.push({ pointer: ptr, value: v });
      }
    } else if (v && typeof v === "object") {
      out.push(...collectMissing(v, current, ptr));
    }
  }
  return out;
}

const todo = collectMissing(en, existing);
if (todo.length === 0) {
  console.log(`Nothing to translate for "${target}". Up to date.`);
  process.exit(0);
}

console.log(
  `Translating ${todo.length} keys to "${target}" with ${MODEL} via ${BASE_URL}…`,
);

const SYSTEM_PROMPT = `You are a professional product copywriter for Zaffa, a wedding and event planning platform serving the Egyptian market.

Translate the provided English UI strings into ${
  target === "ar"
    ? `Egyptian Arabic carried on a فصحى spine - the register a real Egyptian brand writes in, not a textbook.

Concretely, for Arabic:
- Lean colloquial Egyptian for anything conversational (headlines, body copy, CTAs): "إحنا معاكم", "نظبّط", "مفيش اختيار غلط", "بنعمل إيه". Keep فصحى for structure and for anything formal - legal copy, field labels, error states.
- Address the couple in the plural (إنتوا / -كم). Do not switch to masculine or feminine singular mid-catalog.
- Contractions and everyday words beat elevated synonyms. If a sentence would sound stilted read aloud to a friend, it is wrong - even if it is grammatically immaculate.
- Never produce a literal word-for-word rendering of the English. Say what the English means, the way an Egyptian would say it.`
    : `the ${target} locale`
}.

Rules:
- The product is called "Zaffa". ${
  target === "ar"
    ? 'In Arabic it is always written "زفّة" - never "زفافا", "زافا", or any other spelling, and never translated to the common noun "زفاف" (wedding). Treat زفّة as grammatically feminine, matching the rest of the catalog.'
    : 'Keep it as "Zaffa" verbatim, never translate or transliterate it.'
}
- Preserve every ICU placeholder verbatim, e.g. {email}, {min}, {count}. Do not translate, rename, or reformat them.
- Preserve any HTML-like tags such as <strong> or <link> verbatim. Do not add new tags.
- Keep the tone elegant and concise - these are UI labels, button text, headers, helper copy.
- Prefer culturally appropriate phrasing over literal translation. For wedding/event verbs, choose words that feel native to a high-end planner.
- Output JSON only, in the schema { "translations": ["...","..."] } - one entry per input string in order. Do NOT include the source strings or any extra commentary.`;

// Batch in groups so we keep prompt size reasonable while still leveraging
// the model's context window. 25 strings/batch keeps each request well
// under any token cap.
const BATCH_SIZE = 25;
const result = JSON.parse(JSON.stringify(existing));

function setAt(obj, ptr, val) {
  let cur = obj;
  for (let i = 0; i < ptr.length - 1; i += 1) {
    if (typeof cur[ptr[i]] !== "object" || cur[ptr[i]] === null) {
      cur[ptr[i]] = {};
    }
    cur = cur[ptr[i]];
  }
  cur[ptr[ptr.length - 1]] = val;
}

async function translateBatch(items) {
  const userPayload = items.map((it, idx) => `${idx + 1}. ${it.value}`).join("\n");
  const headers = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };
  if (isOpenRouter) {
    headers["HTTP-Referer"] = "https://www.zaffa.ai";
    headers["X-Title"] = "Zaffa i18n";
  }
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `Translate the following ${items.length} strings:\n\n${userPayload}`,
        },
      ],
      temperature: 0.2,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Provider ${res.status}: ${text.slice(0, 400)}`);
  }
  const raw = await res.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      `Provider returned non-JSON body (first 400 chars):\n${raw.slice(0, 400)}`,
    );
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error(`Empty response: ${JSON.stringify(data).slice(0, 400)}`);
  const parsed = JSON.parse(content);
  const translations = parsed.translations;
  if (!Array.isArray(translations) || translations.length !== items.length) {
    throw new Error(
      `Expected ${items.length} translations, got ${translations?.length}`,
    );
  }
  return translations;
}

for (let i = 0; i < todo.length; i += BATCH_SIZE) {
  const batch = todo.slice(i, i + BATCH_SIZE);
  process.stdout.write(`  batch ${i / BATCH_SIZE + 1}/${Math.ceil(todo.length / BATCH_SIZE)}… `);
  const translations = await translateBatch(batch);
  batch.forEach((item, idx) => {
    setAt(result, item.pointer, translations[idx]);
  });
  console.log("ok");
}

await fs.writeFile(targetPath, JSON.stringify(result, null, 2) + "\n");
console.log(`\nWrote ${targetPath} with ${todo.length} new translation(s).`);
