import OpenAI from "openai";

const openai = new OpenAI();
const MODEL = process.env.AI_SCENE_MODEL ?? process.env.AI_MODEL ?? "openai/gpt-4o-mini";

const SYSTEM_PROMPT = `You are a professional wedding planner and event venue layout designer. You generate 3D venue layouts as JSON. Floor=XZ plane, Y=up, origin=(0,0,0)=center. Back wall=+Z, entrance=-Z.

ITEMS (type | y | notes):
round_table | 0 | seats 8, r=0.7m
rectangular_table | 0 | seats 6, 1.3x0.75m
arch | 0 | variant:"round"|"square", 2.2m wide
stage | 0 | 4x2m, against back wall
flower_vase | 0.81 | on tables
flower_centerpiece | 0.81 | on tables
tall_arrangement | 0.81 | on tables
candelabra | 0.81 | on tables
candle_cluster | 0.81 | on tables or floor(y=0)
lantern | 0 | floor
backdrop_panel | 0 | against wall
mirror_panel | 0 | floor
garland | 0 | floor/edges
aisle_runner | 0 | floor, scale x for length

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
