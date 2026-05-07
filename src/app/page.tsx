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

// The OG card / search snippet uses the default seed price ("from $99"
// framing) rather than per-country dynamic pricing — keeping the home
// page statically cacheable matters more than perfect price-tag fidelity
// in the social card. The on-page hero + CTA localize per-visitor via
// the client `useVisionPackPricing` hook.
const META_PRICE_LABEL = formatPriceLabel(seedPricingFor(null));

export const metadata: Metadata = {
  title: `Zaffa — Your wedding, visualized from ${META_PRICE_LABEL}`,
  description: `The Wedding Vision Pack: 20 photoreal renders, 2 short videos, a printable lookbook PDF, and a shareable microsite — from ${META_PRICE_LABEL}. Optional planner match comes after, on your terms.`,
  alternates: { canonical: "/" },
  openGraph: {
    title: `Zaffa — Your wedding, visualized from ${META_PRICE_LABEL}`,
    description: `The Wedding Vision Pack: 20 renders + 2 videos + lookbook + microsite from ${META_PRICE_LABEL}. Planner match optional.`,
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

        {/* How it works — four simple steps with screenshots */}
        <HowItWorks />

        {/* The artefacts — what you walk away with: a private microsite
            and a printable lookbook PDF, designed for the audiences that
            matter (family, friends, every planner you meet). */}
        <ShareSection />

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
