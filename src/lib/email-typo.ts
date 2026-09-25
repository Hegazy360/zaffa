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
 * Real providers' domains that sit a slip away from a popular one. Each is
 * somebody's actual address, so it is never "corrected": `ymail.com` is
 * Yahoo, not a typo of gmail.com, and `hotmail.de` is Hotmail in Germany,
 * not a typo of hotmail.fr. Following such a hint would make a reachable
 * lead unreachable, the opposite of what it is for.
 */
const REGIONAL_TLDS = [
  "de", "it", "es", "be", "nl", "ca", "ch", "at", "gr", "fi", "se", "dk", "no",
  "ie", "pt", "pl", "cz", "hu", "ro", "sa", "ae", "eg", "ma", "jp", "in", "cl",
  "com.au", "com.br", "com.tr", "com.ar", "com.mx", "com.eg", "com.sa",
  "co.jp", "co.in", "co.id", "co.za", "co.nz", "co.il", "co.th",
];
const KNOWN_REAL_DOMAINS: ReadonlySet<string> = new Set([
  ...["hotmail", "yahoo", "outlook", "live", "msn"].flatMap((name) =>
    REGIONAL_TLDS.map((tld) => `${name}.${tld}`),
  ),
  "live.fr",
  "live.co.uk",
  "outlook.co.uk",
  "ymail.com",
  "rocketmail.com",
  "mail.com",
  "email.com",
  "googlemail.com",
  "gmx.com",
  "gmx.net",
  "gmx.at",
  "gmx.ch",
  "gmx.fr",
  "mac.com",
  "aim.com",
  "pm.me",
  "protonmail.ch",
  "yandex.com",
  "mail.ru",
  "zoho.com",
]);

/**
 * How far a typed name part may be from a known one and still be a typo.
 * Short names get one edit only: `abc.com` is two edits from `aol.com` and
 * is somebody's real company, not a slip.
 */
function maxNameDistance(name: string): number {
  return name.length <= 4 ? 1 : 2;
}

/** `gmail.com` as `{ name: "gmail", tld: "com" }`; the ending is everything after the first dot. */
function splitDomain(domain: string): { name: string; tld: string } {
  const dot = domain.indexOf(".");
  return dot === -1
    ? { name: domain, tld: "" }
    : { name: domain.slice(0, dot), tld: domain.slice(dot + 1) };
}

/**
 * How many edits turn the typed domain into `known`, counting only the slips
 * that happen: the name misspelled under the right ending (`gmial.com`, or
 * `hotmal.con` with a `.com` typo too), the right name under an ending one
 * key off (`gmail.cim`, `hotmail.fe`), or the dot lost (`gmailcom`,
 * `gmail,com`). A different real ending is not a slip: `hotmail.de` is never
 * compared letter by letter with `hotmail.fr`. Infinity when none applies.
 */
function slipDistance(domain: string, known: string): number {
  const typed = splitDomain(domain);
  const target = splitDomain(known);
  let best = Infinity;
  const typedTld = typed.tld === "" || COM_TYPOS.has(typed.tld) ? "com" : typed.tld;
  if (typedTld === target.tld) {
    const d = editDistance(typed.name, target.name);
    if (d <= maxNameDistance(target.name)) best = Math.min(best, d);
  }
  if (typed.tld !== "" && typed.name === target.name) {
    const d = editDistance(typed.tld, target.tld);
    if (d <= 1) best = Math.min(best, d);
  }
  if (typed.tld === "") {
    const d = editDistance(domain, target.name + target.tld);
    if (d <= 1) best = Math.min(best, d);
  }
  return best;
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
  if (POPULAR.has(domain) || KNOWN_REAL_DOMAINS.has(domain)) return null;

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
  const { name, tld } = splitDomain(domain);
  if (tld === "" || COM_TYPOS.has(tld)) {
    const dotCom = `${name}.com`;
    if (POPULAR.has(dotCom)) return `${local}@${dotCom}`;
  }

  // Everything else: the nearest known domain a single slip away.
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const known of POPULAR_EMAIL_DOMAINS) {
    const distance = slipDistance(domain, known);
    if (distance < bestDistance) {
      best = known;
      bestDistance = distance;
    }
  }
  return best ? `${local}@${best}` : null;
}
