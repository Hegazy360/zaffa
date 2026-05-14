// LLM helpers for the admin post generator.
//
// Three responsibilities:
//
//   1. namePalette()        — given a vibe, return a 5-color NamedPalette
//                              (poetic per-color names + hex). Used when
//                              the admin doesn't supply one.
//   2. generateCaptionAndTags() — write the Instagram caption + 5 hashtags
//                              following the Zaffa voice.
//   3. generateThreeWords() — produce three short evocative words for the
//                              `three_words` format slides.
//
// All calls go through OpenRouter using OPENAI_API_KEY (same auto-detect
// as src/server/services/prospects/llm.ts). We use response_format
// json_object so parsing is safe.

import type {
  NamedPalette,
  NamedColor,
  PostFormatId,
} from "@/types/posts";

const BASE_URL = "https://openrouter.ai/api/v1";
const MODEL = process.env.POSTS_LLM_MODEL ?? "openai/gpt-4.1-mini";

function authHeaders(): Record<string, string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for posts LLM calls");
  }
  return {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
    "HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://zaffa.ai",
    "X-Title": "Zaffa post-generator",
  };
}

async function callJson<T>(
  messages: Array<{ role: string; content: string }>,
  temperature = 0.7,
): Promise<T> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_object" },
      messages,
      temperature,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Posts LLM ${res.status}: ${text.slice(0, 400)}`);
  }
  const raw = await res.text();
  let data: { choices?: Array<{ message?: { content?: string } }> };
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`Posts LLM returned non-JSON body: ${raw.slice(0, 200)}`);
  }
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Posts LLM returned empty content");
  return JSON.parse(content) as T;
}

// ---------- Vibe generation ----------

const VIBE_SYSTEM = `You invent fresh "vibes" for a wedding-design carousel
generator at Zaffa. A vibe is a short 2-3-word lowercase descriptor that
doubles as (a) a Pinterest search query and (b) a token interpolated
into image-gen prompts.

Region mix you should roughly follow across many calls:
  ~50% MENA (egypt, lebanon, jordan, morocco, gulf, andalusia)
  ~20% Europe (italy, france, greece, spain, portugal, uk)
  ~10% Asia (india, japan, indonesia, korea)
  ~10% Latin America (mexico, colombia, brazil)
  ~10% Global / abstract (textures, time-of-day moods, season, fabric)

Output strictly JSON:
{
  "vibe": string,        // 2-3 lowercase words, no punctuation
  "region": string,      // one of: mena | europe | asia | latam | global
  "reasoning": string    // 1 short sentence (you'll see this in logs)
}

Rules:
- LOWERCASE only. No punctuation. No emoji.
- 2-3 words. Concrete enough to Pinterest-search ("cairo rooftop",
  "tuscan garden", "wadi rum tent"), evocative enough to inspire
  image-gen ("pampas grass dusk", "neutral linen minimalism").
- AVOID anything in the "recent_vibes" list provided by the user — pick
  something visually distinct from those, not a synonym.
- Don't translate or use Arabic script — romanized place names are fine.
- Skip generic words ("wedding", "romantic", "elegant") on their own;
  the vibe should imply a setting, era, or material.`;

export interface GenerateVibeInput {
  /**
   * Recently-used vibes the generator should avoid repeating (e.g. the
   * last 20 posts from the DB). Pass an empty array on a cold start.
   */
  recentVibes?: string[];
}

export interface GeneratedVibe {
  vibe: string;
  region: "mena" | "europe" | "asia" | "latam" | "global";
  reasoning: string;
}

export async function generateVibe(
  input: GenerateVibeInput = {},
): Promise<GeneratedVibe> {
  const out = await callJson<{
    vibe?: string;
    region?: string;
    reasoning?: string;
  }>(
    [
      { role: "system", content: VIBE_SYSTEM },
      {
        role: "user",
        content: JSON.stringify({
          recent_vibes: (input.recentVibes ?? []).slice(0, 30),
        }),
      },
    ],
    // High temperature — variety is the whole point.
    1.05,
  );

  const vibe = (out.vibe ?? "")
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:]+$/g, "")
    .slice(0, 60);
  const words = vibe.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) {
    throw new Error(`Vibe LLM returned an invalid phrase: "${vibe}"`);
  }
  const allowedRegions = ["mena", "europe", "asia", "latam", "global"] as const;
  const region = (allowedRegions as readonly string[]).includes(out.region ?? "")
    ? (out.region as GeneratedVibe["region"])
    : "global";
  return { vibe, region, reasoning: (out.reasoning ?? "").slice(0, 200) };
}

// ---------- Palette naming ----------

const PALETTE_SYSTEM = `You are a color stylist for a wedding planning brand
called Zaffa. Given a "vibe" (a short evocative descriptor like "tuscan
garden" or "cairo rooftop"), produce a named 5-color palette suited to
editorial wedding photography.

Output strictly JSON in this shape:
{
  "name": string,                                 // palette name, lowercase, 2-4 words (e.g. "tuscan dusk")
  "colors": [
    { "name": string, "hex": string },             // exactly 5 entries
    ...
  ]
}

Rules:
- "name" is lowercase, no quotes, no punctuation.
- Each color "name" is 1-3 lowercase words evocative but tasteful (e.g.
  "rose dust", "verdigris", "champagne", "umber", "smoked olive"). Avoid
  cliches ("blush pink", "navy blue") — surprise the eye.
- "hex" is a 6-digit hex with leading "#".
- The 5 colors must work together: 1 dominant, 2 supporting, 2 accents.
- The palette as a whole should evoke the vibe — not literal colors of
  the place but the feeling of it.
- Output ONLY the JSON object, no prose.`;

export async function namePalette(input: { vibe: string }): Promise<NamedPalette> {
  const out = await callJson<{
    name: string;
    colors: NamedColor[];
  }>([
    { role: "system", content: PALETTE_SYSTEM },
    { role: "user", content: JSON.stringify({ vibe: input.vibe }) },
  ]);

  const name = (out.name ?? "").trim().toLowerCase().slice(0, 60) || input.vibe;
  const colors = (out.colors ?? [])
    .filter((c) => typeof c?.hex === "string" && /^#[0-9a-f]{6}$/i.test(c.hex))
    .slice(0, 5)
    .map((c) => ({
      name: (c.name ?? "").toLowerCase().slice(0, 30) || c.hex,
      hex: c.hex.toUpperCase(),
    }));

  if (colors.length !== 5) {
    throw new Error("Palette LLM returned the wrong number of colors");
  }
  return { name, colors };
}

// ---------- Caption + hashtags ----------

const CAPTION_SYSTEM = `You are the in-house copywriter for Zaffa, a wedding
planning brand. The voice is lowercase, intimate, confident — "pinterest
board to a brief no one can misread". Sentences run short. No emoji. No
exclamation marks. No hype.

You write Instagram captions for editorial wedding-design carousels. Each
post has a vibe (e.g. "tuscan garden", "cairo rooftop"), a synthetic
couple, a 5-color palette, and a chosen format.

Output strictly JSON:
{
  "caption":  string,           // 280-700 chars, lowercase, 2-4 short paragraphs
  "hashtags": string[]          // EXACTLY 5 entries, each WITHOUT the leading '#'
}

Caption rules:
- All lowercase. No emoji. No exclamation marks.
- 2-4 short paragraphs separated by a single blank line ("\\n\\n").
- Mention the vibe in passing — don't explain it. Don't translate it.
- Mention the couple by first names at most once, casually.
- Don't list the colors literally. You can name one, max.
- Close with a soft call to action that fits the format (e.g. "save this
  one" / "we're booking these next" / "this is what we mean by a brief").

Hashtag rules — EXACTLY 5 entries, in this order:
  1. broad        — wedding/event-design at large (e.g. "weddinginspo",
                     "weddingaesthetic")
  2. vibe-specific — tied to the vibe ("tuscanwedding", "riadwedding")
  3. community     — the couple/planner community ("egyptianbride",
                     "menabride", "weddingplannerlife")
  4. cultural      — when applicable to the vibe (e.g. "arabwedding",
                     "ifyoukno"); if not applicable, supply another
                     community-flavor tag
  5. zaffa-adjacent — brand-aligned ("zaffabrief", "zaffaesthetic",
                     "designedwithzaffa")

Hashtags are lowercase, no spaces, no punctuation, ascii letters and
digits only, no leading '#'. Do not use the same tag twice.`;

export interface CaptionInput {
  vibe: string;
  format: PostFormatId;
  palette: NamedPalette;
  coupleNames: { partner_a: string; partner_b: string };
}

export interface CaptionOutput {
  caption: string;
  hashtags: string[];
}

export async function generateCaptionAndTags(
  input: CaptionInput,
): Promise<CaptionOutput> {
  const out = await callJson<{ caption: string; hashtags: string[] }>([
    { role: "system", content: CAPTION_SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        vibe: input.vibe,
        format: input.format,
        couple: input.coupleNames,
        palette_name: input.palette.name,
        palette_color_names: input.palette.colors.map((c) => c.name),
      }),
    },
  ]);

  const caption = (out.caption ?? "").trim().slice(0, 1200);
  const hashtags = (out.hashtags ?? [])
    .map((h) => String(h).replace(/^#/, "").trim().toLowerCase())
    .filter((h) => /^[a-z0-9]+$/.test(h))
    .slice(0, 5);

  if (hashtags.length !== 5 || !caption) {
    throw new Error(
      `Caption LLM returned invalid output (${hashtags.length} hashtags, ${caption.length} chars)`,
    );
  }
  return { caption, hashtags };
}

// ---------- Three-word slide captions ----------

const THREE_WORDS_SYSTEM = `You produce short evocative captions for a 3-slide
wedding-design carousel called "three_words". Given a vibe and a palette,
return three captions — one per slide.

Output strictly JSON:
{ "captions": [string, string, string] }

Rules:
- EXACTLY 3 entries.
- Each is EXACTLY 3 lowercase words separated by single spaces. No
  punctuation. No emoji.
- Together they read as a triptych — one feeling per slide, escalating
  toward the closing CTA slide.
- Lean editorial, not literal.`;

export async function generateThreeWords(input: {
  vibe: string;
  palette: NamedPalette;
}): Promise<[string, string, string]> {
  const out = await callJson<{ captions: string[] }>([
    { role: "system", content: THREE_WORDS_SYSTEM },
    {
      role: "user",
      content: JSON.stringify({
        vibe: input.vibe,
        palette_name: input.palette.name,
      }),
    },
  ]);

  const captions = (out.captions ?? [])
    .map((s) => String(s).trim().toLowerCase())
    .filter((s) => s.split(/\s+/).length === 3)
    .slice(0, 3);

  if (captions.length !== 3) {
    throw new Error("Three-words LLM returned the wrong number of captions");
  }
  return [captions[0], captions[1], captions[2]];
}
