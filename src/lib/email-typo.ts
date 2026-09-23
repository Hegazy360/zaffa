// "Did you mean …@gmail.com?" (F5, "Leads that never rot").
//
// Couple B from the first real cohort left `…@2008gmail.com`: a birth year
// glued onto the domain instead of the name. The lead was unreachable the
// moment the form accepted it. This suggests the address the person most
// likely meant; it never corrects anything on its own, the person taps to
// accept or keeps typing.
//
// Pure and dependency free so it runs in every form, client side.

/**
 * The providers our couples actually use, most common first (ties in the
 * distance search go to the earlier, more likely, domain).
 */
export const POPULAR_EMAIL_DOMAINS = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "live.com",
  "msn.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "hotmail.fr",
  "yahoo.fr",
  "outlook.fr",
  "gmx.de",
  "web.de",
  "yahoo.co.uk",
  "hotmail.co.uk",
] as const;

const POPULAR: ReadonlySet<string> = new Set(POPULAR_EMAIL_DOMAINS);

/** Mistyped `.com` endings, for domains whose name part is spelled right. */
const COM_TYPOS: ReadonlySet<string> = new Set([
  "con",
  "cmo",
  "comm",
  "cm",
  "om",
  "co",
  "vom",
  "xom",
  "cpm",
  "ocm",
]);

/**
 * Optimal string alignment distance (Damerau-Levenshtein where a swapped
 * pair counts once and no substring is edited twice). Swaps are the most
 * common typo on a phone keyboard (`gmial`), so they cost 1, not 2.
 */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, (_, i) =>
    Array.from({ length: cols }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * How far a typed domain may be from a known one and still be a typo.
 * Short domains get one edit only: `abc.com` is two edits from `aol.com`
 * and is somebody's real company, not a slip.
 */
function maxDistanceFor(domain: string): number {
  return domain.length <= 7 ? 1 : 2;
}

/**
 * The address the person most likely meant, or null when the address looks
 * fine (or is too unlike anything we know to guess). The local part is kept
 * exactly as typed; only the domain is corrected, in lower case.
 */
export function suggestEmail(email: string): string | null {
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (POPULAR.has(domain)) return null;

  // Digits glued onto a known domain: `name@2008gmail.com` meant
  // `name2008@gmail.com`. Digits only, because letters glued on are
  // usually a real domain (`acme.com` is not `ac` + `me.com`).
  for (const known of POPULAR_EMAIL_DOMAINS) {
    if (domain.length > known.length && domain.endsWith(known)) {
      const glued = domain.slice(0, -known.length);
      if (/^\d+$/.test(glued)) return `${local}${glued}@${known}`;
    }
  }

  // A known name with a mistyped `.com` (`gmail.con`, `hotmail.cmo`), or
  // with no ending at all (`gmail`).
  const dot = domain.indexOf(".");
  const name = dot === -1 ? domain : domain.slice(0, dot);
  const tld = dot === -1 ? "" : domain.slice(dot + 1);
  if (tld === "" || COM_TYPOS.has(tld)) {
    const dotCom = `${name}.com`;
    if (POPULAR.has(dotCom)) return `${local}@${dotCom}`;
  }

  // Everything else: the nearest known domain within a small edit distance.
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const known of POPULAR_EMAIL_DOMAINS) {
    const distance = editDistance(domain, known);
    if (distance < bestDistance) {
      best = known;
      bestDistance = distance;
    }
  }
  if (best && bestDistance > 0 && bestDistance <= maxDistanceFor(best)) {
    return `${local}@${best}`;
  }
  return null;
}
