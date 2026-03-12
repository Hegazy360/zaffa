import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { AuthCTA } from "@/components/layout/auth-cta";
import {
  Sparkles,
  Users,
  Calendar,
  Star,
  ArrowRight,
  Heart,
} from "lucide-react";

const features = [
  {
    icon: Sparkles,
    title: "AI-Powered Styling",
    description:
      "Take our style quiz and get personalized color palettes, decor suggestions, and mood boards powered by AI.",
  },
  {
    icon: Users,
    title: "Top Planners",
    description:
      "Browse portfolios, read reviews, and connect with Egypt's most talented wedding planners.",
  },
  {
    icon: Calendar,
    title: "Seamless Planning",
    description:
      "Manage your entire event from one dashboard — vendors, timeline, budget, and real-time messaging.",
  },
  {
    icon: Star,
    title: "Verified Vendors",
    description:
      "Discover caterers, photographers, florists, and more — all vetted and reviewed by real clients.",
  },
];

const stats = [
  { value: "500+", label: "Event Planners" },
  { value: "2,000+", label: "Verified Vendors" },
  { value: "10,000+", label: "Events Planned" },
  { value: "4.9", label: "Average Rating" },
];

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-b from-rose-50 to-white dark:from-rose-950/20 dark:to-background">
          <div className="container mx-auto max-w-7xl px-4 py-24 md:py-32">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm text-muted-foreground mb-6">
                <Heart className="h-3.5 w-3.5 text-rose-500" />
                Egypt&apos;s Premier Event Planning Platform
              </div>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
                Your Dream Event,{" "}
                <span className="bg-gradient-to-r from-rose-600 to-amber-500 bg-clip-text text-transparent">
                  Expertly Planned
                </span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
                Discover stunning arrangements, connect with top planners, and
                let AI help you create the perfect celebration. From Cairo to
                Alexandria, your زفّة starts here.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  size="lg"
                  render={<Link href="/explore" />}
                  className="bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90 text-base px-8"
                >
                  Start Exploring
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Button size="lg" variant="outline" render={<Link href="/ai/style-quiz" />} className="text-base px-8">
                  Take the Style Quiz
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Stats */}
        <section className="border-y bg-muted/30">
          <div className="container mx-auto max-w-7xl px-4 py-12">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {stats.map((stat) => (
                <div key={stat.label} className="text-center">
                  <p className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-rose-600 to-amber-500 bg-clip-text text-transparent">
                    {stat.value}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container mx-auto max-w-7xl px-4 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything You Need for the Perfect Event
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              From initial inspiration to the big day, Zaffa brings together
              technology and talent to make your celebration unforgettable.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="group relative rounded-2xl border p-6 transition-all hover:shadow-lg hover:border-rose-200 dark:hover:border-rose-800"
                >
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-r from-rose-100 to-amber-100 dark:from-rose-900/30 dark:to-amber-900/30">
                    <Icon className="h-6 w-6 text-rose-600" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {feature.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-r from-rose-600 to-amber-500 text-white">
          <div className="container mx-auto max-w-7xl px-4 py-24 text-center">
            <AuthCTA />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
