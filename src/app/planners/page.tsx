import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PlannersPageClient } from "./planners-client";

const MOCK_PLANNERS = [
  {
    id: "1",
    business_name: "Farida Events",
    bio: "Creating unforgettable celebrations across Cairo and the Nile Delta. Specializing in traditional Egyptian weddings with a modern twist.",
    location: "Cairo, Egypt",
    avg_rating: 4.9,
    review_count: 127,
    specialties: ["Weddings", "Engagements", "Luxury Events"],
    verified: true,
    profiles: {
      full_name: "Farida Hassan",
      avatar_url: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200",
    },
  },
  {
    id: "2",
    business_name: "Nile Celebrations",
    bio: "From intimate gatherings to grand receptions, we bring the magic of the Nile to your special day.",
    location: "Giza, Egypt",
    avg_rating: 4.8,
    review_count: 89,
    specialties: ["Weddings", "Corporate", "Birthdays"],
    verified: true,
    profiles: {
      full_name: "Omar Khalil",
      avatar_url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200",
    },
  },
  {
    id: "3",
    business_name: "Cairo Weddings Co.",
    bio: "Premium wedding planning with a focus on elegant, timeless designs. Serving discerning clients since 2015.",
    location: "Cairo, Egypt",
    avg_rating: 4.95,
    review_count: 203,
    specialties: ["Luxury Weddings", "Destination Events"],
    verified: true,
    profiles: {
      full_name: "Layla Mahmoud",
      avatar_url: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200",
    },
  },
  {
    id: "4",
    business_name: "Alexandria Elegance",
    bio: "Coastal charm meets sophisticated celebration. We specialize in beach and garden weddings along the Mediterranean.",
    location: "Alexandria, Egypt",
    avg_rating: 4.7,
    review_count: 64,
    specialties: ["Beach Weddings", "Garden Parties", "Engagements"],
    verified: false,
    profiles: {
      full_name: "Youssef Amin",
      avatar_url: undefined,
    },
  },
  {
    id: "5",
    business_name: "Luxor Events & Co.",
    bio: "Ancient beauty meets modern celebration. Unique destination weddings in Upper Egypt.",
    location: "Luxor, Egypt",
    avg_rating: 4.85,
    review_count: 42,
    specialties: ["Destination Weddings", "Cultural Events"],
    verified: true,
    profiles: {
      full_name: "Nadia Farouk",
      avatar_url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200",
    },
  },
  {
    id: "6",
    business_name: "Desert Rose Planning",
    bio: "Bohemian and rustic celebrations in stunning desert and oasis settings.",
    location: "Fayoum, Egypt",
    avg_rating: 4.75,
    review_count: 31,
    specialties: ["Rustic Weddings", "Outdoor Events", "Engagements"],
    verified: false,
    profiles: {
      full_name: "Karim Said",
      avatar_url: undefined,
    },
  },
];

export default function PlannersPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        <section className="relative overflow-hidden bg-gradient-to-b from-rose-50/80 to-background dark:from-rose-950/20 dark:to-background">
          <div className="container mx-auto max-w-7xl px-4 py-16 md:py-24">
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
                Find Your{" "}
                <span className="bg-gradient-to-r from-rose-600 to-amber-500 bg-clip-text text-transparent">
                  Perfect Planner
                </span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Connect with Egypt&apos;s most talented event planners. Browse
                portfolios, read reviews, and book your dream team.
              </p>
            </div>
            <PlannersPageClient planners={MOCK_PLANNERS} />
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
