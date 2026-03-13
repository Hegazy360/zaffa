import OpenAI from "openai";

const openai = new OpenAI();
const MODEL = process.env.AI_SCENE_MODEL ?? process.env.AI_MODEL ?? "openai/gpt-4o-mini";
const IMAGE_MODEL = process.env.AI_IMAGE_MODEL ?? "google/gemini-3-pro-image-preview";

const SYSTEM_PROMPT = `You are a professional wedding planner and event venue layout designer. You generate 3D venue layouts as JSON. Floor=XZ plane, Y=up, origin=(0,0,0)=center. Back wall=+Z, entrance=-Z.

ITEMS (type | y | notes):
TABLES: round_table(0,seats 8,r=0.7m,surface=0.81) | rectangular_table(0,seats 6,1.3x0.75m,surface=0.80) | cocktail_table(0,standing,tall,surface=1.11) | sweetheart_table(0,couple table,surface=0.43) | gift_table(0,gift/card display,surface=0.43) | bar_counter(0,bar area,surface=1.1) | buffet_table(0,food service,surface=0.43)
SEATING: bench(0,long pew) | lounge_sofa(0,lounge area)
FLORALS: flower_vase(on tables,y=surface) | flower_centerpiece(on tables,y=surface) | tall_arrangement(on tables,y=surface) | arch(0,variant:"round"|"square") | garland(0,floor/edges) | wreath(1.2,wall-mounted) | topiary(0,floor) | petal_scatter(0,floor) | potted_plant(0,floor) | flower_wall(0,backdrop)
LIGHTING: candelabra(on tables,y=surface) | candle_cluster(on tables y=surface or floor y=0) | lantern(0,floor) | floor_uplight(0,floor edges)
DECOR: backdrop_panel(0,against wall) | mirror_panel(0,floor) | aisle_runner(0,floor,scale x) | balloon_arch(0,entrances) | balloon_column(0,flanking) | welcome_sign(0,entrance) | cake_stand(0,cake table) | photo_frame(0,display) | neon_sign(0,wall) | fabric_drape(0,wall/ceiling) | dessert_table(0,dessert area) | dj_booth(0,entertainment area)
STRUCTURE: stage(0,4x2m,back wall) | column_pillar(0,flanking) | pergola(0,overhead frame) | dance_floor(0,center area)

TABLE SURFACE HEIGHTS for items placed ON tables: round_table=0.81, rectangular_table=0.80, sweetheart_table=0.43, gift_table=0.43, cocktail_table=1.11, dessert_table=0.43, bar_counter=1.1, buffet_table=0.43. Use the correct Y for each table type when placing centerpieces, candelabras, etc.

RULES: Tables 3m+ apart. Grid/arc layout. Leave center aisle/dance floor clear. Stage at back wall facing audience (ry=PI). Arch near stage facing audience (ry=PI). Backdrop panels against back wall facing audience (ry=PI). 1 centerpiece per table. 0.5m wall margin. DO NOT generate chairs—they are added automatically.

Guest-to-table math: round=8/table, rect=6/table.

OUTPUT: Pure JSON, no comments, no fences.
{"venue":{"width":N,"length":N,"height":5,"floorType":"ceramic|marble|wood|grass|sand|concrete","floorColor":"#hex","wallColor":"#hex"},"items":[{"id":"str","type":"str","position":[x,y,z],"rotation":[0,ry,0],"scale":[1,1,1],"color":"#hex","variant":"str"}]}`;

export interface SceneGeneratorInput {
  prompt: string;
  venueWidth: number;
  venueLength: number;
}

function generateChairs(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const chairs: Record<string, unknown>[] = [];
  let chairId = 0;

  for (const item of items) {
    const type = item.type as string;
    const pos = item.position as number[];
    if (!pos) continue;

    if (type === "round_table") {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        const cx = pos[0] + Math.cos(angle) * 0.85;
        const cz = pos[2] + Math.sin(angle) * 0.85;
        const dx = pos[0] - cx;
        const dz = pos[2] - cz;
        const ry = Math.atan2(dx, dz);
        chairs.push({
          id: `chair_${chairId++}`,
          type: "chair",
          position: [cx, 0, cz],
          rotation: [0, ry, 0],
          scale: [1, 1, 1],
        });
      }
    } else if (type === "rectangular_table") {
      const rot = item.rotation as number[] | undefined;
      const tableRy = rot?.[1] ?? 0;
      const offsets = [
        [-0.45, -0.55], [0, -0.55], [0.45, -0.55],
        [-0.45, 0.55], [0, 0.55], [0.45, 0.55],
      ];
      for (const [ldx, ldz] of offsets) {
        const cx = pos[0] + ldx * Math.cos(tableRy) - ldz * Math.sin(tableRy);
        const cz = pos[2] + ldx * Math.sin(tableRy) + ldz * Math.cos(tableRy);
        const dx = pos[0] - cx;
        const dz = pos[2] - cz;
        const ry = Math.atan2(dx, dz);
        chairs.push({
          id: `chair_${chairId++}`,
          type: "chair",
          position: [cx, 0, cz],
          rotation: [0, ry, 0],
          scale: [1, 1, 1],
        });
      }
    }
  }

  return chairs;
}

export async function generateScene(input: SceneGeneratorInput) {
  const hw = input.venueWidth / 2;
  const hl = input.venueLength / 2;

  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `${input.prompt}\n\nVenue: ${input.venueWidth}x${input.venueLength}m. Bounds: X[${-hw},${hw}] Z[${-hl},${hl}].`,
      },
    ],
    temperature: 0.7,
  });

  let text = (response.choices[0]?.message?.content ?? "").trim();

  text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?\s*```$/, "");
  text = text.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  text = text.replace(/,\s*([}\]])/g, "$1");

  const parsed = JSON.parse(text);

  if (!parsed.venue || !Array.isArray(parsed.items)) {
    throw new Error("Invalid scene JSON: missing venue or items");
  }

  for (const item of parsed.items) {
    if (!item.position || !Array.isArray(item.position)) continue;
    item.position[0] = Math.max(-hw + 0.5, Math.min(hw - 0.5, item.position[0]));
    item.position[2] = Math.max(-hl + 0.5, Math.min(hl - 0.5, item.position[2]));
    if (item.position[1] === undefined) item.position[1] = 0;

    if (!item.rotation) item.rotation = [0, 0, 0];

    const type = item.type as string;
    const z = item.position[2] as number;

    if (type === "stage" || type === "backdrop_panel") {
      if (z > 0) item.rotation = [0, Math.PI, 0];
    }
    if (type === "arch" && z > 0) {
      item.rotation = [0, Math.PI, 0];
    }
  }

  const chairs = generateChairs(parsed.items);
  parsed.items = [...parsed.items, ...chairs];

  return parsed as { venue: Record<string, unknown>; items: Record<string, unknown>[] };
}

export interface RenderSceneInput {
  screenshot: string;
  description: string;
  aspectRatio?: number;
}

export async function renderScene(input: RenderSceneInput) {
  const base64 = input.screenshot.startsWith("data:")
    ? input.screenshot
    : `data:image/png;base64,${input.screenshot}`;

  const floorType = input.description || "ceramic";
  const envMap: Record<string, string> = {
    grass: "an outdoor garden with lush green grass extending naturally in all directions, trees and greenery in the background",
    sand: "an outdoor beach setting with sand extending naturally in all directions, ocean or dunes in the background",
    wood: "an elegant indoor ballroom with polished hardwood floors extending to the walls",
    marble: "a luxurious indoor hall with marble floors extending to the walls",
    ceramic: "an elegant indoor venue with tiled ceramic floors extending to the walls",
    concrete: "a modern industrial loft space with concrete floors extending to the walls",
  };
  const environment = envMap[floorType] ?? envMap.ceramic;

  const prompt = `This is a 3D render of an event venue. Create a photorealistic version of this exact scene. Keep the same camera angle, same dimensions, same number and position of every item. Do not add, remove, or rearrange anything — absolutely NO extra tables, chairs, or event items beyond what is shown. Just upgrade the visual quality — replace the 3D materials with realistic textures (fabric, wood, metal, glass, flowers) and add natural lighting and soft shadows. The venue is set in ${environment}. Fill the surrounding black area with ONLY natural environment (grass, trees, sky, etc.) — do NOT place any additional furniture or event items outside the venue area. The output should look like a real photo of the same scene.`;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: IMAGE_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: base64 } },
            { type: "text", text: prompt },
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Image generation failed: ${response.status} ${err}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message;

  if (!message?.images?.length) {
    throw new Error("No image was generated");
  }

  return {
    imageUrl: message.images[0].image_url.url as string,
    text: message.content as string | null,
  };
}
