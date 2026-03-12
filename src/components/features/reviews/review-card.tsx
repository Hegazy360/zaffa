import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StarRating } from "./star-rating";

interface ReviewCardProps {
  review: {
    id: string;
    rating: number;
    comment?: string;
    created_at: string;
    profiles: {
      full_name: string;
      avatar_url?: string;
    };
  };
}

export function ReviewCard({ review }: ReviewCardProps) {
  const initials = review.profiles.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex gap-3">
          <Avatar size="sm">
            <AvatarImage src={review.profiles.avatar_url} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="font-medium text-sm">
                {review.profiles.full_name}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(review.created_at).toLocaleDateString()}
              </p>
            </div>
            <StarRating rating={review.rating} size="sm" className="mt-1" />
            {review.comment && (
              <p className="text-sm text-muted-foreground mt-2">
                {review.comment}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
