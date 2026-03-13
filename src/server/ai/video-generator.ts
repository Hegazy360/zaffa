import { cloudinary } from "@/lib/cloudinary";

const LUMA_API_URL = "https://api.lumalabs.ai/dream-machine/v1";
const LUMA_API_KEY = process.env.LUMA_API_KEY;

function lumaHeaders() {
  if (!LUMA_API_KEY) throw new Error("LUMA_API_KEY is not configured");
  return {
    Authorization: `Bearer ${LUMA_API_KEY}`,
    "Content-Type": "application/json",
  };
}

async function uploadToCloudinary(base64DataUrl: string): Promise<string> {
  const result = await cloudinary.uploader.upload(base64DataUrl, {
    folder: "zaffa-renders",
    resource_type: "image",
    type: "upload",
  });
  return result.secure_url;
}

export interface StartVideoInput {
  imageBase64: string;
  prompt: string;
}

export async function startVideoGeneration(input: StartVideoInput) {
  const imageUrl = await uploadToCloudinary(input.imageBase64);

  const response = await fetch(`${LUMA_API_URL}/generations`, {
    method: "POST",
    headers: lumaHeaders(),
    body: JSON.stringify({
      model: "ray-flash-2",
      prompt: `Aerial drone shot already high above this decorated event venue, slowly gliding forward across the entire scene from one end to the other. Camera maintains steady elevated angle throughout, no ascending or descending. ${input.prompt}. Candle flames flicker softly, fabric sways gently, warm golden lighting. Smooth constant-speed forward dolly movement. Professional wedding cinematography.`,
      aspect_ratio: "16:9",
      duration: "5s",
      keyframes: {
        frame0: {
          type: "image",
          url: imageUrl,
        },
      },
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Luma API error: ${response.status} ${err}`);
  }

  const data = await response.json();
  return { generationId: data.id as string, imageUrl };
}

export interface VideoStatus {
  state: "queued" | "dreaming" | "completed" | "failed";
  videoUrl: string | null;
  progress: number | null;
}

export async function getVideoStatus(generationId: string): Promise<VideoStatus> {
  const response = await fetch(`${LUMA_API_URL}/generations/${generationId}`, {
    headers: lumaHeaders(),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Luma API error: ${response.status} ${err}`);
  }

  const data = await response.json();

  return {
    state: data.state,
    videoUrl: data.assets?.video ?? null,
    progress: data.state === "dreaming" ? (data.progress ?? 0.5) : null,
  };
}
