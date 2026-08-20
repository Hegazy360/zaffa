// LLM helpers for the admin post generator.
//
// Three responsibilities:
//
//   1. namePalette() - given a vibe, return a 5-color NamedPalette
//                              (poetic per-color names + hex). Used when
//                              the admin doesn't supply one.
//   2. generateCaptionAndTags(), write the Instagram caption + 5 hashtags
//                              following the Zaffa voice.
//   3. generateThreeWords(), produce three short evocative words for the
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
import { chatCompletionJson } from "@/server/llm/openrouter";

const MODEL = process.env.POSTS_LLM_MODEL ?? "openai/gpt-4.1-mini";

async function callJson<T>(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  temperature = 0.7,
): Promise<T> {
  return chatCompletionJson<T>({
    model: MODEL,
    messages,
    temperature,
    appTitle: "Zaffa post-generator",
  });
}

// ---------- Vibe generation ----------

const VIBE_SYSTEM = `You invent fresh "vibes" for a wedding-design carousel
generator at Zaffa. A vibe is a short 2-3-word Title-Case descriptor that
doubles as (a) a Pinterest search query and (b) a token interpolated
into image-gen prompts and editorial slide headlines.

Region mix you should roughly follow across many calls:
  ~50% MENA (Egypt, Lebanon, Jordan, Morocco, Gulf, Andalusia)
  ~20% Europe (Italy, France, Greece, Spain, Portugal, UK)
  ~10% Asia (India, Japan, Indonesia, Korea)
  ~10% Latin America (Mexico, Colombia, Brazil)
  ~10% Global / abstract (textures, time-of-day moods, season, fabric)

Output strictly JSON:
{
  "vibe": string,        // 2-3 Title-Case words, no punctuation
  "region": string,      // one of: mena | europe | asia | latam | global
  "reasoning": string    // 1 short sentence (you'll see this in logs)
}

Rules:
- Never use an em dash or en dash. A comma, a full stop, or a plain hyphen instead.
- Title Case (capitalize each significant word). No punctuation. No emoji.
  Examples: "Cairo Rooftop", "Tuscan Garden", "Wadi Rum Tent",
  "Pampas Grass Dusk", "Neutral Linen Minimalism".
- 2-3 words. Concrete enough to Pinterest-search, evocative enough to
  inspire image-gen.
- AVOID anything in the "recent_vibes" list provided by the user, pick
  something visually distinct from those, not a synonym.
- Don't translate or use Arabic script, romanized place names are fine.
- Skip generic single words ("Wedding", "Romantic", "Elegant"); the vibe
  should imply a setting, era, fabric, or atmosphere.`;

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
    // High temperature, variety is the whole point.
    1.05,
  );

  // Preserve case so headlines and Pinterest searches both work, strip
  // trailing punctuation only.
  const vibe = (out.vibe ?? "")
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
called Zaffa. Given a "vibe" (a short evocative descriptor like "Tuscan
Garden" or "Cairo Rooftop"), produce a named 5-color palette suited to
editorial wedding photography.

Output strictly JSON in this shape:
{
  "name": string,                                 // palette name, Title Case, 2-4 words (e.g. "Tuscan Dusk")
  "colors": [
    { "name": string, "hex": string },             // exactly 5 entries
    ...
  ]
}

Rules:
- Never use an em dash or en dash. A comma, a full stop, or a plain hyphen instead.
- "name" is Title Case, no quotes, no punctuation. 2-4 words.
- Each color "name" is 1-3 Title-Case words, evocative but tasteful
  (e.g. "Rose Dust", "Verdigris", "Champagne", "Umber", "Smoked Olive").
  Avoid cliches ("Blush Pink", "Navy Blue") - surprise the eye.
- "hex" is a 6-digit hex with leading "#".
- The 5 colors must work together: 1 dominant, 2 supporting, 2 accents.
- The palette as a whole should evoke the vibe, not literal colors of
  the place but the feeling of it.
- Output ONLY the JSON object, no prose.`;

/**
 * Light Title-Case normalizer for LLM output that occasionally slips
 * back into lowercase. Capitalizes the first letter of every word
 * separated by whitespace; leaves anything already uppercase alone.
 */
function toTitleCase(s: string): string {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w[0] ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export async function namePalette(input: { vibe: string }): Promise<NamedPalette> {
  const out = await callJson<{
    name: string;
    colors: NamedColor[];
  }>([
    { role: "system", content: PALETTE_SYSTEM },
    { role: "user", content: JSON.stringify({ vibe: input.vibe }) },
  ]);

  const rawName = (out.name ?? "").trim().slice(0, 60);
  const name = (rawName ? toTitleCase(rawName) : input.vibe) || input.vibe;
  const colors = (out.colors ?? [])
    .filter((c) => typeof c?.hex === "string" && /^#[0-9a-f]{6}$/i.test(c.hex))
    .slice(0, 5)
    .map((c) => ({
      name: toTitleCase((c.name ?? "").trim().slice(0, 30)) || c.hex,
      hex: c.hex.toUpperCase(),
    }));

  if (colors.length !== 5) {
    throw new Error("Palette LLM returned the wrong number of colors");
  }
  return { name, colors };
}

// ---------- Caption + hashtags ----------

const CAPTION_SYSTEM = `You are the in-house copywriter for Zaffa, a wedding
planning brand. The voice is editorial, intimate, confident - like a
Cereal Magazine spread crossed with a stylist's voice note. Use proper
sentence case and real punctuation: periods, commas, em-dashes (-),
colons. Short sentences, then one long one for rhythm. No hype words
("stunning", "obsessed", "OMG"). No exclamation marks. No emoji.

You write Instagram captions for editorial wedding-design carousels.
Each post has a vibe (e.g. "Tuscan Garden", "Cairo Rooftop"), a couple
(one girl + one boy by convention), a 5-color palette, and a format.

Output strictly JSON:
{
  "caption":  string,           // 320-720 chars, sentence case, 3-4 short paragraphs
  "hashtags": string[]          // EXACTLY 5 entries, each WITHOUT the leading '#'
}

Caption rules:
- Sentence case. Real punctuation. NO exclamation marks. NO emoji.
- 3-4 short paragraphs separated by a single blank line ("\\n\\n").
- Paragraph 1: hook, a single concrete image or sensory line that lands
  the vibe (e.g. "Olive trees, slow shadows, a long linen runner.").
- Paragraph 2: the design intent - what the couple cares about, what
  the palette does, what the format proves. Treat the couple's first
  names as a once-mentioned detail, not the subject.
- Paragraph 3: a soft brand line about Zaffa designing weddings around
  a vibe rather than a checklist.
- Final line: a quiet call to action that matches the format. Examples:
  "Save this one." / "We're designing more of these, DM 'lookbook'." /
  "This is what we mean by a brief." / "Three weeks from vibe to plan."
- Don't list every color literally. Name one or two if it adds rhythm.
- Don't translate the vibe phrase. Don't define jargon.

Hashtag rules - EXACTLY 5 entries, in this order:
  1. broad - wedding/event-design at large (e.g. "weddinginspo",
                     "weddingaesthetic")
  2. vibe-specific - tied to the vibe ("tuscanwedding", "riadwedding")
  3. community - the couple/planner community ("egyptianbride",
                     "menabride", "weddingplannerlife")
  4. cultural - when applicable to the vibe (e.g. "arabwedding",
                     "ifyoukno"); if not applicable, supply another
                     community-flavor tag
  5. zaffa-adjacent - brand-aligned ("zaffabrief", "zaffaesthetic",
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
return three captions, one per slide.

Output strictly JSON:
{ "captions": [string, string, string] }

Rules:
- Never use an em dash or en dash. A comma, a full stop, or a plain hyphen instead.
- EXACTLY 3 entries.
- Each is EXACTLY 3 Title-Case words separated by single spaces. No
  punctuation. No emoji. (e.g. "Olive, Linen, Light", "Slow Morning
  Ritual" - but render as Title Case without commas: "Olive Linen Light",
  "Slow Morning Ritual".)
- Together they read as a triptych - one feeling per slide, escalating
  toward the closing CTA slide.
- Lean editorial and sensory, not literal.`;

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
    .map((s) => String(s).trim().replace(/[.,!?;:]+$/g, ""))
    .map(toTitleCase)
    .filter((s) => s.split(/\s+/).length === 3)
    .slice(0, 3);

  if (captions.length !== 3) {
    throw new Error("Three-words LLM returned the wrong number of captions");
  }
  return [captions[0], captions[1], captions[2]];
}
