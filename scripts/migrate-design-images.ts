/**
 * One-shot cleanup of legacy inline images stored as `data:` URIs.
 *
 * Two columns historically accepted base64 data URIs that bloat every
 * downstream read (marketing teaser, dashboards, message previews):
 *
 *   1. `venue_designs.thumbnail`, predates the media table.
 *   2. `venue_design_media.url` (renders), the AI scene generator used
 *                                            to persist OpenRouter's
 *                                            inline response verbatim.
 *
 * Both writes are now plugged at the source, `VenueDesigner` saves
 * `thumbnail: null`, the scene generator uploads to Cloudinary before
 * returning, and `saveMedia` rejects `data:` URLs at the tRPC boundary.
 * This script drains the legacy data so the columns are uniformly clean
 * (CDN URL or NULL) and downstream code doesn't have to defend against
 * surprise blobs.
 *
 * Policy:
 *
 *   `venue_designs.thumbnail`:
 *     a. design has any `media[type=render]` row already → just NULL it.
 *     b. thumbnail is `data:` and no media row exists     → upload, create
 *                                                           a render row,
 *                                                           NULL it.
 *     c. thumbnail is an http(s) URL and no media exists  → preserve it
 *                                                           as a render row,
 *                                                           NULL it.
 *     d. anything else                                    → NULL it.
 *
 *   `venue_design_media.url` where url LIKE 'data:%':
 *     a. type=render → upload to Cloudinary, replace the url in place.
 *     b. type=video  → flag and skip (videos are big; rotating them needs
 *                      an explicit decision). The video generator already
 *                      writes Cloudinary URLs, so there shouldn't be any
 *                      in practice; we surface them in the report instead
 *                      of guessing.
 *
 * Idempotent: re-running after success is a no-op (everything is NULL or
 * a CDN URL).
 *
 * Note the `--overload` flag: without it, dotenvx leaves any pre-existing
 * `DATABASE_URL` in your shell intact (e.g. from a running local Supabase
 * CLI), which points the script at a different DB than the dev server. The
 * `dev` npm script does the same thing.
 *
 * Run (dry-run by default):
 *   npm run db:migrate-images
 *
 * Apply changes:
 *   npm run db:migrate-images -- --apply
 *
 * Or directly:
 *   npx dotenvx run --env-file=.env.local --overload -- \
 *     npx tsx scripts/migrate-design-images.ts [--apply]
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { cloudinary } from "../src/lib/cloudinary";
import { PrismaClient } from "../src/generated/prisma/client";

const APPLY = process.argv.includes("--apply");

// Admin/one-shot scripts deliberately bypass the shared `src/lib/prisma.ts`
// client because:
//   - we want the direct Postgres URL (port 5432) over the pgbouncer pooler
//     (port 6543); the pooler's TLS chain trips up newer pg adapters and
//     transaction-mode pooling breaks long-running scripts anyway, and
//   - we don't need (or want) the singleton/HMR caching the dev server
//     relies on. A fresh client + clean disconnect is the right shape for
//     a CLI tool.
function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var "${name}"`);
  return v;
}

// Supabase serves Postgres behind a self-signed intermediate. Newer
// versions of `pg` (and therefore `@prisma/adapter-pg`) silently upgrade
// `sslmode=require` in the URL to full chain verification, which then
// fails on the Supabase cert. The pg-recommended fix is to drop the
// `sslmode` query param and pass `ssl: { rejectUnauthorized: false }` on
// the pool config, that keeps the connection encrypted but skips chain
// verification. Admin scripts run from a trusted operator machine and
// the pool is short-lived, so this is an acceptable trade-off here (and
// the same one every other Supabase admin tool makes). Don't do this in
// app code.
function stripSslMode(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.delete("sslmode");
    return u.toString();
  } catch {
    return url;
  }
}

const rawConnectionString =
  process.env.DIRECT_DATABASE_URL ?? requireEnv("DATABASE_URL");
const adapter = new PrismaPg({
  connectionString: stripSslMode(rawConnectionString),
  ssl: { rejectUnauthorized: false },
});
const prisma = new PrismaClient({ adapter });

type ThumbnailKind = "data-uri" | "url" | "empty" | "unknown";

interface ThumbnailPlan {
  designId: string;
  hasRenderMedia: boolean;
  kind: ThumbnailKind;
  bytes: number;
  uploadedUrl?: string;
}

interface MediaPlan {
  mediaId: string;
  designId: string;
  type: string;
  bytes: number;
  uploadedUrl?: string;
}

function classifyThumbnail(value: string | null): {
  kind: ThumbnailKind;
  bytes: number;
} {
  if (value == null) return { kind: "empty", bytes: 0 };
  const trimmed = value.trim();
  if (trimmed.length === 0) return { kind: "empty", bytes: 0 };
  if (trimmed.startsWith("data:")) return { kind: "data-uri", bytes: value.length };
  if (/^https?:\/\//.test(trimmed)) return { kind: "url", bytes: value.length };
  return { kind: "unknown", bytes: value.length };
}

async function planThumbnails(): Promise<ThumbnailPlan[]> {
  const rows = await prisma.venueDesign.findMany({
    where: { thumbnail: { not: null } },
    orderBy: { approved_at: "desc" },
    select: {
      id: true,
      thumbnail: true,
      _count: { select: { media: { where: { type: "render" } } } },
    },
  });
  return rows.map((r) => {
    const c = classifyThumbnail(r.thumbnail);
    return {
      designId: r.id,
      hasRenderMedia: r._count.media > 0,
      kind: c.kind,
      bytes: c.bytes,
    };
  });
}

async function planMedia(): Promise<MediaPlan[]> {
  // We can't `LIKE 'data:%'` cheaply in a Prisma `where`, but we can pull
  // every media row and filter in code, the table is small (one row per
  // render, hundreds of rows at most). If this ever grows, switch to a raw
  // query with a `url LIKE 'data:%'` predicate.
  const rows = await prisma.venueDesignMedia.findMany({
    select: { id: true, design_id: true, type: true, url: true },
  });
  return rows
    .filter((r) => r.url.startsWith("data:"))
    .map((r) => ({
      mediaId: r.id,
      designId: r.design_id,
      type: r.type,
      bytes: r.url.length,
    }));
}

async function uploadDataUri(dataUri: string): Promise<string> {
  const result = await cloudinary.uploader.upload(dataUri, {
    folder: "zaffa-renders",
    resource_type: "image",
    type: "upload",
  });
  return result.secure_url;
}

function fmtKib(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

async function main() {
  console.log(
    `[migrate-design-images] running in ${APPLY ? "APPLY" : "DRY-RUN"} mode\n`,
  );

  const [thumbPlan, mediaPlan] = await Promise.all([
    planThumbnails(),
    planMedia(),
  ]);

  console.log("thumbnails (venue_designs.thumbnail):");
  console.log(`  total non-null:       ${thumbPlan.length}`);
  console.log(
    `    null-out only:      ${thumbPlan.filter((p) => p.hasRenderMedia || p.kind === "empty" || p.kind === "unknown").length}`,
  );
  console.log(
    `    upload data: URI:   ${thumbPlan.filter((p) => !p.hasRenderMedia && p.kind === "data-uri").length}`,
  );
  console.log(
    `    preserve plain URL: ${thumbPlan.filter((p) => !p.hasRenderMedia && p.kind === "url").length}`,
  );

  const mediaRenders = mediaPlan.filter((m) => m.type === "render");
  const mediaVideos = mediaPlan.filter((m) => m.type === "video");
  const mediaOther = mediaPlan.filter(
    (m) => m.type !== "render" && m.type !== "video",
  );
  console.log("\nmedia (venue_design_media.url with data:):");
  console.log(`  total:                ${mediaPlan.length}`);
  console.log(`    type=render upload: ${mediaRenders.length}`);
  console.log(`    type=video skip:    ${mediaVideos.length}`);
  console.log(`    type=other skip:    ${mediaOther.length}`);

  if (!APPLY) {
    if (thumbPlan.length > 0) {
      console.log("\nthumbnail rows:");
      thumbPlan.forEach((p, i) => {
        const action = p.hasRenderMedia
          ? "null-out"
          : p.kind === "data-uri"
            ? "upload"
            : p.kind === "url"
              ? "preserve-url"
              : "null-out";
        console.log(
          `  ${String(i + 1).padStart(3)}. ${p.designId}  ${p.kind.padEnd(8)} ${fmtKib(p.bytes).padStart(10)}  → ${action}`,
        );
      });
    }
    if (mediaPlan.length > 0) {
      console.log("\nmedia rows with data: URLs:");
      mediaPlan.forEach((m, i) => {
        const action =
          m.type === "render" ? "upload+rewrite" : "skip (manual review)";
        console.log(
          `  ${String(i + 1).padStart(3)}. ${m.mediaId}  type=${m.type.padEnd(6)} ${fmtKib(m.bytes).padStart(10)}  → ${action}`,
        );
      });
    }
    console.log("\nRe-run with --apply to commit.");
    return;
  }

  // ---- Apply phase ----

  let processed = 0;
  let failed = 0;

  // Process media first so that, by the time we look at thumbnails, the
  // `hasRenderMedia` decision is accurate (we may have just created some).
  for (const m of mediaPlan) {
    if (m.type !== "render") {
      console.log(`↷ ${m.mediaId} (type=${m.type})  skipped`);
      continue;
    }
    try {
      const fresh = await prisma.venueDesignMedia.findUnique({
        where: { id: m.mediaId },
        select: { url: true },
      });
      if (!fresh || !fresh.url.startsWith("data:")) {
        // Already rotated by a concurrent run, nothing to do.
        continue;
      }
      const cdnUrl = await uploadDataUri(fresh.url);
      await prisma.venueDesignMedia.update({
        where: { id: m.mediaId },
        data: { url: cdnUrl },
      });
      m.uploadedUrl = cdnUrl;
      processed += 1;
      console.log(`✓ media ${m.mediaId}  uploaded → ${cdnUrl}`);
    } catch (err) {
      failed += 1;
      console.error(`✗ media ${m.mediaId}  failed:`, err);
    }
  }

  for (const p of thumbPlan) {
    try {
      const fresh = await prisma.venueDesign.findUnique({
        where: { id: p.designId },
        select: {
          thumbnail: true,
          _count: { select: { media: { where: { type: "render" } } } },
        },
      });
      if (!fresh?.thumbnail) continue; // raced

      const hasRenderMedia = fresh._count.media > 0;

      if (hasRenderMedia) {
        await prisma.venueDesign.update({
          where: { id: p.designId },
          data: { thumbnail: null },
        });
        console.log(`✓ thumb ${p.designId}  null-out (already has media)`);
      } else if (fresh.thumbnail.startsWith("data:")) {
        const cdnUrl = await uploadDataUri(fresh.thumbnail);
        await prisma.$transaction([
          prisma.venueDesignMedia.create({
            data: { design_id: p.designId, type: "render", url: cdnUrl },
          }),
          prisma.venueDesign.update({
            where: { id: p.designId },
            data: { thumbnail: null },
          }),
        ]);
        p.uploadedUrl = cdnUrl;
        console.log(`✓ thumb ${p.designId}  uploaded → ${cdnUrl}`);
      } else if (/^https?:\/\//.test(fresh.thumbnail.trim())) {
        await prisma.$transaction([
          prisma.venueDesignMedia.create({
            data: {
              design_id: p.designId,
              type: "render",
              url: fresh.thumbnail,
            },
          }),
          prisma.venueDesign.update({
            where: { id: p.designId },
            data: { thumbnail: null },
          }),
        ]);
        console.log(`✓ thumb ${p.designId}  preserved-url`);
      } else {
        await prisma.venueDesign.update({
          where: { id: p.designId },
          data: { thumbnail: null },
        });
        console.log(`✓ thumb ${p.designId}  null-out (unknown content)`);
      }
      processed += 1;
    } catch (err) {
      failed += 1;
      console.error(`✗ thumb ${p.designId}  failed:`, err);
    }
  }

  console.log(`\nDone. processed=${processed}  failed=${failed}`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
