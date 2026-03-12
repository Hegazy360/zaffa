"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { StarRating } from "./star-rating";

interface ReviewFormProps {
  plannerId: string;
}

export function ReviewForm({ plannerId }: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) return;

    setIsSubmitting(true);
    // TODO: Submit to API
    await new Promise((r) => setTimeout(r, 500));
    setIsSubmitting(false);
    setRating(0);
    setComment("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave a Review</CardTitle>
        <p className="text-sm text-muted-foreground">
          Share your experience to help others.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium block mb-2">
              Rating
            </label>
            <StarRating
              rating={rating}
              interactive
              onRate={setRating}
              size="lg"
            />
          </div>

          <div>
            <label htmlFor="comment" className="text-sm font-medium block mb-2">
              Comment
            </label>
            <Textarea
              id="comment"
              placeholder="Tell us about your experience..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
            />
          </div>

          <Button
            type="submit"
            disabled={rating === 0 || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? "Submitting..." : "Submit Review"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
