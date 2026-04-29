"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";

export function StyleNotesCard() {
  const styleNotes = useVenueDesignerStore((s) => s.styleNotes ?? "");
  const setStyleNotes = useVenueDesignerStore((s) => s.setStyleNotes);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Style notes</CardTitle>
        <CardDescription>
          Anything else the AI should know? Mood, season, must-haves, things to
          avoid - keep it short and specific.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          value={styleNotes}
          onChange={(e) => setStyleNotes(e.target.value)}
          placeholder="e.g. Warm sunset lighting, lots of greenery and candles, no balloons, a long single dinner table at the center."
          className="min-h-24 resize-none"
          maxLength={2000}
        />
        <div className="mt-1 text-right text-xs text-muted-foreground">
          {styleNotes.length}/2000
        </div>
      </CardContent>
    </Card>
  );
}
