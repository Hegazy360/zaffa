import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString =
  process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL (or DIRECT_DATABASE_URL) must be set to run the seed.",
  );
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Seed planner profiles
  const planners = [
    {
      id: "11111111-1111-1111-1111-111111111111",
      full_name: "Nour Hassan",
      role: "planner" as const,
      avatar_url: null,
      phone: "+201001234567",
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      full_name: "Farida Abdel-Rahman",
      role: "planner" as const,
      avatar_url: null,
      phone: "+201002345678",
    },
    {
      id: "33333333-3333-3333-3333-333333333333",
      full_name: "Tarek El-Sayed",
      role: "planner" as const,
      avatar_url: null,
      phone: "+201003456789",
    },
    {
      id: "44444444-4444-4444-4444-444444444444",
      full_name: "Layla Mostafa",
      role: "planner" as const,
      avatar_url: null,
      phone: "+201004567890",
    },
    {
      id: "55555555-5555-5555-5555-555555555555",
      full_name: "Youssef Kamal",
      role: "planner" as const,
      avatar_url: null,
      phone: "+201005678901",
    },
    {
      id: "66666666-6666-6666-6666-666666666666",
      full_name: "Mona Saeed",
      role: "planner" as const,
      avatar_url: null,
      phone: "+201006789012",
    },
  ];

  for (const p of planners) {
    await prisma.profile.upsert({
      where: { id: p.id },
      update: {},
      create: p,
    });
  }

  const plannerProfiles = [
    {
      id: "aaaa1111-1111-1111-1111-111111111111",
      user_id: "11111111-1111-1111-1111-111111111111",
      business_name: "Dream Events Egypt",
      bio: "Creating magical moments for over 10 years. Specializing in luxury weddings across Cairo and the Red Sea.",
      location: "Cairo",
      specialties: JSON.stringify(["Luxury Weddings", "Destination Events", "Royal Themes"]),
      avg_rating: 4.9,
      review_count: 127,
      verified: true,
    },
    {
      id: "aaaa2222-2222-2222-2222-222222222222",
      user_id: "22222222-2222-2222-2222-222222222222",
      business_name: "Farida Events",
      bio: "Modern, elegant celebrations with an Egyptian soul. From intimate gatherings to grand affairs.",
      location: "Cairo",
      specialties: JSON.stringify(["Modern Weddings", "Engagements", "Corporate"]),
      avg_rating: 4.8,
      review_count: 89,
      verified: true,
    },
    {
      id: "aaaa3333-3333-3333-3333-333333333333",
      user_id: "33333333-3333-3333-3333-333333333333",
      business_name: "Nile Celebrations",
      bio: "Riverside elegance meets timeless tradition. Specialists in Nile-side ceremonies and receptions.",
      location: "Cairo",
      specialties: JSON.stringify(["Riverside Events", "Traditional", "Garden Parties"]),
      avg_rating: 4.7,
      review_count: 64,
      verified: true,
    },
    {
      id: "aaaa4444-4444-4444-4444-444444444444",
      user_id: "44444444-4444-4444-4444-444444444444",
      business_name: "Alexandria Weddings Co.",
      bio: "Bringing Mediterranean charm to your special day. Based in Alexandria with events across the North Coast.",
      location: "Alexandria",
      specialties: JSON.stringify(["Beach Weddings", "Mediterranean Style", "Summer Events"]),
      avg_rating: 4.6,
      review_count: 52,
      verified: true,
    },
    {
      id: "aaaa5555-5555-5555-5555-555555555555",
      user_id: "55555555-5555-5555-5555-555555555555",
      business_name: "Cairo Weddings Co.",
      bio: "Full-service wedding planning with a personal touch. Every detail matters.",
      location: "Cairo",
      specialties: JSON.stringify(["Full Service", "Budget-Friendly", "Intimate Weddings"]),
      avg_rating: 4.5,
      review_count: 41,
      verified: false,
    },
    {
      id: "aaaa6666-6666-6666-6666-666666666666",
      user_id: "66666666-6666-6666-6666-666666666666",
      business_name: "Sahara Soirees",
      bio: "Extraordinary desert celebrations and unconventional venues. Making the impossible possible.",
      location: "Giza",
      specialties: JSON.stringify(["Desert Events", "Unconventional Venues", "Bohemian"]),
      avg_rating: 4.8,
      review_count: 37,
      verified: true,
    },
  ];

  for (const pp of plannerProfiles) {
    await prisma.plannerProfile.upsert({
      where: { id: pp.id },
      update: {},
      create: pp,
    });
  }

  // Seed vendor profiles
  const vendorUsers = [
    { id: "77777777-7777-7777-7777-777777777771", full_name: "Hassan Mahmoud", role: "vendor" as const },
    { id: "77777777-7777-7777-7777-777777777772", full_name: "Amira Salem", role: "vendor" as const },
    { id: "77777777-7777-7777-7777-777777777773", full_name: "Karim Fathy", role: "vendor" as const },
    { id: "77777777-7777-7777-7777-777777777774", full_name: "Dina Adel", role: "vendor" as const },
    { id: "77777777-7777-7777-7777-777777777775", full_name: "Omar Sherif", role: "vendor" as const },
    { id: "77777777-7777-7777-7777-777777777776", full_name: "Yasmin Fouad", role: "vendor" as const },
    { id: "77777777-7777-7777-7777-777777777777", full_name: "Ramy Gamal", role: "vendor" as const },
    { id: "77777777-7777-7777-7777-777777777778", full_name: "Heba Nabil", role: "vendor" as const },
  ];

  for (const v of vendorUsers) {
    await prisma.profile.upsert({
      where: { id: v.id },
      update: {},
      create: { ...v, avatar_url: null, phone: null },
    });
  }

  const vendorProfiles = [
    { id: "bbbb1111-1111-1111-1111-111111111111", user_id: vendorUsers[0].id, business_name: "Cairo Catering Co.", category: "catering" as const, location: "Cairo", avg_rating: 4.9, verified: true },
    { id: "bbbb2222-2222-2222-2222-222222222222", user_id: vendorUsers[1].id, business_name: "Golden Lens Photography", category: "photography" as const, location: "Cairo", avg_rating: 4.8, verified: true },
    { id: "bbbb3333-3333-3333-3333-333333333333", user_id: vendorUsers[2].id, business_name: "Rose Garden Florists", category: "flowers" as const, location: "Cairo", avg_rating: 4.7, verified: true },
    { id: "bbbb4444-4444-4444-4444-444444444444", user_id: vendorUsers[3].id, business_name: "Nile Tunes Band", category: "music" as const, location: "Cairo", avg_rating: 4.6, verified: false },
    { id: "bbbb5555-5555-5555-5555-555555555555", user_id: vendorUsers[4].id, business_name: "Luxor Decor", category: "decoration" as const, location: "Luxor", avg_rating: 4.5, verified: true },
    { id: "bbbb6666-6666-6666-6666-666666666666", user_id: vendorUsers[5].id, business_name: "Glam Studio", category: "makeup" as const, location: "Cairo", avg_rating: 4.9, verified: true },
    { id: "bbbb7777-7777-7777-7777-777777777777", user_id: vendorUsers[6].id, business_name: "Pyramid Films", category: "videography" as const, location: "Giza", avg_rating: 4.4, verified: false },
    { id: "bbbb8888-8888-8888-8888-888888888888", user_id: vendorUsers[7].id, business_name: "Royal Rides Egypt", category: "transportation" as const, location: "Cairo", avg_rating: 4.3, verified: true },
  ];

  for (const vp of vendorProfiles) {
    await prisma.vendorProfile.upsert({
      where: { id: vp.id },
      update: {},
      create: vp,
    });
  }

  // Seed vendor services
  const services = [
    { vendor_id: "bbbb1111-1111-1111-1111-111111111111", name: "Wedding Buffet Package", description: "Full buffet for up to 200 guests with appetizers, mains, desserts, and beverages.", price_from: 150, price_unit: "per_person" },
    { vendor_id: "bbbb1111-1111-1111-1111-111111111111", name: "Premium Dessert Table", description: "Elegant dessert display with cakes, pastries, and Oriental sweets.", price_from: 5000, price_unit: "per_event" },
    { vendor_id: "bbbb2222-2222-2222-2222-222222222222", name: "Full Day Photography", description: "12-hour coverage with 2 photographers, edited album of 500+ photos.", price_from: 25000, price_unit: "per_event" },
    { vendor_id: "bbbb2222-2222-2222-2222-222222222222", name: "Engagement Session", description: "2-hour outdoor photoshoot at a location of your choice.", price_from: 8000, price_unit: "per_event" },
    { vendor_id: "bbbb3333-3333-3333-3333-333333333333", name: "Bridal Bouquet", description: "Custom bridal bouquet with imported roses and seasonal flowers.", price_from: 3000, price_unit: "per_event" },
    { vendor_id: "bbbb3333-3333-3333-3333-333333333333", name: "Full Venue Florals", description: "Complete floral decoration for ceremony and reception.", price_from: 30000, price_unit: "per_event" },
    { vendor_id: "bbbb4444-4444-4444-4444-444444444444", name: "Live Band (4 hours)", description: "6-piece band playing Arabic and Western music.", price_from: 20000, price_unit: "per_event" },
    { vendor_id: "bbbb5555-5555-5555-5555-555555555555", name: "Full Venue Styling", description: "Complete decoration including lighting, draping, and centerpieces.", price_from: 50000, price_unit: "per_event" },
    { vendor_id: "bbbb6666-6666-6666-6666-666666666666", name: "Bridal Makeup Package", description: "Trial + wedding day makeup and hair styling.", price_from: 7000, price_unit: "per_event" },
    { vendor_id: "bbbb7777-7777-7777-7777-777777777777", name: "Wedding Film", description: "Cinematic highlight film + full ceremony edit.", price_from: 35000, price_unit: "per_event" },
    { vendor_id: "bbbb8888-8888-8888-8888-888888888888", name: "Luxury Bridal Car", description: "Mercedes S-Class with chauffeur for the bride and groom.", price_from: 5000, price_unit: "per_event" },
  ];

  for (const s of services) {
    await prisma.vendorService.create({ data: s });
  }

  // Seed portfolio items
  const portfolioItems = [
    { planner_id: "aaaa1111-1111-1111-1111-111111111111", image_url: "https://images.unsplash.com/photo-1519741497674-611481863552?w=800", caption: "Royal Garden Wedding", event_type: "wedding" as const, style_tags: JSON.stringify(["luxury", "garden", "classic"]) },
    { planner_id: "aaaa1111-1111-1111-1111-111111111111", image_url: "https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?w=800", caption: "Sunset Nile Ceremony", event_type: "wedding" as const, style_tags: JSON.stringify(["romantic", "riverside", "golden"]) },
    { planner_id: "aaaa2222-2222-2222-2222-222222222222", image_url: "https://images.unsplash.com/photo-1511285560929-80b456fea0bc?w=800", caption: "Minimalist White Wedding", event_type: "wedding" as const, style_tags: JSON.stringify(["modern", "minimalist", "white"]) },
    { planner_id: "aaaa2222-2222-2222-2222-222222222222", image_url: "https://images.unsplash.com/photo-1478146059778-26028b07395a?w=800", caption: "Elegant Engagement", event_type: "engagement" as const, style_tags: JSON.stringify(["elegant", "gold", "intimate"]) },
    { planner_id: "aaaa3333-3333-3333-3333-333333333333", image_url: "https://images.unsplash.com/photo-1522673607200-164d1b6ce486?w=800", caption: "Garden Party Reception", event_type: "wedding" as const, style_tags: JSON.stringify(["garden", "rustic", "floral"]) },
    { planner_id: "aaaa4444-4444-4444-4444-444444444444", image_url: "https://images.unsplash.com/photo-1469371670807-013ccf25f16a?w=800", caption: "Beach Wedding Alexandria", event_type: "wedding" as const, style_tags: JSON.stringify(["beach", "bohemian", "summer"]) },
    { planner_id: "aaaa5555-5555-5555-5555-555555555555", image_url: "https://images.unsplash.com/photo-1532712938310-34cb3982ef74?w=800", caption: "Intimate Rooftop Wedding", event_type: "wedding" as const, style_tags: JSON.stringify(["intimate", "rooftop", "urban"]) },
    { planner_id: "aaaa6666-6666-6666-6666-666666666666", image_url: "https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?w=800", caption: "Desert Glamping Event", event_type: "other" as const, style_tags: JSON.stringify(["desert", "bohemian", "adventure"]) },
  ];

  for (const pi of portfolioItems) {
    await prisma.portfolioItem.create({ data: pi });
  }

  console.log("Seed data created successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
