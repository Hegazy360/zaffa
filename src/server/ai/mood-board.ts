import OpenAI from "openai";

const openai = new OpenAI();

const MODEL = process.env.AI_MODEL ?? "openai/gpt-4o-mini";

interface MoodBoardInput {
  style: string;
  colors?: string[];
  eventType: string;
}

export async function generateMoodBoard(input: MoodBoardInput) {
  const prompt = `Create a detailed text description of a mood board for a ${input.eventType} with a ${input.style} style.${
    input.colors?.length ? ` Use these colors: ${input.colors.join(", ")}.` : ""
  } Include decorations, flowers, table settings, and lighting.

Respond with ONLY valid JSON:
{
  "description": "detailed 3-4 sentence mood board description",
  "elements": ["array of 6-8 key visual elements"],
  "color_story": "1-2 sentences about the color palette"
}`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.choices[0]?.message?.content ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return {
    ...JSON.parse(jsonMatch[0]),
    prompt,
  };
}

interface VenueVisualizationInput {
  venueImages: string[];
  style: string;
  colors?: string[];
  eventType: string;
  additionalNotes?: string;
}

export async function visualizeVenue(input: VenueVisualizationInput) {
  const styleDescription = [
    input.eventType,
    `${input.style} style`,
    input.colors?.length ? `color palette: ${input.colors.join(", ")}` : null,
    input.additionalNotes ?? null,
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = `Describe how this venue should be decorated for a ${styleDescription}. Include specific recommendations for floral arrangements, lighting, table settings, and draping.

Respond with ONLY valid JSON:
{
  "description": "detailed 3-4 sentence visualization description",
  "decorations": ["array of specific decoration recommendations"],
  "layout_tips": ["array of 3-4 layout suggestions"]
}`;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.choices[0]?.message?.content ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return {
    ...JSON.parse(jsonMatch[0]),
    prompt,
  };
}

export async function refineVisualization(
  _previousResponseId: string,
  instruction: string
) {
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "user",
        content: `Refine this venue decoration plan: ${instruction}

Respond with ONLY valid JSON:
{
  "description": "updated decoration description",
  "changes": ["array of specific changes made"],
  "tips": ["array of 2-3 tips"]
}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in response");

  return {
    ...JSON.parse(jsonMatch[0]),
    prompt: instruction,
  };
}
