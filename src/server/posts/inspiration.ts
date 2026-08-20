// Pinterest inspiration fetch + Cloudinary mirror.
//
// The post generator wants 6-8 inspiration thumbnails per post. We use
// the existing `searchPinterest` worker proxy and then mirror the
// chosen URLs through Cloudinary because:
//
//   1. Pinterest CDN URLs rotate / expire, we'd lose the moodboard
//      image after a week or two.
//   2. We render the inspiration grid into a PNG on the client. CORS
//      against Pinterest's CDN intermittently fails; Cloudinary always
//      serves with permissive CORS.

import { cloudinary } from "@/lib/cloudinary";
import { searchPinterest } from "@/server/inspiration/pinterest";

const TARGET_COUNT_MIN = 6;
const TARGET_COUNT_MAX = 8;

async function mirrorOne(url: string): Promise<string> {
  if (!url) return url;
  // Cloudinary's `upload()` accepts remote URLs directly, it fetches
  // and re-stores. We use folder `zaffa-posts` (separate from
  // zaffa-renders) so admin tooling can browse post assets independently.
  const res = await cloudinary.uploader.upload(url, {
    folder: "zaffa-posts/inspiration",
    resource_type: "image",
    type: "upload",
  });
  return res.secure_url;
}

export interface FetchInspirationResult {
  imageUrls: string[];
  query: string;
}

/**
 * Search Pinterest for `vibe` and mirror the top 6-8 results to
 * Cloudinary. Returns the mirrored URLs in the same order Pinterest
 * gave them, we don't try to be clever about ranking; the carousel
 * collage looks good with a varied grab-bag.
 */
export async function fetchInspiration(input: {
  vibe: string;
  count?: number;
}): Promise<FetchInspirationResult> {
  const target = Math.max(
    TARGET_COUNT_MIN,
    Math.min(input.count ?? 8, TARGET_COUNT_MAX),
  );

  const result = await searchPinterest({
    query: `${input.vibe} wedding`,
    pageSize: target * 3, // over-fetch so we can drop unusable urls
  });

  const candidates = result.results
    .map((r) => r.imageUrl)
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .slice(0, target * 2);

  // Mirror in parallel but cap concurrency at 4 so we don't hammer
  // Cloudinary or Pinterest with a burst.
  const mirrored: string[] = [];
  for (let i = 0; i < candidates.length && mirrored.length < target; i += 4) {
    const slice = candidates.slice(i, i + 4);
    const settled = await Promise.allSettled(slice.map(mirrorOne));
    for (const s of settled) {
      if (s.status === "fulfilled" && s.value) mirrored.push(s.value);
      if (mirrored.length >= target) break;
    }
  }

  if (mirrored.length === 0) {
    throw new Error(
      `No inspiration images could be mirrored for vibe "${input.vibe}"`,
    );
  }

  return { imageUrls: mirrored, query: result.query };
}
