/**
 * JSON-LD, kept deliberately small.
 *
 * Two rules this file exists to enforce:
 *
 *  1. **Only claim what the page shows.** Structured data that describes
 *     something a visitor cannot see is what Google penalises, and it is also
 *     just untrue. Every property below maps to something rendered.
 *  2. **No `Product`/`AggregateRating` anywhere.** We have no ratings — the
 *     invented "4.9" was removed from the UI in ZAF-45 and must not reappear
 *     as markup, where it would be *more* damaging: a rich result showing
 *     stars we made up is a manual action waiting to happen. `Offer` appears
 *     only on `/pricing`, where the exact figures are printed on the page.
 */

const SITE_NAME = "Zaffa";

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.zaffa.ai"
  );
}

/** Stable @id so Organization can be referenced rather than repeated. */
export function organizationId(): string {
  return `${siteUrl()}/#organization`;
}

export function organizationLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": organizationId(),
    name: SITE_NAME,
    url: siteUrl(),
    description,
    // Paris is where the company is, and saying so is part of the pitch —
    // French experience, working wherever the wedding is.
    address: {
      "@type": "PostalAddress",
      addressLocality: "Paris",
      addressCountry: "FR",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      // The one channel we actually answer on.
      telephone: "+33769999707",
      availableLanguage: ["Arabic", "English", "French"],
      areaServed: "Worldwide",
    },
  };
}

export function webSiteLd(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    name: SITE_NAME,
    url: siteUrl(),
    description,
    publisher: { "@id": organizationId() },
    inLanguage: ["en", "ar", "fr", "de"],
  };
}

export function serviceLd({
  name,
  description,
  areaServed,
}: {
  name: string;
  description: string;
  areaServed: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    serviceType: "Wedding planning",
    description,
    provider: { "@id": organizationId() },
    areaServed: areaServed.map((code) => ({
      "@type": "Country",
      identifier: code,
    })),
  };
}

export function collectionPageLd({
  name,
  description,
  url,
  itemUrls,
}: {
  name: string;
  description: string;
  url: string;
  itemUrls: string[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: `${siteUrl()}${url}`,
    isPartOf: { "@id": `${siteUrl()}/#website` },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: itemUrls.length,
      itemListElement: itemUrls.map((href, i) => ({
        "@type": "ListItem",
        position: i + 1,
        url: `${siteUrl()}${href}`,
      })),
    },
  };
}

/**
 * Render one or more JSON-LD blocks as a single script payload.
 *
 * Values here are our own constants and database-derived slugs, never raw user
 * input, and `JSON.stringify` escapes the quotes that would break out of the
 * script element.
 */
export function jsonLdScript(...blocks: object[]): string {
  return JSON.stringify(blocks.length === 1 ? blocks[0] : blocks);
}
