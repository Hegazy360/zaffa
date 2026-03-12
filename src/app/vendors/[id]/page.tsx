import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Check, Mail, MapPin, Star } from "lucide-react";
import type { VendorCategory } from "@/types";

interface VendorProfile {
  id: string;
  business_name: string;
  category: VendorCategory;
  location: string;
  rating: number;
  verified: boolean;
  description: string;
  services: Array<{
    id: string;
    name: string;
    description: string;
    price_from: number;
    price_unit: string;
  }>;
  reviews: Array<{
    id: string;
    author_name: string;
    rating: number;
    comment: string;
    date: string;
  }>;
}

const mockVendor: VendorProfile = {
  id: "1",
  business_name: "Cairo Catering Co.",
  category: "catering",
  location: "Cairo, Egypt",
  rating: 4.9,
  verified: true,
  description:
    "Premium catering services for weddings, corporate events, and private celebrations. We specialize in Egyptian and international cuisine, with a focus on fresh ingredients and elegant presentation. Serving Cairo and the greater Giza area for over 15 years.",
  services: [
    {
      id: "s1",
      name: "Wedding Buffet Package",
      description:
        "Full buffet for up to 200 guests. Includes appetizers, main courses, desserts, and beverages. Customizable menu options.",
      price_from: 150,
      price_unit: "per_person",
    },
    {
      id: "s2",
      name: "Premium Dessert Table",
      description:
        "Elegant dessert display with cakes, pastries, and sweets. Perfect for wedding receptions.",
      price_from: 5000,
      price_unit: "per_event",
    },
    {
      id: "s3",
      name: "Corporate Lunch",
      description:
        "Business lunch catering for meetings and corporate events. Quick setup and professional service.",
      price_from: 80,
      price_unit: "per_person",
    },
  ],
  reviews: [
    {
      id: "r1",
      author_name: "Ahmed M.",
      rating: 5,
      comment:
        "Exceptional food and service for our wedding. Guests are still talking about the dessert table!",
      date: "2024-12-15",
    },
    {
      id: "r2",
      author_name: "Sara H.",
      rating: 5,
      comment:
        "Professional, punctual, and the food was delicious. Highly recommend for any event.",
      date: "2024-11-20",
    },
    {
      id: "r3",
      author_name: "Omar K.",
      rating: 4,
      comment:
        "Great catering experience. Minor delay in setup but overall excellent quality.",
      date: "2024-10-08",
    },
  ],
};

function formatCategory(category: VendorCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatPrice(amount: number, unit: string): string {
  const formatted = new Intl.NumberFormat("en-EG", {
    style: "currency",
    currency: "EGP",
    minimumFractionDigits: 0,
  }).format(amount);
  const unitLabel = unit === "per_person" ? "per person" : "per event";
  return `${formatted} ${unitLabel}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function VendorProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await params;
  const vendor = mockVendor;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="border-b bg-muted/30 py-12">
          <div className="container mx-auto max-w-7xl px-4">
            <div className="flex flex-col md:flex-row md:items-start gap-8">
              <Avatar className="h-24 w-24 rounded-xl shrink-0">
                <AvatarFallback className="rounded-xl bg-gradient-to-br from-rose-100 to-amber-100 text-rose-700 text-2xl">
                  {getInitials(vendor.business_name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-3xl font-bold tracking-tight">
                    {vendor.business_name}
                  </h1>
                  {vendor.verified && (
                    <Badge className="bg-primary">
                      <Check className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Badge variant="secondary">
                      {formatCategory(vendor.category)}
                    </Badge>
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {vendor.location}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                    {vendor.rating} ({vendor.reviews.length} reviews)
                  </span>
                </div>
                <p className="mt-4 text-muted-foreground max-w-2xl">
                  {vendor.description}
                </p>
                <Button
                  render={<Link href="#" />}
                  className="mt-6 bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Contact Vendor
                </Button>
              </div>
            </div>
          </div>
        </section>

        <div className="container mx-auto max-w-7xl px-4 py-12 space-y-12">
          <section>
            <h2 className="text-xl font-semibold mb-6">Services Offered</h2>
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {vendor.services.map((service) => (
                <Card key={service.id} className="h-full">
                  <CardHeader>
                    <CardTitle className="text-base">{service.name}</CardTitle>
                    <CardDescription>{service.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="font-medium text-primary">
                      From {formatPrice(service.price_from, service.price_unit)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-6">Reviews</h2>
            <div className="space-y-4">
              {vendor.reviews.map((review) => (
                <Card key={review.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">
                        {review.author_name}
                      </CardTitle>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                        <span className="text-sm font-medium">
                          {review.rating}
                        </span>
                      </div>
                    </div>
                    <CardDescription>
                      {formatDate(review.date)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{review.comment}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
