// Common shape every source adapter returns. Discovery worker uses this
// uniform interface to fan-out to the LLM extractor and dedup pipeline.

export interface RawRow {
  // Stable cross-run identifier, combined with `source` to uniquely identify
  // this prospect across runs. For URL-based sources we use the URL.
  source_id: string;
  source_url?: string | null;
  display_name: string;
  handle?: string | null;
  bio?: string | null;
  // Big text blob fed to the LLM contact extractor. Should include name,
  // bio, post snippets, and any explicit contact strings the source
  // provided (helps the LLM regex-style extract from messy bios).
  text: string;
  followers?: number | null;
  avatar_url?: string | null;
  // Verbatim source payload, persisted on the Prospect row for debugging.
  raw: unknown;
}
