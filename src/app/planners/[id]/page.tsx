import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { PlannerProfileClient } from "./planner-profile-client";

const MOCK_PLANNER = {
  id: "1",
  business_name: "Farida Events",
  bio: "Creating unforgettable celebrations across Cairo and the Nile Delta. With over a decade of experience, I specialize in traditional Egyptian weddings with a modern twist. From intimate gatherings to grand receptions, every detail matters. Let me help you create the celebration of your dreams.",
  location: "Cairo, Egypt",
  avg_rating: 4.9,
  review_count: 127,
  specialties: ["Weddings", "Engagements", "Luxury Events"],
  verified: true,
  profiles: {
    full_name: "Farida Hassan",
    avatar_url:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400",
  },
};

const MOCK_PORTFOLIO = [
  {
    id: "1",
    image_url:
      "https://images.unsplash.com/photo-1519741497674-611481863552?w=600",
    caption: "Elegant rose and eucalyptus centerpiece at the Nile Ritz-Carlton",
    event_type: "wedding",
    style_tags: ["classic", "romantic"],
  },
  {
    id: "2",
    image_url:
      "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=600",
    caption: "Bohemian outdoor ceremony at a private garden",
    event_type: "wedding",
    style_tags: ["bohemian", "rustic"],
  },
  {
    id: "3",
    image_url:
      "https://images.unsplash.com/photo-1520854221256-17451cc331bf?w=600",
    caption: "Luxury golden accents and florals",
    event_type: "wedding",
    style_tags: ["luxury", "romantic"],
  },
  {
    id: "4",
    image_url:
      "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=600",
    caption: "Romantic candlelit engagement party",
    event_type: "engagement",
    style_tags: ["romantic", "classic"],
  },
  {
    id: "5",
    image_url:
      "https://images.unsplash.com/photo-1545235617-7a424c1a60cc?w=600",
    caption: "Garden party elegance",
    event_type: "wedding",
    style_tags: ["classic", "romantic"],
  },
  {
    id: "6",
    image_url:
      "https://images.unsplash.com/photo-1470274038469-958113db2384?w=600",
    caption: "Stunning floral arch installation",
    event_type: "wedding",
    style_tags: ["luxury", "romantic", "classic"],
  },
];

const MOCK_REVIEWS = [
  {
    id: "1",
    author_name: "Sarah M.",
    rating: 5,
    comment:
      "Farida made our wedding absolutely perfect! Every detail was executed flawlessly. She understood our vision from day one and brought it to life beyond our expectations.",
    created_at: "2024-01-15",
  },
  {
    id: "2",
    author_name: "Ahmed K.",
    rating: 5,
    comment:
      "Professional, creative, and a joy to work with. Our engagement party was stunning. Highly recommend Farida Events for any celebration.",
    created_at: "2024-02-20",
  },
  {
    id: "3",
    author_name: "Lina H.",
    rating: 4,
    comment:
      "Beautiful work! The floral arrangements were incredible. Minor communication delays but overall a great experience.",
    created_at: "2024-03-10",
  },
];

interface PlannerProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function PlannerProfilePage({ params }: PlannerProfilePageProps) {
  const { id } = await params;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        <PlannerProfileClient
          planner={MOCK_PLANNER}
          portfolio={MOCK_PORTFOLIO}
          reviews={MOCK_REVIEWS}
        />
      </main>

      <Footer />
    </div>
  );
}
