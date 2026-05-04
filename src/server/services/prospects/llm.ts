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
    "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://zaffa.ai",
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

Personalization rules:
- Use the prospect's FIRST NAME only (derived from display_name). Do NOT
  address them by their business/brand name and do NOT include the business
  or brand name anywhere in the body. If display_name is itself a business
  (e.g. "Cairo Catering Co."), greet them with a friendly fallback like
  "Hey there" rather than the business name.
- Pull the 1-2 specific details from concrete facts in their bio
  (a recent shoot, a city, a vibe, a specialty), NOT from the business name.
- The product is called Zaffa. Never write zaffa.app or any other domain.
- IMPORTANT: end with a soft CTA and copy the EXACT URL provided in the
  payload's "signup_url" field. Do not modify it, do not URL-encode it
  again, do not invent a different path. That URL is a personalized
  invitation link tied to this prospect.

Tone: warm, friendly, conversational, in the LANGUAGE of the prospect's
location/profile (default English, switch to Arabic when the bio is
Arabic).`;

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
- For source "instagram": output a SINGLE hashtag token (no "#", no spaces,
  ASCII letters/digits/underscore only, e.g. "weddingegypt", "cairobride").
  NEVER return multi-word phrases or full URLs.
- For source "tiktok": prefer hashtag-style ("#weddingegypt") OR a short
  search phrase (<= 4 words). NEVER return full URLs.
- For source "web"/"facebook": natural search phrases.

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

// Builds the personalized invitation URL we want the LLM to drop into the
// CTA. `/join` is a short-friendly redirect to the professional signup page
// that reads ?invitation= and renders a customised welcome banner.
function buildSignupUrl(displayName: string | null | undefined): string {
  const base =
    process.env.ZAFFA_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "https://zaffa.ai";
  const name = (displayName ?? "").trim();
  if (!name) return `${base}/join`;
  return `${base}/join?invitation=${encodeURIComponent(name)}`;
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
  const signupUrl = buildSignupUrl(input.prospect.display_name);
  const out = await callJson<DraftedMessage>([
    { role: "system", content: DRAFT_SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        channel: input.channel,
        template: input.template,
        prospect: input.prospect,
        signup_url: signupUrl,
      }),
    },
  ]);
  // Defensive post-processing: if the LLM dropped a bare "zaffa.ai" without
  // the invitation param, swap in the personalized one. This keeps every
  // outreach message tied to a tracked invitation link even if the model
  // gets sloppy.
  let body = out.body ?? "";
  if (!body.includes(signupUrl)) {
    body = body.replace(
      /https?:\/\/zaffa\.ai\/?(?!\S)/gi,
      signupUrl,
    );
    if (!body.includes(signupUrl)) {
      body = `${body.trimEnd()}\n\n${signupUrl}`;
    }
  }
  return {
    subject: out.subject?.slice(0, 200),
    body,
  };
}
