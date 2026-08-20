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
    `Cinematic, atmospheric video walkthrough of this exact ${ctx.eventType} venue, in the style of a high-end venue showcase reel - anamorphic 2.39 cinematic feel, shallow depth of field, soft film grain, warm cinematic color grade with slightly lifted blacks.`,

    `Camera motion: ${motion}`,

    `The venue is unoccupied - absolutely no people, no guests, no waitstaff, no human figures, no silhouettes, no shadows of figures. The composition stays focused entirely on the design itself: the tables, florals, lighting, decor, and architecture.`,

    `Subtle micro-motion across the scene: ${atmosphere}.`,

    paletteLine,

    notesLine,

    `Avoid: any people or human figures of any kind, hard cuts, jump cuts, multiple separate scenes, distorted or warped objects, duplicate or extra elements, text overlays, watermarks, logos, frame-rate stutter, vertical aspect ratio.`,
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
    : "Cinematic atmospheric walkthrough of this empty event venue - no people, no guests. Smooth forward dolly at chest height, warm cinematic color grade, candles flickering, fabric swaying gently. No ascending or descending. Avoid any human figures.";

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
