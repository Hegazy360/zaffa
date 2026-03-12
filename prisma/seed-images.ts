import { PrismaClient, InspirationCategory } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { searchPhotos } from "../src/lib/unsplash";

const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL must be set");
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const CATEGORIES: {
  category: InspirationCategory;
  subcategory: string;
  query: string;
  count: number;
}[] = [
  // Overall vibe — wide shots of real wedding receptions/ceremonies
  { category: "overall_vibe", subcategory: "modern", query: "modern wedding reception venue decor", count: 8 },
  { category: "overall_vibe", subcategory: "classic", query: "classic elegant wedding reception ballroom", count: 8 },
  { category: "overall_vibe", subcategory: "bohemian", query: "boho wedding ceremony outdoor tent", count: 8 },
  { category: "overall_vibe", subcategory: "glamorous", query: "luxury wedding reception gold crystal decor", count: 8 },
  { category: "overall_vibe", subcategory: "minimalist", query: "minimalist wedding reception clean white", count: 8 },
  { category: "overall_vibe", subcategory: "rustic", query: "rustic barn wedding reception decor", count: 8 },
  { category: "overall_vibe", subcategory: "romantic", query: "romantic wedding reception blush pink candles", count: 8 },
  { category: "overall_vibe", subcategory: "art_deco", query: "art deco gatsby wedding reception gold geometric", count: 8 },

  // Flowers — types (bridal bouquet context)
  { category: "flowers", subcategory: "roses", query: "bride holding rose wedding bouquet", count: 8 },
  { category: "flowers", subcategory: "peonies", query: "bride peony wedding bouquet pink", count: 8 },
  { category: "flowers", subcategory: "orchids", query: "bride orchid wedding bouquet white", count: 8 },
  { category: "flowers", subcategory: "wildflowers", query: "bride wildflower wedding bouquet natural", count: 8 },
  { category: "flowers", subcategory: "lilies", query: "bride lily wedding bouquet elegant", count: 8 },
  { category: "flowers", subcategory: "protea", query: "bride protea wedding bouquet modern", count: 8 },

  // Flowers — bouquet shape/style
  { category: "flowers", subcategory: "cascading_bouquet", query: "cascading trailing bridal bouquet wedding", count: 8 },
  { category: "flowers", subcategory: "round_bouquet", query: "round compact bridal bouquet wedding", count: 8 },

  // Flowers — table florals
  { category: "flowers", subcategory: "centerpiece", query: "wedding reception table floral centerpiece", count: 8 },
  { category: "flowers", subcategory: "garland", query: "wedding reception table garland greenery runner", count: 8 },

  // Flowers — ceremony
  { category: "flowers", subcategory: "arch", query: "wedding ceremony floral arch flowers", count: 8 },
  { category: "flowers", subcategory: "aisle_petals", query: "wedding ceremony aisle flower petals decor", count: 8 },
  { category: "flowers", subcategory: "altar_flowers", query: "wedding ceremony altar floral arrangement", count: 8 },

  // Tables — style
  { category: "tables", subcategory: "formal", query: "formal wedding reception dinner table place setting", count: 8 },
  { category: "tables", subcategory: "casual", query: "casual relaxed wedding reception table setting", count: 8 },
  { category: "tables", subcategory: "family_style", query: "long family style wedding reception dinner table", count: 8 },
  { category: "tables", subcategory: "sweetheart", query: "sweetheart table bride groom wedding reception", count: 8 },

  // Tables — centerpieces
  { category: "tables", subcategory: "candelabra", query: "wedding reception candelabra centerpiece candles", count: 8 },
  { category: "tables", subcategory: "floral_low", query: "wedding reception low floral centerpiece", count: 8 },
  { category: "tables", subcategory: "floral_tall", query: "wedding reception tall floral centerpiece", count: 8 },
  { category: "tables", subcategory: "lanterns", query: "wedding reception lantern centerpiece table decor", count: 8 },

  // Lighting — at wedding venues
  { category: "lighting", subcategory: "fairy_lights", query: "wedding reception fairy string lights ceiling", count: 8 },
  { category: "lighting", subcategory: "candles", query: "wedding reception candlelight dinner romantic", count: 8 },
  { category: "lighting", subcategory: "chandeliers", query: "wedding reception crystal chandelier ballroom", count: 8 },
  { category: "lighting", subcategory: "paper_lanterns", query: "wedding reception hanging paper lanterns", count: 8 },
  { category: "lighting", subcategory: "uplighting", query: "wedding reception venue uplighting color", count: 8 },
  { category: "lighting", subcategory: "edison_bulbs", query: "wedding reception edison bulb string lights", count: 8 },
  { category: "lighting", subcategory: "neon_sign", query: "wedding reception neon sign backdrop", count: 8 },

  // Venue decor — backdrops and structural elements at weddings
  { category: "venue_decor", subcategory: "draped_fabric", query: "wedding venue ceiling draping fabric decor", count: 8 },
  { category: "venue_decor", subcategory: "balloon_arch", query: "wedding engagement balloon arch decoration", count: 8 },
  { category: "venue_decor", subcategory: "floral_arch", query: "wedding ceremony flower arch backdrop", count: 8 },
  { category: "venue_decor", subcategory: "greenery_wall", query: "wedding greenery hedge wall backdrop photo", count: 8 },
  { category: "venue_decor", subcategory: "mirror_backdrop", query: "wedding reception mirror seating chart decor", count: 8 },
  { category: "venue_decor", subcategory: "minimal", query: "minimalist wedding venue simple elegant decor", count: 8 },
];

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function seedImages() {
  console.log("Seeding inspiration images from Unsplash...\n");
  console.log("Rate limit: 50 req/hr on free tier. Will wait 75s between requests.\n");

  let totalInserted = 0;
  let skipped = 0;

  for (const entry of CATEGORIES) {
    const existingCount = await prisma.inspirationImage.count({
      where: { category: entry.category, subcategory: entry.subcategory },
    });

    if (existingCount > 0) {
      console.log(`  [skip] ${entry.category}/${entry.subcategory} — already has ${existingCount} images`);
      skipped++;
      continue;
    }

    let retries = 0;
    const MAX_RETRIES = 3;

    while (retries < MAX_RETRIES) {
      try {
        console.log(`Fetching: ${entry.category}/${entry.subcategory} ("${entry.query}")...`);
        const photos = await searchPhotos(entry.query, entry.count);

        const records = photos.map((photo) => ({
          category: entry.category,
          subcategory: entry.subcategory,
          image_url: photo.imageUrl,
          thumbnail_url: photo.thumbnailUrl,
          alt_text: photo.altText,
          tags: [entry.subcategory, entry.category],
          source: "unsplash" as const,
          source_id: photo.id,
          photographer: photo.photographer,
        }));

        await prisma.inspirationImage.createMany({ data: records });
        totalInserted += records.length;
        console.log(`  -> Inserted ${records.length} images`);

        // 75s between requests to stay within 50 req/hr
        console.log("  -> Waiting 75s for rate limit...");
        await sleep(75_000);
        break;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("403") && retries < MAX_RETRIES - 1) {
          retries++;
          const backoff = retries * 120_000;
          console.log(`  -> Rate limited. Retry ${retries}/${MAX_RETRIES} in ${backoff / 1000}s...`);
          await sleep(backoff);
        } else {
          console.error(`  -> Failed for ${entry.category}/${entry.subcategory}: ${msg}`);
          break;
        }
      }
    }
  }

  console.log(`\nDone! Inserted ${totalInserted} images (${skipped} subcategories skipped).`);
}

seedImages()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
