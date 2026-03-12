"use client";

import Image from "next/image";
import { Star, MapPin, BadgeCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PortfolioGallery } from "@/components/features/planners/portfolio-gallery";

interface Planner {
  id: string;
  business_name: string;
  bio?: string;
  location?: string;
  avg_rating: number;
  review_count: number;
  specialties: string[];
  verified: boolean;
  profiles: {
    full_name: string;
    avatar_url?: string;
  };
}

interface PortfolioItem {
  id: string;
  image_url: string;
  caption?: string;
  event_type?: string;
  style_tags: string[];
}

interface Review {
  id: string;
  author_name: string;
  rating: number;
  comment: string;
  created_at: string;
}

interface PlannerProfileClientProps {
  planner: Planner;
  portfolio: PortfolioItem[];
  reviews: Review[];
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-5 w-5 ${
            star <= Math.floor(rating)
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

export function PlannerProfileClient({
  planner,
  portfolio,
  reviews,
}: PlannerProfileClientProps) {
  const initials = getInitials(planner.profiles.full_name);

  return (
    <div className="container mx-auto max-w-7xl px-4 py-12 md:py-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-8 items-start md:items-center mb-16">
        <Avatar size="lg" className="h-24 w-24 md:h-32 md:w-32 shrink-0 ring-4 ring-rose-100 dark:ring-rose-900/50">
          <AvatarImage src={planner.profiles.avatar_url} alt={planner.profiles.full_name} />
          <AvatarFallback className="text-2xl md:text-3xl bg-gradient-to-br from-rose-100 to-amber-100 text-rose-700 dark:from-rose-900/50 dark:to-amber-900/50 dark:text-rose-300">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {planner.business_name}
            </h1>
            {planner.verified && (
              <Badge className="bg-rose-600 text-white gap-1">
                <BadgeCheck className="h-3.5 w-3.5" />
                Verified
              </Badge>
            )}
          </div>
          {planner.location && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              <span>{planner.location}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <StarRating rating={planner.avg_rating} />
              <span className="font-semibold">{planner.avg_rating.toFixed(1)}</span>
            </div>
            <span className="text-muted-foreground">
              ({planner.review_count} reviews)
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {planner.specialties.map((specialty) => (
              <Badge key={specialty} variant="secondary" className="text-sm">
                {specialty}
              </Badge>
            ))}
          </div>
          <Button
            size="lg"
            className="bg-gradient-to-r from-rose-600 to-amber-500 text-white hover:opacity-90"
          >
            Book This Planner
          </Button>
        </div>
      </div>

      {/* Bio */}
      {planner.bio && (
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-4">About</h2>
          <p className="text-muted-foreground text-lg leading-relaxed max-w-3xl">
            {planner.bio}
          </p>
        </section>
      )}

      {/* Portfolio */}
      <section className="mb-16">
        <h2 className="text-2xl font-semibold mb-6">Portfolio</h2>
        <PortfolioGallery items={portfolio} />
      </section>

      {/* Reviews */}
      <section>
        <h2 className="text-2xl font-semibold mb-6">Reviews</h2>
        <div className="space-y-6">
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{review.author_name}</span>
                  <div className="flex items-center gap-1">
                    <StarRating rating={review.rating} />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">{review.created_at}</p>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{review.comment}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
