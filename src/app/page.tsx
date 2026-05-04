import type { Metadata } from "next";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroEditorial } from "@/components/home/hero-editorial";
import { ScrollyDemo } from "@/components/home/scrolly-demo";
import { EditorialReel } from "@/components/home/editorial-reel";
import { BeginSection } from "@/components/home/begin-section";

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

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Act I — The promise */}
        <HeroEditorial />

        {/* Act II — The atelier (centerpiece) */}
        <ScrollyDemo />

        {/* Act III — The proof */}
        <EditorialReel />

        {/* Act IV — Begin */}
        <BeginSection />
      </main>

      <Footer />
    </div>
  );
}
