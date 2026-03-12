import OpenAI from "openai";

const openai = new OpenAI();

const MODEL = process.env.AI_MODEL ?? "openai.gpt-oss-120b";

interface ColorPreferences {
  mood: string;
  season?: string;
  colors?: string[];
}

export async function generateColorPalette(preferences: ColorPreferences) {
  const response = await openai.responses.create({
    model: MODEL,
    input: [
      {
        role: "user",
        content: `You are a color theory expert for Egyptian event design. Generate a harmonious color palette.
Respond with ONLY valid JSON in this exact structure:
{
  "primary": "hex color",
  "secondary": "hex color",
  "accent": "hex color",
  "neutral": "hex color",
  "highlight": "hex color",
  "palette_name": "descriptive name for the palette",
  "description": "why these colors work together",
  "usage": {
    "tablecloths": "hex color",
    "flowers": "hex color",
    "lighting": "hex color",
    "invitations": "hex color"
  }
}

Preferences: mood=${preferences.mood}, season=${preferences.season ?? "any"}, favorite colors=${preferences.colors?.join(", ") ?? "none specified"}`,
      },
    ],
  });

  const jsonMatch = response.output_text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return JSON.parse(jsonMatch[0]);
}
