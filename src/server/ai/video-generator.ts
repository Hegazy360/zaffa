import { cloudinary } from "@/lib/cloudinary";

const LUMA_API_URL = "https://api.lumalabs.ai/dream-machine/v1";
const LUMA_API_KEY = process.env.LUMA_API_KEY;

const VIDEO_MODEL = process.env.LUMA_VIDEO_MODEL ?? "ray-flash-2";
const VIDEO_DURATION = process.env.LUMA_VIDEO_DURATION ?? "5s";
const VIDEO_RESOLUTION = process.env.LUMA_VIDEO_RESOLUTION;

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

export type VideoEventType =
  | "wedding"
  | "engagement"
  | "birthday"
  | "corporate"
  | "other";
export type VideoSetting = "indoor" | "outdoor" | "tent";
export type VideoSize = "intimate" | "medium" | "large";

const GUEST_DESCRIPTION: Record<VideoEventType, string> = {
  wedding:
    "elegantly dressed wedding guests — women in flowing evening gowns, men in tuxedos and formal suits — mingling in small groups, holding flutes of champagne, smiling and quietly conversing; a couple walks slowly arm-in-arm through the mid-ground",
  engagement:
    "well-dressed couples and friends in cocktail attire, holding champagne flutes, laughing softly and toasting; the engaged couple visible mid-frame, walking and smiling",
  birthday:
    "stylish guests in chic cocktail attire mingling and laughing, raising glasses, a few moving subtly to music in the background",
  corporate:
    "guests in elevated business cocktail attire networking and conversing in small groups, holding drinks, exchanging warm handshakes",
  other:
    "elegantly dressed guests in formal cocktail attire mingling and conversing in small groups, holding drinks",
};

const SIZE_DENSITY: Record<VideoSize, string> = {
  intimate:
    "a small, curated group of about 20-30 guests — the space feels full but never crowded",
  medium:
    "a comfortable crowd of around 80-100 guests spread evenly across the space",
  large:
    "a generous gathering of 150+ guests filling the space without feeling chaotic",
};

const CAMERA_MOTION: Record<VideoSetting, string> = {
  indoor:
    "smooth constant-velocity forward dolly through the room on a stabilized gimbal at chest height (~1.4m), gently easing past the foreground tables toward the focal point in the distance, with subtle parallax revealing depth. No ascending, descending, or zooming.",
  outdoor:
    "smooth tracking move along the venue at a steady chest-height elevation (~1.4m) on a stabilized gimbal, drifting forward with a gentle lateral arc that reveals the layout in parallax against the sky and landscape. No ascending, descending, or zooming.",
  tent:
    "smooth forward glide under the tent canopy on a stabilized gimbal at chest height (~1.4m), the camera moving steadily past tables toward the focal point while the canopy and pendant lights pass overhead in soft parallax. No ascending, descending, or zooming.",
};

const ATMOSPHERE: Record<VideoSetting, string> = {
  indoor:
    "candle flames flicker softly on every table, chandeliers glow warmly, faint depth of field on the closest tables, gentle ambient bokeh in the background",
  outdoor:
    "warm golden-hour light, faint sun flare, foliage swaying gently in a breeze, bistro/string lights twinkling on as dusk approaches",
  tent:
    "fairy lights and pendant chandeliers twinkling softly under the canopy, candle flames flickering on tables, fabric draping moving almost imperceptibly",
};

export interface VideoSceneContext {
  eventType: VideoEventType;
  setting: VideoSetting;
  size: VideoSize;
  palette?: { name?: string; colors: string[] };
  styleNotes?: string;
}

function buildVideoPrompt(ctx: VideoSceneContext): string {
  const guests = GUEST_DESCRIPTION[ctx.eventType] ?? GUEST_DESCRIPTION.other;
  const density = SIZE_DENSITY[ctx.size];
  const motion = CAMERA_MOTION[ctx.setting];
  const atmosphere = ATMOSPHERE[ctx.setting];

  const paletteLine =
    ctx.palette && ctx.palette.colors.length
      ? `Preserve the existing color palette of the scene exactly (${ctx.palette.colors.join(
          ", "
        )}); do not introduce new colors.`
      : "Preserve the existing color palette of the scene exactly; do not introduce new colors.";

  const notesLine = ctx.styleNotes?.trim()
    ? `Style notes from the host: ${ctx.styleNotes.trim()}.`
    : "";

  return [
    `Cinematic promotional video of this exact ${ctx.eventType} venue, in the style of a high-end wedding film reel — anamorphic 2.39 cinematic feel, shallow depth of field, soft film grain, warm cinematic color grade with slightly lifted blacks.`,

    `Camera motion: ${motion}`,

    `Populate the previously empty venue with ${density}: ${guests}. People are placed naturally throughout the space — never blocking the focal point, never crowding into the foreground. They occupy the venue without dominating it. Faces are softly out of focus or shown in three-quarter profile; no harsh close-ups, no distorted features.`,

    `Subtle micro-motion across the scene: ${atmosphere}.`,

    paletteLine,

    notesLine,

    `Avoid: hard cuts, jump cuts, multiple separate scenes, chaotic crowd, distorted or warped faces, duplicate or extra limbs, text overlays, watermarks, logos, frame-rate stutter, vertical aspect ratio.`,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface StartVideoInput {
  imageBase64: string;
  context?: VideoSceneContext;
}

export async function startVideoGeneration(input: StartVideoInput) {
  const imageUrl = await uploadToCloudinary(input.imageBase64);

  const prompt = input.context
    ? buildVideoPrompt(input.context)
    : "Cinematic promotional walkthrough of this elegant event venue with elegantly dressed guests mingling, smooth forward dolly at chest height, warm cinematic color grade, candles flickering, fabric swaying gently. No ascending or descending.";

  const body: Record<string, unknown> = {
    model: VIDEO_MODEL,
    prompt,
    aspect_ratio: "16:9",
    duration: VIDEO_DURATION,
    keyframes: {
      frame0: {
        type: "image",
        url: imageUrl,
      },
    },
  };
  if (VIDEO_RESOLUTION) body.resolution = VIDEO_RESOLUTION;

  const response = await fetch(`${LUMA_API_URL}/generations`, {
    method: "POST",
    headers: lumaHeaders(),
    body: JSON.stringify(body),
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
