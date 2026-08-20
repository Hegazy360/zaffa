/**
 * Generate the homepage sample-studio matrix: one render per
 * (vibe × palette) cell, through the SAME pipeline the live designer
 * uses (`renderScene`), so the sample a visitor restyles and the render
 * they then generate for themselves agree in style and quality.
 *
 * Writes PNGs to `public/home/studio/` under the `studioAssetPath`
 * naming convention (minus the extension); `compress-home-assets.mjs`
 * then emits the sibling AVIFs that ship. The PNG sources are
 * gitignored — only the AVIFs are committed.
 *
 * Usage:
 *   npx dotenvx run --env-file=.env.local -- npx tsx scripts/generate-studio-samples.ts
 *   ... --only=garden_romance__noir_emerald     # re-roll one bad cell
 *
 * Idempotent by default: skips cells whose PNG already exists (pass
 * --force to regenerate everything). Cells run sequentially — the image
 * model is the bottleneck and parallel calls just trip rate limits.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { renderScene } from "@/server/ai/scene-generator";
import { STUDIO_VIBES, STUDIO_PALETTES } from "@/data/sample-studio";

const OUT_DIR = path.join(process.cwd(), "public", "home", "studio");
const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7);
const force = process.argv.includes("--force");

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const cells = STUDIO_VIBES.flatMap((vibe) =>
    STUDIO_PALETTES.map((palette) => ({ vibe, palette })),
  );

  for (const { vibe, palette } of cells) {
    const key = `${vibe.id}__${palette.id}`;
    if (only && key !== only) continue;
    const out = path.join(OUT_DIR, `${key}.png`);
    if (!force && !only && existsSync(out)) {
      console.log(`skip  ${key} (exists)`);
      continue;
    }

    console.log(`gen   ${key} ...`);
    const started = Date.now();
    const result = await renderScene({
      eventType: "wedding",
      setting: vibe.setting,
      size: "medium",
      palette: { name: palette.name, colors: palette.colors },
      references: [],
      styleNotes: vibe.promptNotes,
    });

    const res = await fetch(result.imageUrl);
    if (!res.ok) {
      throw new Error(`download failed for ${key}: HTTP ${res.status}`);
    }
    await writeFile(out, Buffer.from(await res.arrayBuffer()));
    console.log(
      `done  ${key} in ${Math.round((Date.now() - started) / 1000)}s`,
    );
  }

  console.log(
    "\nNow run: node scripts/compress-home-assets.mjs  (emits the AVIFs)",
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
