import OpenAI from "openai";

const openai = new OpenAI();

const MODEL = process.env.AI_MODEL ?? "openai.gpt-oss-120b";

interface MoodBoardInput {
  style: string;
  colors?: string[];
  eventType: string;
}

export async function generateMoodBoard(input: MoodBoardInput) {
  const prompt = `Draw a stunning mood board for a ${input.eventType} in Egypt with a ${input.style} style.${
    input.colors?.length ? ` Use these colors: ${input.colors.join(", ")}.` : ""
  } Include decorations, flowers, table settings, and lighting arranged in an elegant collage layout.`;

  const response = await openai.responses.create({
    model: MODEL,
    input: prompt,
    tools: [{ type: "image_generation" as const }],
  });

  const imageCall = response.output.find(
    (o) => o.type === "image_generation_call"
  );

  if (!imageCall || imageCall.type !== "image_generation_call") {
    throw new Error("No image generated");
  }

  return {
    imageBase64: imageCall.result,
    prompt,
    responseId: response.id,
  };
}

interface VenueVisualizationInput {
  venueImages: string[]; // base64-encoded images
  style: string;
  colors?: string[];
  eventType: string;
  additionalNotes?: string;
}

export async function visualizeVenue(input: VenueVisualizationInput) {
  const styleDescription = [
    `${input.eventType} in Egypt`,
    `${input.style} style`,
    input.colors?.length ? `color palette: ${input.colors.join(", ")}` : null,
    input.additionalNotes ?? null,
  ]
    .filter(Boolean)
    .join(", ");

  const prompt = `Edit these venue photos to show how they would look decorated for a ${styleDescription}. Add elegant decorations, floral arrangements, lighting, table settings, and draping. Keep the architecture and layout exactly as-is — only add decorations.`;

  const imageInputs = input.venueImages.map((img) => ({
    type: "input_image" as const,
    image_url: img.startsWith("data:")
      ? img
      : `data:image/jpeg;base64,${img}`,
    detail: "high" as const,
  }));

  const response = await openai.responses.create({
    model: MODEL,
    input: [
      {
        role: "user" as const,
        content: [
          { type: "input_text" as const, text: prompt },
          ...imageInputs,
        ],
      },
    ],
    tools: [{ type: "image_generation" as const }],
  });

  const imageCall = response.output.find(
    (o) => o.type === "image_generation_call"
  );

  if (!imageCall || imageCall.type !== "image_generation_call") {
    throw new Error("No image generated");
  }

  return {
    imageBase64: imageCall.result,
    prompt,
    responseId: response.id,
  };
}

export async function refineVisualization(
  previousResponseId: string,
  instruction: string
) {
  const response = await openai.responses.create({
    model: MODEL,
    previous_response_id: previousResponseId,
    input: instruction,
    tools: [{ type: "image_generation" as const }],
  });

  const imageCall = response.output.find(
    (o) => o.type === "image_generation_call"
  );

  if (!imageCall || imageCall.type !== "image_generation_call") {
    throw new Error("No image generated");
  }

  return {
    imageBase64: imageCall.result,
    prompt: instruction,
    responseId: response.id,
  };
}
