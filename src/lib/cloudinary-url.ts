// Reading our own Cloudinary delivery URLs back into public ids.
//
// Pure string work, importable from client and server. The server uses it
// to tell whether a URL a client sent is one of our own assets, and which
// one, so it can build its own URL from the public id instead of fetching
// whatever the client wrote.

const EXTENSION = /\.[a-z0-9]{2,5}$/i;

/**
 * The public id behind a plain delivery URL of `cloudName`'s account, the
 * exact shape an upload's `secure_url` has:
 * `https://res.cloudinary.com/<cloud>/image/upload/v<version>/<public id>.<ext>`.
 *
 * Null for anything else: another host or account, a query string, a URL
 * carrying transformations or a signature (those sit before the version),
 * a fetch or authenticated asset, a path with empty or dot segments. Strict
 * on purpose: references are stored as their upload's `secure_url`, so a
 * looser URL is one we did not hand out.
 */
export function publicIdFromDeliveryUrl(
  url: string,
  cloudName: string | undefined,
): string | null {
  if (!cloudName) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "res.cloudinary.com") {
    return null;
  }
  if (parsed.search || parsed.hash || parsed.username || parsed.port) return null;
  const prefix = `/${cloudName}/image/upload/`;
  if (!parsed.pathname.startsWith(prefix)) return null;
  let rest: string;
  try {
    rest = decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    return null;
  }
  const versioned = /^v\d+\/(.+)$/.exec(rest);
  if (!versioned || !EXTENSION.test(versioned[1])) return null;
  const publicId = versioned[1].replace(EXTENSION, "");
  const segments = publicId.split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) return null;
  return publicId;
}
