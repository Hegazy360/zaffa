import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { openGraphLocaleFields } from "@/i18n/config";
import { Suspense } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroEditorial } from "@/components/home/hero-editorial";
import { HowItWorks } from "@/components/home/how-it-works";
import { ConciergePillarsSection } from "@/components/home/concierge-pillars-section";
import { WholeWeddingSection } from "@/components/home/whole-wedding-section";
import { ShareSection } from "@/components/home/share-section";
import { BeginSection } from "@/components/home/begin-section";
import {
  MarketplaceTeaserSection,
  MarketplaceTeaserSkeleton,
} from "@/components/home/marketplace-teaser-section";

import { TierComparisonSection } from "@/components/home/tier-comparison-section";

// Metadata deliberately carries no price. It used to open with "from $19",
// which was the first thing anyone saw in a search result or a shared link —
// and it contradicted the page it was describing: the hero stopped leading
// with the AI tool and the price tag on purpose, because asking for money
// before the visitor knows what we do was losing them. The tier comparison
// still shows real, per-country pricing further down the page.
export async function generateMetadata(): Promise<Metadata> {
  // Next.js replaces `openGraph` wholesale rather than merging with the root
  // layout, so the locale fields have to be spread in here too — without this
  // the home page emits no og:locale at all.
  const locale = await getLocale();
  return {
    title: "Zaffa — Getting married? We've got all of it.",
    description:
      "The planner, the venue, the vendors — and the hundred things nobody warned you about. Zaffa handles the whole wedding. Start with a free look at your day.",
    alternates: { canonical: "/" },
    openGraph: {
      title: "Zaffa — Getting married? We've got all of it.",
      description:
        "We find you the right planner, deal with the back-and-forth, and only send you vendors we'd use ourselves. See your day first — free, in about thirty seconds.",
      url: "/",
      type: "website",
      ...openGraphLocaleFields(locale),
    },
  };
}

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

        {/* How it works — four steps with screenshots, ending in the
            handoff to the concierge (step 4) */}
        <HowItWorks />

        {/* What your concierge does — the "then we take over" identity
            statement. Sits right after the AI-flow walkthrough so the
            handoff (step 4) and the payoff land back-to-back. */}
        <ConciergePillarsSection />

        {/* The Whole Wedding — the full-service plan. Sits immediately after
            the pillars because the pillars ask "so what do we actually do?"
            and answer "the whole thing"; this is the next sentence, naming
            the plan that does it. Deliberately *above* the two artefact
            packs: leading with the packs after that promise would contradict
            the hero. Its own section rather than a third tier card — see the
            header comment in the component for why. */}
        <WholeWeddingSection />

        {/* The artefacts — what you walk away with: a private microsite
            and a printable lookbook PDF, designed for the audiences that
            matter (family, friends, every planner you meet). Demoted to
            supporting proof (smaller heading scale, tighter rhythm) now
            that the concierge pillars carry the primary identity
            statement — see ZAF-18/ZAF-19. */}
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
