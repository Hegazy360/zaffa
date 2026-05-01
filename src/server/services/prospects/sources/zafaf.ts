// zafaf.net — the largest Arabic wedding directory in the region. Each
// country lives on its own subdomain (egypt.zafaf.net, saudi-arabia.zafaf.net,
// …). We default to Egypt; admins can override the country with `country:`
// prefix in the query (e.g. "country:saudi-arabia photographers").
//
// Listing pages render server-side with vendor anchors of the form:
//   https://<country>.zafaf.net/<category>/<city>/<slug>-<id>
// Vendor detail pages expose the business name (h1), contact-person,
// address, and a long Arabic services blurb in the static HTML. Direct
// phones / emails / socials are gated behind a JS reveal, so we lean on
// the LLM extractor to pull whatever it can from the visible text.

import { fetchHtml, load, regexExtract, politeWait } from "./scrape-runner";
import type { RawRow } from "./types";

// Map a few intuitive English keywords to real zafaf category slugs (see
// https://egypt.zafaf.net/ for the full list). We accept an exact slug too,
// so admins can paste any URL segment they like.
const CATEGORY_SLUGS: Record<string, string> = {
  planner: "wedding-planners",
  organizer: "wedding-organizers",
  photographer: "photographers-and-videographers",
  videographer: "photographers-and-videographers",
  florist: "flower-shops",
  flower: "flower-shops",
  caterer: "catering",
  catering: "catering",
  music: "band-dj-and-entertainment",
  dj: "band-dj-and-entertainment",
  band: "band-dj-and-entertainment",
  entertainment: "band-dj-and-entertainment",
  decoration: "wedding-organizers",
  venue: "private-wedding-venues",
  hotel: "hotels",
  garden: "gardens-parks-clubs",
  makeup: "hair-make-up",
  hair: "hair-make-up",
  spa: "bodycare-spa",
  bodycare: "bodycare-spa",
  car: "bridal-car",
  bridal: "bridal-car",
  invitation: "printing-cards-invitations",
  dress: "dresses-and-suits-shops",
  jewelry: "jewelry",
};

// Subdomains zafaf operates. Admins can pick another country with
// `country:saudi-arabia photographers`.
const KNOWN_COUNTRIES = new Set([
  "egypt",
  "saudi-arabia",
  "emirates",
  "kuwait",
  "bahrain",
  "qatar",
  "oman",
  "lebanon",
  "tunisia",
  "morocco",
]);

interface Resolved {
  country: string;
  slugs: string[]; // category slug(s) to crawl
  raw: string;
}

function resolve(query: string): Resolved {
  const q = query.trim().toLowerCase();
  let country = "egypt";
  let rest = q;
  const m = q.match(/^country:([a-z-]+)\s+(.+)$/);
  if (m && KNOWN_COUNTRIES.has(m[1])) {
    country = m[1];
    rest = m[2];
  }

  // Exact category slug pass-through (e.g. "photographers-and-videographers").
  const slugFromExact = rest.replace(/\s+/g, "-");
  const slugs: string[] = [];
  if (CATEGORY_SLUGS[rest]) {
    slugs.push(CATEGORY_SLUGS[rest]);
  } else if (Object.values(CATEGORY_SLUGS).includes(slugFromExact)) {
    slugs.push(slugFromExact);
  } else {
    // Match any keyword that appears in the query.
    for (const [k, slug] of Object.entries(CATEGORY_SLUGS)) {
      if (rest.includes(k) && !slugs.includes(slug)) slugs.push(slug);
    }
  }
  if (slugs.length === 0) {
    // Fall back to a sweep of the highest-signal categories.
    slugs.push(
      "wedding-planners",
      "wedding-organizers",
      "photographers-and-videographers",
    );
  }
  return { country, slugs, raw: rest };
}

export interface ZafafDiscoverInput {
  // Either a category keyword ("photographer"), an exact slug
  // ("photographers-and-videographers"), or a `country:<x> <keyword>`
  // override. Examples:
  //   "wedding planner"
  //   "photographer"
  //   "country:saudi-arabia hair-make-up"
  query: string;
  maxItems?: number;
  // How many pagination pages to walk per category (1 = first page only).
  // We stop early as soon as a page yields zero new vendor links.
  maxPages?: number;
}

// Vendor detail pages live at .../slug-<numericId>. We use that suffix to
// distinguish them from category pagination links.
const VENDOR_LINK = /\/[^/]+-\d+$/;

export async function zafafDiscover(
  input: ZafafDiscoverInput,
): Promise<RawRow[]> {
  const { country, slugs } = resolve(input.query);
  const cap = input.maxItems ?? 30;
  const maxPages = Math.max(1, Math.min(20, input.maxPages ?? 1));

  // 1. Pull vendor links from each category, walking pagination up to
  //    `maxPages`. zafaf's pagination is `?page=N` on the category URL.
  //    We bail early on a page that produces zero new vendor links so we
  //    don't waste calls on empty tail pages.
  const vendorLinks: string[] = [];
  let last = 0;
  outer: for (const slug of slugs) {
    for (let p = 1; p <= maxPages; p++) {
      const listUrl =
        p === 1
          ? `https://${country}.zafaf.net/${slug}`
          : `https://${country}.zafaf.net/${slug}?page=${p}`;
      last = await politeWait(last);
      let pageNew = 0;
      try {
        const html = await fetchHtml(listUrl);
        const $ = load(html);
        $(`a[href*="${country}.zafaf.net/${slug}/"]`).each((_, a) => {
          const href = $(a).attr("href");
          if (!href) return;
          const cleaned = href.split("?")[0].split("#")[0];
          if (!VENDOR_LINK.test(cleaned)) return;
          if (vendorLinks.includes(cleaned)) return;
          vendorLinks.push(cleaned);
          pageNew += 1;
        });
      } catch (err) {
        console.error(`[zafaf] list ${listUrl} failed:`, err);
      }
      // Stop walking this category if the page produced nothing new.
      if (pageNew === 0) break;
      // Stop the whole sweep if we've hit the cap.
      if (vendorLinks.length >= cap) break outer;
    }
  }

  const unique = Array.from(new Set(vendorLinks)).slice(0, cap);
  if (unique.length === 0) {
    // Empty is a valid result, not a failure — let the run complete with 0
    // prospects. The admin can see the source URL on the run row and try a
    // different category if they want.
    return [];
  }

  // 2. Visit each vendor page to extract the visible profile fields.
  const out: RawRow[] = [];
  for (const url of unique) {
    last = await politeWait(last);
    try {
      const html = await fetchHtml(url);
      const c = load(html);
      // h1 is reliably the business name.
      const name =
        c("h1").first().text().trim() ||
        c("title").text().split("|")[0]?.trim() ||
        url;
      // The profile-contact-info ul holds contact-person + address.
      const contactInfo = c(".profile-contact-info").text().replace(/\s+/g, " ").trim();
      // profile-detail-list blocks hold services + about + payment + working hours.
      const profileDetails = c(".profile-detail-list")
        .map((_, el) => c(el).text().replace(/\s+/g, " ").trim())
        .get()
        .join("\n\n");
      // Pull socials from anchor hrefs (they're plain in the static HTML).
      const socials: Record<string, string> = {};
      c('a[href*="instagram.com/"], a[href*="facebook.com/"], a[href*="tiktok.com/"], a[href*="wa.me/"], a[href^="mailto:"], a[href^="tel:"]').each((_, a) => {
        const href = c(a).attr("href") ?? "";
        // Skip zafaf's own social handles, which appear in the footer.
        if (href.includes("zafaf")) return;
        if (href.startsWith("mailto:") && !socials.email) socials.email = href.replace("mailto:", "");
        else if (href.startsWith("tel:") && !socials.phone) socials.phone = href.replace("tel:", "");
        else if (href.includes("instagram.com/") && !socials.instagram) socials.instagram = href;
        else if (href.includes("facebook.com/") && !socials.facebook) socials.facebook = href;
        else if (href.includes("tiktok.com/") && !socials.tiktok) socials.tiktok = href;
        else if (href.includes("wa.me/") && !socials.whatsapp) socials.whatsapp = href;
      });
      const blob = `${name}\n\n${contactInfo}\n\n${profileDetails}`;
      const { emails, phones } = regexExtract(blob);
      const text = [
        `Source: zafaf (${url})`,
        `Business: ${name}`,
        contactInfo,
        Object.entries(socials)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\n"),
        emails.length ? `emails: ${emails.join(", ")}` : "",
        phones.length ? `phones: ${phones.join(", ")}` : "",
        profileDetails,
      ]
        .filter(Boolean)
        .join("\n\n");

      out.push({
        source_id: url,
        source_url: url,
        display_name: name,
        bio: contactInfo || profileDetails.slice(0, 300),
        text,
        raw: { url, name, contactInfo, socials, emails, phones } as unknown,
      });
    } catch (err) {
      console.error(`[zafaf] vendor ${url} failed:`, err);
    }
  }
  return out;
}
