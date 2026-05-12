import type { Metadata } from "next";
import { Suspense } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroEditorial } from "@/components/home/hero-editorial";
import { HowItWorks } from "@/components/home/how-it-works";
import { ShareSection } from "@/components/home/share-section";
import { BeginSection } from "@/components/home/begin-section";
import {
  MarketplaceTeaserSection,
  MarketplaceTeaserSkeleton,
} from "@/components/home/marketplace-teaser-section";

import {
  formatPriceLabel,
  seedPricingFor,
} from "@/lib/vision-pack-pricing";
import { DEFAULT_PACK_SKU } from "@/lib/vision-pack";
import { TierComparisonSection } from "@/components/home/tier-comparison-section";

// The OG card / search snippet uses the default seed price for the
// **lower** tier ("from $19.99" framing) rather than per-country
// dynamic pricing — keeping the home page statically cacheable matters
// more than perfect price-tag fidelity in the social card. The on-page
// hero + CTA localize per-visitor via the client `useVisionPackPricing`
// hook.
const META_PRICE_LABEL = formatPriceLabel(
  seedPricingFor(null, DEFAULT_PACK_SKU),
);

export const metadata: Metadata = {
  title: `Zaffa — Your wedding, visualized from ${META_PRICE_LABEL}`,
  description: `Zaffa's Design Pack starts at ${META_PRICE_LABEL} — photoreal renders, a printable lookbook PDF and a shareable microsite. Upgrade to the Vision Pack for venue and planner matching.`,
  alternates: { canonical: "/" },
  openGraph: {
    title: `Zaffa — Your wedding, visualized from ${META_PRICE_LABEL}`,
    description: `Two ways in: Design Pack from ${META_PRICE_LABEL} or the full Vision Pack with venue + planner matching. Mood board, renders, lookbook, microsite — yours forever.`,
    url: "/",
    type: "website",
  },
};

// ISR: refresh the teaser data at most every 5 minutes. Plenty fresh for
// the "platform is buzzing" social proof, and one DB hit per 5 minutes is
// well within budget even on a busy day.
export const revalidate = 300;

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {/* What the platform is */}
        <HeroEditorial />

        {/* How it works — three simple steps with screenshots */}
        <HowItWorks />

        {/* The artefacts — what you walk away with: a private microsite
            and a printable lookbook PDF, designed for the audiences that
            matter (family, friends, every planner you meet). */}
        <ShareSection />

        {/* Tier comparison — sits *after* the artefacts walkthrough so
            visitors see the full feature set before the price split.
            Surfaces both SKUs side-by-side with localized pricing.
            Lazily fetches per-country pricing from the same tRPC
            endpoint as the paywall. */}
        <TierComparisonSection />

        {/* The pulse — who's already on the platform. Streamed: the rest of
            the marketing shell flushes immediately while the DB query for
            the anonymized briefs resolves in the background. */}
        <Suspense fallback={<MarketplaceTeaserSkeleton variant="home" />}>
          <MarketplaceTeaserSection variant="home" />
        </Suspense>

        {/* Final CTA */}
        <BeginSection />
      </main>

      <Footer />
    </div>
  );
}
