import type { Metadata } from "next";
import { Suspense } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroEditorial } from "@/components/home/hero-editorial";
import { HowItWorks } from "@/components/home/how-it-works";
import { BeginSection } from "@/components/home/begin-section";
import {
  MarketplaceTeaserSection,
  MarketplaceTeaserSkeleton,
} from "@/components/home/marketplace-teaser-section";

export const metadata: Metadata = {
  title: "Zaffa — Your Dream Event, Expertly Planned",
  description:
    "Egypt's editorial event atelier. Connect with vetted wedding planners and vendors, design your venue with AI-powered mood boards, and pay through a secure escrow.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Zaffa — Your Dream Event, Expertly Planned",
    description:
      "Egypt's editorial event atelier. Vetted planners + vendors, AI venue design, and Stripe-backed escrow.",
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
