// Helpers for showing a meaningful "name" for a prospect in admin UIs.
//
// Some sources (notably Tavily web results pointing at Instagram / TikTok
// profiles) give us a useless title like "Instagram", "Login • Instagram",
// "TikTok - Make Your Day", or "Facebook" because the platforms strip the
// real title from the page metadata. We persist the raw title in
// `display_name` for traceability, but for display we fall back to a more
// useful identifier in this order:
//
//   handle → username from source_url → email → "Untitled prospect"

const GENERIC_TITLES = new Set([
  "instagram",
  "tiktok",
  "facebook",
  "login • instagram",
  "log in • instagram",
  "log in to instagram",
  "instagram login",
  "tiktok - make your day",
  "facebook - log in or sign up",
  "facebook log in",
  "twitter",
  "x",
  "youtube",
  "linkedin",
  "untitled",
  "",
]);

function isGenericTitle(name: string | null | undefined): boolean {
  if (!name) return true;
  return GENERIC_TITLES.has(name.trim().toLowerCase());
}

function handleFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!path) return null;
    // /explore/tags/<tag>/ → "#tag"
    const tagMatch = path.match(/^explore\/tags\/([^/]+)/i);
    if (tagMatch) return `#${tagMatch[1]}`;
    // tiktok @username
    const ttMatch = path.match(/^@([^/]+)/);
    if (ttMatch) return `@${ttMatch[1]}`;
    // ig/fb plain /username path (single segment)
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 1) return `@${segments[0]}`;
    return null;
  } catch {
    return null;
  }
}

export interface ProspectNameInput {
  display_name: string | null | undefined;
  handle?: string | null;
  source_url?: string | null;
  email?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  facebook?: string | null;
}

export function prospectDisplayName(p: ProspectNameInput): string {
  const raw = p.display_name?.trim() ?? "";
  if (raw && !isGenericTitle(raw)) return raw;

  if (p.handle) return `@${p.handle.replace(/^@/, "")}`;
  if (p.instagram) return `@${p.instagram.replace(/^@/, "")}`;
  if (p.tiktok) return `@${p.tiktok.replace(/^@/, "")}`;
  if (p.facebook) return p.facebook.replace(/^@/, "");

  const fromUrl = handleFromUrl(p.source_url);
  if (fromUrl) return fromUrl;

  if (p.email) return p.email;

  // Last resort, keep the raw value (even if generic) so the row isn't
  // blank, otherwise a generic placeholder.
  return raw || "Untitled prospect";
}

// Single-character avatar initial, uses the resolved display name so the
// fallback letter matches the visible name, not the generic title.
export function prospectInitial(p: ProspectNameInput): string {
  const name = prospectDisplayName(p);
  // Strip leading "@" / "#" so we don't all show up as "@" or "#".
  const stripped = name.replace(/^[@#]+/, "");
  return (stripped[0] ?? "?").toUpperCase();
}
