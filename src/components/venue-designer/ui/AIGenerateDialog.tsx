"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import type { DesignJSON, PlacedItem } from "@/types/venue-designer";

const EXAMPLE_PROMPTS = [
  "Classic wedding reception for 120 guests, round tables, blush pink and gold theme, stage with floral arch, candelabras on every table",
  "Intimate engagement dinner for 30 guests, rectangular tables, white and green theme, lots of candles and lanterns along the aisle",
  "Outdoor garden wedding for 80 guests, round tables, soft lavender and ivory theme, pergola over the dance floor, string lights overhead",
  "Elegant gala for 150 guests, round tables, black and gold theme, chandelier centerpieces, DJ booth near the dance floor, bar counter on the side",
  "Rustic boho wedding for 60 guests, rectangular tables, terracotta and sage green, flower wall backdrop, welcome sign at the entrance",
  "Luxurious engagement party for 50 guests, round tables, deep burgundy and gold, stage with kosha, balloon arches at the entrance, dessert table",
];

interface AIGenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AIGenerateDialog({ open, onOpenChange }: AIGenerateDialogProps) {
  const [prompt, setPrompt] = useState("");
  const venue = useVenueDesignerStore((s) => s.venue);
  const deserialize = useVenueDesignerStore((s) => s.deserialize);

  const mutation = trpc.ai.generateScene.useMutation({
    onSuccess: (data) => {
      const designJSON: DesignJSON = {
        venue: {
          width: (data.venue.width as number) ?? venue.width,
          length: (data.venue.length as number) ?? venue.length,
          height: (data.venue.height as number) ?? venue.height,
          floorType: (data.venue.floorType as DesignJSON["venue"]["floorType"]) ?? venue.floorType,
          floorColor: (data.venue.floorColor as string) ?? venue.floorColor,
          wallColor: (data.venue.wallColor as string) ?? venue.wallColor,
        },
        items: (data.items as unknown as PlacedItem[]).map((item) => ({
          id: item.id ?? "tmp",
          type: item.type,
          position: item.position,
          rotation: item.rotation ?? [0, 0, 0],
          scale: item.scale ?? [1, 1, 1],
          color: item.color,
          variant: item.variant,
        })),
      };
      deserialize(designJSON);
      onOpenChange(false);
      setPrompt("");
    },
  });

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    mutation.mutate({
      prompt: prompt.trim(),
      venueWidth: venue.width,
      venueLength: venue.length,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-rose-500" />
            Generate Scene with AI
          </DialogTitle>
          <DialogDescription>
            Describe your event and the AI will arrange tables, chairs, decor and
            more in your venue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            placeholder="e.g. Wedding reception for 120 guests, round tables, blush pink and gold theme, stage with floral arch, candelabras on tables, string lights overhead..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="min-h-24 resize-none"
            disabled={mutation.isPending}
          />

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">Try an example:</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLE_PROMPTS.map((ex, i) => (
                <button
                  key={i}
                  type="button"
                  className="text-left text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors line-clamp-1"
                  onClick={() => setPrompt(ex)}
                  disabled={mutation.isPending}
                >
                  {ex.slice(0, 60)}...
                </button>
              ))}
            </div>
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive">
              {mutation.error.message || "Something went wrong. Please try again."}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || mutation.isPending}
            className="gap-2 bg-rose-500 hover:bg-rose-600 text-white"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
