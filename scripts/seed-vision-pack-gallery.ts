/**
 * Seeds the public Vision Pack gallery with the hand-curated examples
 * defined in `src/server/seed-data/vision-packs.ts`. Idempotent, re-runs
 * upsert by `microsite_slug`, so a dev can iterate on the seed file and
 * re-run without ending up with duplicates.
 *
 * Each entry creates:
 *   - a Profile (couple), with a deterministic UUID derived from the seed key
 *   - a VenueDesign for that profile, including media rows
 *   - a VisionPack with status=fulfilled, microsite_public=true,
 *     microsite_published_at=now
 *
 * Auth.users rows are NOT created (these are display-only profiles, the
 * couples never sign in). FK constraints are satisfied by the public
 * Profile row alone.
 *
 * Usage:
 *   npm run dev:seed-vision-packs
 */

import { createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import {
  SEED_VISION_PACKS,
  buildReferencesJson,
} from "../src/server/seed-data/vision-packs";
import {
  PACK_SKUS,
  VISION_PACK_SKU_ID,
  VISION_PACK_WINDOW_DAYS,
} from "../src/lib/vision-pack";
import { seedPricingFor } from "../src/lib/vision-pack-pricing";

// Deterministic UUID v5-style derivation from a stable string. Avoids
// migrations needing a fresh seed run; re-running keeps the same id.
function uuidFromKey(key: string): string {
  const hash = createHash("sha1").update(`zaffa:vision-pack:${key}`).digest();
  // Lay out 128 bits in 8-4-4-4-12 form. Force version=5 + variant bits
  // so the result is a well-formed UUIDv5.
  const bytes = Array.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * These packs are fictional couples illustrated with stock photography, and
 * the seeder marks them `microsite_public = true`, which puts them straight
 * into /gallery and into the homepage's proof strip. That is precisely the
 * fabricated social proof ZAF-45 removed, so it must not be one stray command
 * away from coming back.
 *
 * There is no local database in this project: `.env.local` points at the
 * production Supabase instance, so "don't run it against prod" cannot be
 * enforced by inspecting the connection string. An explicit opt-in is the
 * honest guard - a developer who wants demo content still gets it, but only
 * by saying so out loud.
 */
function assertSeedingAllowed(): void {
  if (process.env.ALLOW_FICTIONAL_SEED === "1") return;
  console.error(
    [
      "Refusing to seed: these are fictional couples with stock photography,",
      "and this seeder publishes them to the public gallery.",
      "",
      "There is no separate local database here - .env.local points at the",
      "live project, so seeding writes fake couples to the real gallery.",
      "",
      "If you genuinely want them, re-run with ALLOW_FICTIONAL_SEED=1.",
    ].join("\n"),
  );
  process.exit(1);
}

async function main() {
  assertSeedingAllowed();

  // Avoid touching auth.users, these gallery rows are display-only.
  // We need the public.profiles FK to be satisfied; the easiest path is
  // to create a matching auth.users row first via raw SQL with the same
  // id, then the public.profiles row inserts cleanly. The trigger that
  // auto-creates profile rows from auth.users is a no-op when the row
  // already exists with the same id.

  for (const seed of SEED_VISION_PACKS) {
    const userId = uuidFromKey(seed.key);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + VISION_PACK_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    // 1) Insert a stub auth.users row so the FK on public.profiles holds.
    //    Conflict-on-id keeps re-runs idempotent. We only set the minimum
    //    columns required by the trigger. The email is fictional and the
    //    password hash is a no-op string, these rows can never sign in
    //    because the auth path is never invoked for them.
    await prisma.$executeRawUnsafe(
      `insert into auth.users (id, instance_id, email, encrypted_password, raw_user_meta_data, raw_app_meta_data, aud, role, created_at, updated_at, email_confirmed_at)
       values ($1, '00000000-0000-0000-0000-000000000000', $2, '$argon2id$v=19$m=65536,t=3,p=4$dummyhashfordisplayonlyuser', '{"display_only":true,"full_name":"' || $3 || '"}'::jsonb, '{"provider":"seed","providers":["seed"]}'::jsonb, 'authenticated', 'authenticated', $4, $4, $4)
       on conflict (id) do nothing`,
      userId,
      `gallery+${seed.key}@zaffa.local`,
      seed.recipient.fullName.replace(/'/g, "''"),
      now,
    );

    // 2) Profile row. The trigger usually creates this from the auth.users
    //    insert above, but just in case, upsert here too.
    await prisma.profile.upsert({
      where: { id: userId },
      create: {
        id: userId,
        full_name: seed.recipient.fullName,
        avatar_url: seed.recipient.avatarUrl,
        role: "client",
        locale: seed.recipient.locale,
      },
      update: {
        full_name: seed.recipient.fullName,
        avatar_url: seed.recipient.avatarUrl,
      },
    });

    // 3) Venue design (with references + media). Idempotent on (user_id,
    //    name), for v1 we let multiple runs write the same design name
    //    by deleting + recreating.
    await prisma.venueDesign.deleteMany({
      where: { user_id: userId, name: seed.design.name },
    });
    const design = await prisma.venueDesign.create({
      data: {
        user_id: userId,
        name: seed.design.name,
        event_type: seed.design.eventType,
        setting: seed.design.setting,
        size: seed.design.size,
        guest_count: seed.design.guestCount,
        palette: seed.design.palette,
        references: buildReferencesJson(seed.design.references),
        style_notes: seed.design.styleNotes,
        thumbnail: seed.design.renders[0] ?? null,
        media: {
          createMany: {
            data: [
              ...seed.design.renders.map((url) => ({
                type: "render" as const,
                url,
              })),
              ...(seed.design.video
                ? [{ type: "video" as const, url: seed.design.video }]
                : []),
            ],
          },
        },
      },
    });

    // 4) VisionPack, fulfilled status with the curated slug. Public so
    //    it shows up in /gallery.
    const existing = await prisma.visionPack.findUnique({
      where: { microsite_slug: seed.micrositeSlug },
    });
    if (existing) {
      await prisma.visionPack.update({
        where: { id: existing.id },
        data: {
          recipient_user_id: userId,
          status: "fulfilled",
          paid_at: now,
          redeemed_at: now,
          expires_at: expiresAt,
          microsite_public: true,
          microsite_published_at: now,
          renders_used: seed.design.renders.length,
          videos_used: seed.design.video ? 1 : 0,
        },
      });
    } else {
      // Gallery seed always lands the higher-tier Vision Pack so the
      // featured stories show the full feature surface (planner match
      // + venue recs unlocked downstream). Pricing pulled from the EG
      // seed in minor units so the row matches what real EG buyers see.
      const sku = PACK_SKUS[VISION_PACK_SKU_ID];
      const egPricing = seedPricingFor("EG", VISION_PACK_SKU_ID);
      await prisma.visionPack.create({
        data: {
          sku: sku.id,
          buyer_user_id: userId,
          recipient_user_id: userId,
          status: "fulfilled",
          paid_at: now,
          redeemed_at: now,
          expires_at: expiresAt,
          amount: egPricing.amount,
          currency: egPricing.currency,
          renders_quota: sku.quotas.renders,
          videos_quota: sku.quotas.videos,
          edits_quota: sku.quotas.edits,
          renders_used: seed.design.renders.length,
          videos_used: seed.design.video ? 1 : 0,
          microsite_slug: seed.micrositeSlug,
          microsite_public: true,
          microsite_published_at: now,
        },
      });
    }

    console.log(`  ✓ ${seed.recipient.fullName} (/v/${seed.micrositeSlug})  · ${design.name}`);
  }
  console.log(
    `\nSeeded ${SEED_VISION_PACKS.length} gallery packs. Visit /gallery to confirm.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
