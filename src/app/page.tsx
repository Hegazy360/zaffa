import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { openGraphLocaleFields } from "@/i18n/config";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { SampleStudioHero } from "@/components/home/sample-studio-hero";
import { HeroSocialProof } from "@/components/home/hero-social-proof";
import { HowItWorks } from "@/components/home/how-it-works";
import { ConciergePillarsSection } from "@/components/home/concierge-pillars-section";
import { WholeWeddingSection } from "@/components/home/whole-wedding-section";
import { ShareSection } from "@/components/home/share-section";
import { TestimonialsSection } from "@/components/home/testimonials-section";
import { BeginSection } from "@/components/home/begin-section";
import { TierComparisonSection } from "@/components/home/tier-comparison-section";
import { AskZaffaSection } from "@/components/home/ask-zaffa-section";
import { isFlagEnabled } from "@/lib/flags";
import { getTranslations } from "next-intl/server";
import { jsonLdScript, serviceLd } from "@/lib/structured-data";
import { pricedMarkets } from "@/lib/concierge-pricing";

// Metadata deliberately carries no price (asking for money before the
// visitor knows what we do was tested and lost, see the hero's history).
// Rewritten around the instant-studio promise when the sample studio
// became the hero, and moved onto i18n keys - it was hardcoded English
// before, on a page whose primary market reads Arabic.
export async function generateMetadata(): Promise<Metadata> {
  // Next.js replaces `openGraph` wholesale rather than merging with the root
  // layout, so the locale fields have to be spread in here too - without this
  // the home page emits no og:locale at all.
  const locale = await getLocale();
  const t = await getTranslations("marketing");
  return {
    title: t("homeMetaTitle"),
    description: t("homeMetaDescription"),
    alternates: { canonical: "/" },
    openGraph: {
      title: t("homeMetaTitle"),
      description: t("homeMetaOgDescription"),
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

export default async function HomePage() {
  const t = await getTranslations("marketing");

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      {/* Service, not Product: we sell a service and have no ratings. An
          AggregateRating here would be the invented "4.9" ZAF-45 deleted,
          reappearing as markup - where it is worse, because a rich result
          showing stars we made up is a manual action waiting to happen. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            serviceLd({
              name: t("wholeWedding.eyebrow"),
              description: t("wholeWedding.tagline"),
              areaServed: pricedMarkets(),
            }),
          ),
        }}
      />

      <main className="flex-1">
        {/* The hero IS the product: a sample wedding the visitor restyles
            live, then carries into the designer. Proof is a server
            component passed into the client hero as a slot, the figures
            have to be real, so they are read at request time rather than
            hardcoded. */}
        <SampleStudioHero socialProof={<HeroSocialProof />} />

        {/* How it works - four steps with screenshots, ending in the
            handoff to the concierge (step 4) */}
        <HowItWorks />

        {/* What your concierge does, the "then we take over" identity
            statement. Sits right after the AI-flow walkthrough so the
            handoff (step 4) and the payoff land back-to-back. */}
        <ConciergePillarsSection />

        {/* The Whole Wedding, the full-service plan. Sits immediately after
            the pillars because the pillars ask "so what do we actually do?"
            and answer "the whole thing"; this is the next sentence, naming
            the plan that does it. Deliberately *above* the two artefact
            packs: leading with the packs after that promise would contradict
            the hero. Its own section rather than a third tier card, see the
            header comment in the component for why. */}
        <WholeWeddingSection />

        {/* The artefacts, what you walk away with: a private microsite
            and a printable lookbook PDF, designed for the audiences that
            matter (family, friends, every planner you meet). Demoted to
            supporting proof (smaller heading scale, tighter rhythm) now
            that the concierge pillars carry the primary identity
            statement, see ZAF-18/ZAF-19. */}
        {/* Renders nothing until real couples have said something real -
            both the flag and the empty data source gate it. */}
        <TestimonialsSection />

        <ShareSection />

        {/* Ask Zaffa, the chat's visible invitation. Rendered only when
            the aiChat flag is on, so the section and the floating widget
            appear and disappear together. */}
        {isFlagEnabled("aiChat") && <AskZaffaSection />}

        {/* Tier comparison, sits *after* the artefacts walkthrough so
            visitors see the full feature set before the price split.
            Surfaces both SKUs side-by-side with localized pricing.
            Lazily fetches per-country pricing from the same tRPC
            endpoint as the paywall. */}
        <TierComparisonSection />

        {/* Final CTA */}
        <BeginSection />
      </main>

      <Footer />
    </div>
  );
}
