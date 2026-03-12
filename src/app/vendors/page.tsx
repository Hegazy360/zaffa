import Link from "next/link";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Check } from "lucide-react";
import type { VendorCategory } from "@/types";

interface VendorCard {
  id: string;
  business_name: string;
  category: VendorCategory;
  location: string;
  rating: number;
  verified: boolean;
}

const categories: { value: VendorCategory; label: string }[] = [
  { value: "catering", label: "Catering" },
  { value: "photography", label: "Photography" },
  { value: "flowers", label: "Flowers" },
  { value: "music", label: "Music" },
  { value: "decoration", label: "Decoration" },
  { value: "venue", label: "Venue" },
  { value: "videography", label: "Videography" },
  { value: "makeup", label: "Makeup" },
  { value: "fashion", label: "Fashion" },
  { value: "transportation", label: "Transportation" },
];

const mockVendors: VendorCard[] = [
  {
    id: "1",
    business_name: "Cairo Catering Co.",
    category: "catering",
    location: "Cairo, Egypt",
    rating: 4.9,
    verified: true,
  },
  {
    id: "2",
    business_name: "Golden Lens Photography",
    category: "photography",
    location: "Giza, Egypt",
    rating: 4.8,
    verified: true,
  },
  {
    id: "3",
    business_name: "Rose Garden Florists",
    category: "flowers",
    location: "Alexandria, Egypt",
    rating: 4.7,
    verified: false,
  },
  {
    id: "4",
    business_name: "Nile Sounds Band",
    category: "music",
    location: "Cairo, Egypt",
    rating: 4.6,
    verified: true,
  },
  {
    id: "5",
    business_name: "Luxor Decor Studio",
    category: "decoration",
    location: "Luxor, Egypt",
    rating: 4.5,
    verified: true,
  },
  {
    id: "6",
    business_name: "Pyramid Venues",
    category: "venue",
    location: "Giza, Egypt",
    rating: 4.9,
    verified: true,
  },
  {
    id: "7",
    business_name: "Desert Rose Makeup",
    category: "makeup",
    location: "Cairo, Egypt",
    rating: 4.8,
    verified: false,
  },
  {
    id: "8",
    business_name: "Pharaoh's Feast Catering",
    category: "catering",
    location: "Cairo, Egypt",
    rating: 4.7,
    verified: true,
  },
];

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

export default function VendorsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="border-b bg-muted/30 py-16">
          <div className="container mx-auto max-w-7xl px-4">
            <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
              Find Trusted Vendors
            </h1>
            <p className="mt-2 text-lg text-muted-foreground max-w-2xl">
              Connect with Egypt&apos;s finest event vendors. From catering to
              photography, find the perfect partners for your special day.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {categories.map((cat) => (
                <Badge
                  key={cat.value}
                  variant="secondary"
                  className="cursor-pointer px-4 py-2 text-sm hover:bg-primary hover:text-primary-foreground transition-colors"
                >
                  {cat.label}
                </Badge>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto max-w-7xl px-4 py-12">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {mockVendors.map((vendor) => (
              <Link key={vendor.id} href={`/vendors/${vendor.id}`}>
                <Card className="h-full hover:ring-2 hover:ring-primary/20 transition-all cursor-pointer">
                  <CardHeader className="flex flex-row items-start gap-4">
                    <Avatar className="h-12 w-12 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-gradient-to-br from-rose-100 to-amber-100 text-rose-700">
                        {getInitials(vendor.business_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-base truncate">
                          {vendor.business_name}
                        </CardTitle>
                        {vendor.verified && (
                          <span
                            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"
                            title="Verified"
                          >
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {formatCategory(vendor.category)}
                        </Badge>
                        <span className="text-muted-foreground">•</span>
                        <span>{vendor.location}</span>
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        ★ {vendor.rating}
                      </span>
                      {vendor.verified && (
                        <Badge variant="secondary" className="text-xs">
                          Verified
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
