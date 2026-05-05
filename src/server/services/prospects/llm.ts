// LLM helpers for the prospecting pipeline. We talk to OpenRouter using the
// same OPENAI_API_KEY the rest of the app already uses (auto-detected from
// the `sk-or-...` prefix). Two responsibilities:
//
//   1. extractContact() — given a free-text bio + page snippet, pull out
//      structured contact info, classify (planner/vendor + category), and
//      score the lead 0–100.
//   2. draftMessage() — render an outreach draft by asking the LLM for
//      two short personalization slots (first name + a single concrete
//      detail) and substituting them, plus the signup URL, into the
//      template body verbatim. The model never rewrites the pitch.
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

// We no longer ask the LLM to regenerate the message body. The template
// body is sent verbatim; the LLM only fills two small personalization
// slots ([الاسم], [حاجة محددة]) and we substitute them — plus the
// signup URL — server-side. Cheaper, faster, and impossible for the
// model to drop or reword the pitch.
const SLOT_SYSTEM = `You extract two short personalization slots for a
cold-outreach message about an Egyptian event-planning marketplace. Return
JSON only — no prose, no markdown.

Schema:
{
  "first_name": string,   // How to address the prospect in the greeting.
                          //   Rules:
                          //   - If display_name (or the bio) clearly
                          //     identifies a real PERSON, return ONLY
                          //     their first name (e.g. "Ahmed Hassan"
                          //     → "Ahmed"; "نهى عبد الفتاح" → "نهى").
                          //   - If display_name is a BUSINESS or BRAND
                          //     (e.g. "Weddy Rose For Events", "Cairo
                          //     Catering Co.", "Studio Noor"), return
                          //     the brand name itself, lightly cleaned:
                          //     drop trailing descriptors like "for
                          //     events", "studio", "co", "ltd", "llc",
                          //     "official", and trim to AT MOST the
                          //     first two meaningful words. So
                          //     "Weddy Rose For Events" → "Weddy Rose",
                          //     "Cairo Catering Co." → "Cairo
                          //     Catering", "Studio Noor" → "Studio
                          //     Noor".
                          //   - Keep the original script (Arabic stays
                          //     Arabic, Latin stays Latin). Do not
                          //     translate or transliterate.
                          //   - Only fall back to "صديقي" if
                          //     display_name is empty or pure noise
                          //     (e.g. "user_8273", "????").
  "specific":   string    // 2–6 words, Egyptian Arabic, naming ONE
                          //   concrete thing about their work that you
                          //   can verify from the bio/summary/facts —
                          //   a city, a vibe, a recent project, a
                          //   specialty, a signature look. Examples:
                          //   "تنظيم الأفراح في الساحل", "تصميم
                          //   البوكيهات", "صور العرسان". If nothing
                          //   concrete is available, use "شغلك".
}

Hard rules:
- Never invent facts. When unsure, use the fallback values above.
- Keep "specific" short (2–6 words) and lowercase-style, no trailing
  punctuation.
- Output strictly valid JSON with exactly those two string fields.`;

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

interface PersonalizationSlots {
  first_name: string;
  specific: string;
}

// Split out so the picker / preview can fall back to a synchronous render
// if the LLM call fails. Substitutes the three known placeholders into
// the template body verbatim.
function renderTemplate(
  templateBody: string,
  slots: PersonalizationSlots,
  signupUrl: string,
): string {
  let body = templateBody
    .split("[الاسم]").join(slots.first_name)
    .split("[حاجة محددة]").join(slots.specific)
    .split("[رابط]").join(signupUrl);

  // Belt-and-braces: legacy templates may still use {first_name} or a
  // bare https://zaffa.ai URL instead of the bracket placeholders. Patch
  // those too so this function works for both old and new seed copy.
  body = body.split("{first_name}").join(slots.first_name);
  if (!body.includes(signupUrl)) {
    body = body.replace(/https?:\/\/zaffa\.ai\/?(?!\S)/gi, signupUrl);
    if (!body.includes(signupUrl)) {
      body = `${body.trimEnd()}\n\n${signupUrl}`;
    }
  }
  return body;
}

// Cheap heuristic fallback used when the LLM call fails or returns junk.
// Tries to mirror the SLOT_SYSTEM rules: real person → first name, brand
// → cleaned brand (first 1–2 meaningful words, descriptors stripped),
// pure noise → "صديقي".
const BRAND_DESCRIPTORS = new Set([
  "for", "and", "the",
  "co", "co.", "llc", "ltd", "inc", "company",
  "studio", "studios", "atelier",
  "events", "event", "weddings", "wedding",
  "catering", "photography", "videography", "productions", "production",
  "official", "page", "egypt",
]);

function cleanBrand(name: string): string {
  const tokens = name.split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter(
    (t) => !BRAND_DESCRIPTORS.has(t.toLowerCase().replace(/[.,]/g, "")),
  );
  const picked = (meaningful.length ? meaningful : tokens).slice(0, 2);
  return picked.join(" ").trim();
}

function looksLikePersonName(name: string): boolean {
  // Two short word, no brand descriptors, no digits → probably a person.
  const tokens = name.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 3) return false;
  if (/\d/.test(name)) return false;
  for (const t of tokens) {
    if (BRAND_DESCRIPTORS.has(t.toLowerCase().replace(/[.,]/g, ""))) {
      return false;
    }
  }
  return true;
}

function heuristicSlots(prospect: {
  display_name: string;
  city?: string | null;
}): PersonalizationSlots {
  const name = (prospect.display_name ?? "").trim();
  let firstName: string;
  if (!name || /^[\W_]+$/.test(name) || /^user[_-]?\d+$/i.test(name)) {
    firstName = "صديقي";
  } else if (looksLikePersonName(name)) {
    firstName = name.split(/\s+/)[0] ?? name;
  } else {
    firstName = cleanBrand(name) || name;
  }
  const specific = prospect.city ? `شغلك في ${prospect.city}` : "شغلك";
  return { first_name: firstName, specific };
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

  let slots: PersonalizationSlots;
  try {
    const raw = await callJson<Partial<PersonalizationSlots>>([
      { role: "system", content: SLOT_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({ prospect: input.prospect }),
      },
    ]);
    const fallback = heuristicSlots(input.prospect);
    slots = {
      first_name:
        (typeof raw.first_name === "string" && raw.first_name.trim()) ||
        fallback.first_name,
      specific:
        (typeof raw.specific === "string" && raw.specific.trim()) ||
        fallback.specific,
    };
  } catch {
    // If the LLM is down or rate-limited, still produce a usable draft
    // from the template — the operator can edit before sending.
    slots = heuristicSlots(input.prospect);
  }

  const body = renderTemplate(input.template.body, slots, signupUrl);
  return {
    subject: input.template.subject?.slice(0, 200) ?? undefined,
    body,
  };
}
