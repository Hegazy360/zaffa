import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { ExplorePageClient } from "./explore-client";

const MOCK_ARRANGEMENTS = [
  {
    id: "1",
    image_url:
      "https://images.unsplash.com/photo-1519741497674-611481863552?w=600",
    caption: "Elegant rose and eucalyptus centerpiece",
    event_type: "wedding",
    style_tags: ["classic", "romantic"],
    planner_id: "1",
  },
  {
    id: "2",
    image_url:
      "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=600",
    caption: "Bohemian outdoor ceremony setup",
    event_type: "wedding",
    style_tags: ["bohemian", "rustic"],
    planner_id: "2",
  },
  {
    id: "3",
    image_url:
      "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=600",
    caption: "Modern minimalist table design",
    event_type: "corporate",
    style_tags: ["modern", "minimalist"],
    planner_id: "1",
  },
  {
    id: "4",
    image_url:
      "https://images.unsplash.com/photo-1520854221256-17451cc331bf?w=600",
    caption: "Luxury golden accents and florals",
    event_type: "wedding",
    style_tags: ["luxury", "romantic"],
    planner_id: "3",
  },
  {
    id: "5",
    image_url:
      "https://images.unsplash.com/photo-1478146896981-b80fe463b330?w=600",
    caption: "Tropical beach wedding vibes",
    event_type: "wedding",
    style_tags: ["tropical", "bohemian"],
    planner_id: "2",
  },
  {
    id: "6",
    image_url:
      "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600",
    caption: "Romantic candlelit reception",
    event_type: "engagement",
    style_tags: ["romantic", "classic"],
    planner_id: "1",
  },
  {
    id: "7",
    image_url:
      "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?w=600",
    caption: "Vibrant birthday celebration",
    event_type: "birthday",
    style_tags: ["modern", "luxury"],
    planner_id: "4",
  },
  {
    id: "8",
    image_url:
      "https://images.unsplash.com/photo-1545235617-7a424c1a60cc?w=600",
    caption: "Garden party elegance",
    event_type: "wedding",
    style_tags: ["classic", "romantic"],
    planner_id: "3",
  },
  {
    id: "9",
    image_url:
      "https://images.unsplash.com/photo-1519225421980-715cb0215aed?w=600",
    caption: "Desert-inspired outdoor setup",
    event_type: "wedding",
    style_tags: ["bohemian", "rustic"],
    planner_id: "2",
  },
  {
    id: "10",
    image_url:
      "https://images.unsplash.com/photo-1560781297-3d4297d2f034?w=600",
    caption: "Corporate gala sophistication",
    event_type: "corporate",
    style_tags: ["luxury", "modern"],
    planner_id: "5",
  },
  {
    id: "11",
    image_url:
      "https://images.unsplash.com/photo-1527529482837-4698179dc6ce?w=600",
    caption: "Intimate engagement dinner",
    event_type: "engagement",
    style_tags: ["minimalist", "romantic"],
    planner_id: "4",
  },
  {
    id: "12",
    image_url:
      "https://images.unsplash.com/photo-1470274038469-958113db2384?w=600",
    caption: "Stunning floral arch installation",
    event_type: "wedding",
    style_tags: ["luxury", "romantic", "classic"],
    planner_id: "3",
  },
];

export default function ExplorePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-b from-rose-50/80 to-background dark:from-rose-950/20 dark:to-background">
          <div className="container mx-auto max-w-7xl px-4 py-16 md:py-24">
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                Explore{" "}
                <span className="bg-gradient-to-r from-rose-600 to-amber-500 bg-clip-text text-transparent">
                  Stunning Arrangements
                </span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Discover inspiration from Egypt&apos;s finest event planners.
                Filter by event type and style to find your perfect look.
              </p>
            </div>
            <ExplorePageClient initialItems={MOCK_ARRANGEMENTS} />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
