const UNSPLASH_ACCESS_KEY = process.env.UNSPLASH_ACCESS_KEY;
const BASE_URL = "https://api.unsplash.com";

interface UnsplashPhoto {
  id: string;
  urls: { raw: string; full: string; regular: string; small: string; thumb: string };
  alt_description: string | null;
  user: { name: string };
}

export async function searchPhotos(
  query: string,
  perPage = 20
): Promise<
  {
    id: string;
    imageUrl: string;
    thumbnailUrl: string;
    altText: string;
    photographer: string;
  }[]
> {
  if (!UNSPLASH_ACCESS_KEY) {
    throw new Error("UNSPLASH_ACCESS_KEY is not set");
  }

  const url = new URL(`${BASE_URL}/search/photos`);
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("orientation", "landscape");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Client-ID ${UNSPLASH_ACCESS_KEY}` },
  });

  if (!res.ok) {
    throw new Error(`Unsplash API error: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { results: UnsplashPhoto[] };

  return data.results.map((photo) => ({
    id: photo.id,
    imageUrl: photo.urls.regular,
    thumbnailUrl: photo.urls.small,
    altText: photo.alt_description ?? query,
    photographer: photo.user.name,
  }));
}
