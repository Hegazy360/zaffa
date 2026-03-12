import Link from "next/link";
import { Star, MapPin } from "lucide-react";
import { Card, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BadgeCheck } from "lucide-react";

export interface PlannerCardData {
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

interface PlannerCardProps {
  planner: PlannerCardData;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function PlannerCard({ planner }: PlannerCardProps) {
  const initials = getInitials(planner.profiles.full_name);

  return (
    <Card className="overflow-hidden transition-all duration-300 hover:shadow-lg hover:ring-2 hover:ring-rose-200 dark:hover:ring-rose-800">
      <CardHeader className="flex flex-row items-start gap-4 pb-2">
        <Avatar size="lg" className="h-14 w-14 shrink-0">
          <AvatarImage src={planner.profiles.avatar_url} alt={planner.profiles.full_name} />
          <AvatarFallback className="bg-gradient-to-br from-rose-100 to-amber-100 text-rose-700 dark:from-rose-900/50 dark:to-amber-900/50 dark:text-rose-300">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-lg truncate">
              {planner.business_name}
            </h3>
            {planner.verified && (
              <BadgeCheck className="h-4 w-4 text-rose-600 shrink-0" />
            )}
          </div>
          {planner.location && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground mt-1">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{planner.location}</span>
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <div className="flex items-center gap-1">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              <span className="font-medium text-sm">
                {planner.avg_rating.toFixed(1)}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              ({planner.review_count} reviews)
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        {planner.bio && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {planner.bio}
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {planner.specialties.slice(0, 4).map((specialty) => (
            <Badge key={specialty} variant="secondary" className="text-xs">
              {specialty}
            </Badge>
          ))}
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <Button render={<Link href={`/planners/${planner.id}`} />} variant="outline" className="w-full" size="sm">
          View Profile
        </Button>
      </CardFooter>
    </Card>
  );
}
