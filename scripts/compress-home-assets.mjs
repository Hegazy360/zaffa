/**
 * Re-export `public/home` at the sizes it is actually displayed at.
 *
 * The directory is 14 MB. Every byte of it ships to a mobile visitor in the
 * Gulf on the first page they see: the how-it-works screenshots are PNGs
 * exported at full retina resolution (one is 2.3 MB) and displayed in a card
 * roughly 600px wide, and the collages are 2 MB PNGs of photographs — the one
 * format that is worst at photographs.
 *
 * What this does:
 *   - Photographs (collages, hero) → AVIF, quality 62, capped at 1600px.
 *   - UI screenshots → AVIF too, but at a higher quality, because AVIF's
 *     ringing is visible on hard UI edges in a way it is not on foliage.
 * No WebP fallback on disk. Every consumer goes through `next/image`, which
 * re-encodes per request from the Accept header — a browser without AVIF
 * support gets a WebP from the optimizer, not from this directory. Shipping
 * both formats as sources doubled the repo weight for files nothing ever
 * requested.
 *
 * Idempotent: skips a source whose outputs are both newer than it. Run with
 * `node scripts/compress-home-assets.mjs`; pass `--check` to report the size
 * delta without writing.
 */

import { readdir, stat, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import sharpImport from "sharp";

const sharp = sharpImport.default ?? sharpImport;

const ROOT = path.join(process.cwd(), "public", "home");
const CHECK = process.argv.includes("--check");

/** Screenshots keep more quality; photographs can take more compression. */
const PROFILES = {
  "how-it-works": { maxWidth: 1400, avifQuality: 72, effort: 6 },
  examples: { maxWidth: 1600, avifQuality: 62, effort: 6 },
  // Sample-studio matrix: photographs, displayed at hero size. Slightly
  // tighter than `examples` because twelve of them ship.
  studio: { maxWidth: 1600, avifQuality: 58, effort: 6 },
};

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else if (/\.(png|jpe?g)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const files = await walk(ROOT);
let before = 0;
let after = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const bucket = rel.split(path.sep)[0];
  const profile = PROFILES[bucket] ?? PROFILES.examples;
  const base = file.replace(/\.(png|jpe?g)$/i, "");
  const avif = `${base}.avif`;

  const src = await stat(file);
  before += src.size;

  const fresh = existsSync(avif) && (await stat(avif)).mtimeMs > src.mtimeMs;

  if (!fresh && !CHECK) {
    await mkdir(path.dirname(avif), { recursive: true });
    const pipeline = sharp(file).resize({
      width: profile.maxWidth,
      withoutEnlargement: true,
    });
    await pipeline
      .clone()
      .avif({ quality: profile.avifQuality, effort: profile.effort })
      .toFile(avif);
  }

  if (existsSync(avif)) after += (await stat(avif)).size;
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
console.log(
  `${files.length} sources: ${mb(before)} → ${mb(after)} as AVIF` +
    (CHECK ? " (check only, nothing written)" : ""),
);
