import OpenAI from "openai";

const openai = new OpenAI();

const MODEL = process.env.AI_MODEL ?? "openai.gpt-oss-120b";

export interface VisualQuizSelections {
  vibe?: string[];
  palette?: string[];
  flower_types?: string[];
  bouquet?: string[];
  table_florals?: string[];
  ceremony_flowers?: string[];
  table_style?: string[];
  table_centerpiece?: string[];
  lighting?: string[];
  venue_decor?: string[];
}

export async function generateStyleRecommendations(
  selections: VisualQuizSelections
) {
  const response = await openai.responses.create({
    model: MODEL,
    input: [
      {
        role: "user",
        content: `You are a world-class wedding and event style consultant with deep knowledge of global trends, from European minimalism to South Asian grandeur, Middle Eastern opulence, American rustic charm, and everything in between. Based on the user's visual quiz selections below, create a comprehensive, personalized style guide.

Respond with ONLY valid JSON in this exact structure:
{
  "style_name": "string - a creative name for their unique style (e.g., 'Enchanted Garden Romance', 'Modern Luxe Minimalism')",
  "summary": "2-3 sentence personalized style summary tying everything together",
  "palette": ["array of 5 hex color codes that harmonize with their choices"],
  "vibe_description": "1-2 sentences describing the overall mood and atmosphere",
  "flowers": {
    "types": ["array of 3-5 recommended flower types"],
    "arrangement_tip": "one specific arrangement tip based on their choices"
  },
  "table_design": {
    "style": "recommended table setting description",
    "centerpiece_tip": "one specific centerpiece tip"
  },
  "lighting": {
    "types": ["array of 2-4 recommended lighting elements"],
    "ambiance_tip": "one specific lighting/ambiance tip"
  },
  "venue_decor": {
    "elements": ["array of 3-5 decor elements"],
    "styling_tip": "one specific venue styling tip"
  },
  "pro_tips": ["array of 3 unique professional tips that tie their choices together"]
}

User's visual selections:
- Overall vibe: ${(selections.vibe ?? []).join(", ") || "not specified"}
- Preferred color palette: ${(selections.palette ?? []).join(", ") || "not specified"}
- Flower preferences: ${(selections.flower_types ?? []).join(", ") || "not specified"}
- Bouquet style: ${(selections.bouquet ?? []).join(", ") || "not specified"}
- Table florals: ${(selections.table_florals ?? []).join(", ") || "not specified"}
- Ceremony flowers (arch/backdrop): ${(selections.ceremony_flowers ?? []).join(", ") || "not specified"}
- Table style: ${(selections.table_style ?? []).join(", ") || "not specified"}
- Centerpiece preference: ${(selections.table_centerpiece ?? []).join(", ") || "not specified"}
- Lighting choices: ${(selections.lighting ?? []).join(", ") || "not specified"}
- Venue decor: ${(selections.venue_decor ?? []).join(", ") || "not specified"}`,
      },
    ],
  });

  const jsonMatch = response.output_text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return JSON.parse(jsonMatch[0]);
}

export async function generateStepAdvice(
  currentCategory: string,
  selectionsSoFar: VisualQuizSelections
): Promise<string> {
  const response = await openai.responses.create({
    model: MODEL,
    input: [
      {
        role: "user",
        content: `You are a friendly, expert wedding style consultant. The user is taking a visual style quiz and just made their selections. Give them a brief, encouraging tip (2-3 sentences max) about what to consider for the next step. Be specific to their choices and mention current trends.

Their selections so far:
${JSON.stringify(selectionsSoFar, null, 2)}

They just completed: ${currentCategory}

Give a brief tip about what pairs well with their choices for the next step. Keep it warm, concise, and helpful. Do NOT use JSON format - just plain text.`,
      },
    ],
  });

  return response.output_text.trim();
}

export async function generatePaletteSuggestions(
  vibe: string[]
): Promise<{ id: string; name: string; colors: string[] }[]> {
  const response = await openai.responses.create({
    model: MODEL,
    input: [
      {
        role: "user",
        content: `You are a color theory expert specializing in event design. Based on these style vibes: ${vibe.join(", ")}, suggest 4 harmonious color palettes.

Respond with ONLY valid JSON - an array of 4 objects:
[
  { "id": "1", "name": "palette name", "colors": ["#hex1", "#hex2", "#hex3", "#hex4", "#hex5"] },
  ...
]

Make palettes diverse: one warm, one cool, one neutral/earthy, one bold/unexpected. Names should be evocative (e.g., "Tuscan Sunset", "Midnight Garden", "Coastal Breeze").`,
      },
    ],
  });

  const jsonMatch = response.output_text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("No JSON array found in response");

  return JSON.parse(jsonMatch[0]);
}
