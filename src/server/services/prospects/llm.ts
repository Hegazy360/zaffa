// LLM helpers for the prospecting pipeline. We talk to OpenRouter using the
// same OPENAI_API_KEY the rest of the app already uses (auto-detected from
// the `sk-or-...` prefix). Two responsibilities:
//
//   1. extractContact() — given a free-text bio + page snippet, pull out
//      structured contact info, classify (planner/vendor + category), and
//      score the lead 0–100.
//   2. draftMessage() — render a per-channel outreach draft using a
//      template + the prospect's facts.
//
// All calls use response_format: json_object so we can parse safely.

import type { ProspectType, VendorCategory } from "@/generated/prisma/client";

const BASE_URL = "https://openrouter.ai/api/v1";
const MODEL = process.env.PROSPECTS_LLM_MODEL ?? "openai/gpt-4.1-mini";

function authHeaders(): Record<string, string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for prospect LLM calls");
  }
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://zaffa.app",
    "X-Title": "Zaffa prospects",
  };
}

async function callJson<T>(messages: Array<{ role: string; content: string }>): Promise<T> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages,
      temperature: 0.2,
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
  return JSON.parse(content) as T;
}

export interface ExtractedContact {
  email: string | null;
  whatsapp: string | null;
  phone: string | null;
  instagram: string | null;
  facebook: string | null;
  tiktok: string | null;
  website: string | null;
  city: string | null;
  vendor_category: VendorCategory | null;
  prospect_type: ProspectType;
  qualifying_score: number;
  summary: string;
}

const EXTRACT_SYSTEM = `You are a research assistant building a contact database
for an Egyptian event-planning marketplace called Zaffa.

For each blob of text (bio + page snippets), produce a JSON object with the
fields below. If a field is missing, return null. Do NOT invent data.

Schema:
{
  "email": string|null,
  "whatsapp": string|null,         // E.164 (e.g. +201234567890), digits only when ambiguous
  "phone": string|null,            // E.164
  "instagram": string|null,        // username only, no @ and no URL
  "facebook": string|null,         // page slug or full URL
  "tiktok": string|null,           // username only
  "website": string|null,          // full https URL
  "city": string|null,             // city in English (e.g. Cairo, El Gouna, Sahel)
  "vendor_category": "catering"|"photography"|"videography"|"flowers"|"music"|"decoration"|"venue"|"makeup"|"fashion"|"transportation"|"other"|null,
  "prospect_type": "planner"|"vendor"|"unknown",
  "qualifying_score": integer 0-100,    // higher = more likely a real, active wedding/event business in Egypt
  "summary": string                     // <= 240 chars, English, factual
}

Rules:
- Treat "wedding planner", "event planner", "event design", "بلانر", or "أتيليه" as planner.
- Treat photographers, videographers, florists, caterers, DJs, singers, decorators, makeup artists, dress designers, venues, vintage car rental, etc. as vendors with the matching vendor_category.
- For ambiguous personal accounts, return prospect_type "unknown".
- Egyptian dial code is +20. If you see a local number starting with 010/011/012/015 prepend +20 and drop the leading 0.
- qualifying_score factors: clarity that this is a business, presence of contact info, follower volume hints, recent activity hints, location signals (Egypt > regional > global).
- Always return JSON and only JSON.`;

export async function extractContact(input: {
  text: string;
  hint?: { handle?: string; followers?: number; source?: string };
}): Promise<ExtractedContact> {
  const userPrompt = JSON.stringify({
    hint: input.hint ?? null,
    text: input.text.slice(0, 6000),
  });
  const out = await callJson<ExtractedContact>([
    { role: "system", content: EXTRACT_SYSTEM },
    { role: "user", content: userPrompt },
  ]);
  // Defensive normalization — coerce out-of-range values into the schema.
  return {
    email: out.email ?? null,
    whatsapp: out.whatsapp ?? null,
    phone: out.phone ?? null,
    instagram: out.instagram ?? null,
    facebook: out.facebook ?? null,
    tiktok: out.tiktok ?? null,
    website: out.website ?? null,
    city: out.city ?? null,
    vendor_category: out.vendor_category ?? null,
    prospect_type: (out.prospect_type ?? "unknown") as ProspectType,
    qualifying_score: Math.max(
      0,
      Math.min(100, Math.round(Number(out.qualifying_score) || 0)),
    ),
    summary: (out.summary ?? "").slice(0, 240),
  };
}

const DRAFT_SYSTEM = `You are an Egyptian event-marketplace ops assistant
drafting a personalized outreach message. Use the template's tone, but
weave in 1-2 specific details from the prospect's facts so it doesn't read
as a copy/paste. Do not lie about anything you cannot verify. Keep it
concise — the channel limits below MUST be respected.

Channel limits:
- email: subject <= 80 chars, body <= 180 words. Output JSON: { "subject": string, "body": string }
- whatsapp: <= 110 words. Output JSON: { "body": string }
- instagram: <= 80 words. Output JSON: { "body": string }

Tone: warm, professional, in the LANGUAGE of the prospect's location/profile
(default English, switch to Arabic when the bio is Arabic). Always end with
a soft call-to-action and a link to https://zaffa.app.`;

export interface DraftedMessage {
  subject?: string;
  body: string;
}

// Generates N alternative phrasings of a discovery query so we can
// fan out beyond the per-call result cap of providers like Tavily.
// We ask the LLM to vary geography (cities/regions in Egypt), language
// (English/Arabic), and phrasing — without drifting off-topic.
export async function expandQueryVariants(input: {
  query: string;
  source: string; // "web" | "instagram" | ...
  count: number;
}): Promise<string[]> {
  if (input.count <= 0) return [];
  const sys = `You generate diverse search-query variants for a wedding/event
business prospecting tool in Egypt. Given one base query, output N variants
that:
- Stay on the SAME intent (same role: planner / vendor / category)
- Vary city or region (Cairo, Giza, Alexandria, Sahel, Gouna, Hurghada, Sharm,
  Mansoura, Tanta, Sokhna, etc.) AND/OR Arabic phrasing AND/OR synonyms
- Avoid duplicates and avoid generic non-wedding queries
- Are short (under 80 chars each)
- For source "instagram"/"tiktok": prefer hashtag-style (#weddingegypt) and
  handle-style searches; for "web": natural search phrases.

Return strictly JSON: { "variants": string[] } with exactly N entries.`;
  const out = await callJson<{ variants: string[] }>([
    { role: "system", content: sys },
    {
      role: "user",
      content: JSON.stringify({
        base_query: input.query,
        source: input.source,
        n: input.count,
      }),
    },
  ]);
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const v of out.variants ?? []) {
    const t = String(v).trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    cleaned.push(t.slice(0, 120));
    if (cleaned.length >= input.count) break;
  }
  return cleaned;
}

export async function draftMessage(input: {
  channel: "email" | "whatsapp" | "instagram";
  template: { subject?: string | null; body: string };
  prospect: {
    display_name: string;
    handle?: string | null;
    prospect_type: string;
    vendor_category?: string | null;
    city?: string | null;
    bio?: string | null;
    summary?: string | null;
  };
}): Promise<DraftedMessage> {
  const out = await callJson<DraftedMessage>([
    { role: "system", content: DRAFT_SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        channel: input.channel,
        template: input.template,
        prospect: input.prospect,
      }),
    },
  ]);
  return {
    subject: out.subject?.slice(0, 200),
    body: out.body ?? "",
  };
}
