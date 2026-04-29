import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { HeroEditorial } from "@/components/home/hero-editorial";
import { SocialProofMarquee } from "@/components/home/social-proof-marquee";
import { EditorialReel } from "@/components/home/editorial-reel";
import { QuoteTheater } from "@/components/home/quote-theater";
import { StatsBand } from "@/components/home/stats-band";
import { Contact } from "@/components/home/contact";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      <main className="flex-1">
        <HeroEditorial />
        <SocialProofMarquee />
        <EditorialReel />
        <QuoteTheater />
        <StatsBand />
        <Contact />
      </main>

      <Footer />
    </div>
  );
}
