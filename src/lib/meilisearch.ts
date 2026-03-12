import { MeiliSearch } from "meilisearch";

export const meilisearch = new MeiliSearch({
  host: process.env.MEILISEARCH_HOST!,
  apiKey: process.env.MEILISEARCH_API_KEY,
});

export const INDEXES = {
  PLANNERS: "planners",
  VENDORS: "vendors",
} as const;
