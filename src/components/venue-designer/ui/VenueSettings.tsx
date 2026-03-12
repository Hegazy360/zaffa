"use client";
import { useState } from "react";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import type { FloorType } from "@/types/venue-designer";
import { Button } from "@/components/ui/button";
import { Settings2, X } from "lucide-react";
import { cn } from "@/lib/utils";

const FLOOR_OPTIONS: { type: FloorType; label: string; swatch: string }[] = [
  { type: "ceramic", label: "Ceramic", swatch: "#E8DDD0" },
  { type: "marble", label: "Marble", swatch: "#F0ECE3" },
  { type: "wood", label: "Wood", swatch: "#9E7B4F" },
  { type: "grass", label: "Grass", swatch: "#5A8C3E" },
  { type: "sand", label: "Sand", swatch: "#D4C4A0" },
  { type: "concrete", label: "Concrete", swatch: "#B8B4AC" },
  { type: "custom", label: "Custom", swatch: "" },
];

export function VenueSettings() {
  const venue = useVenueDesignerStore((s) => s.venue);
  const setVenue = useVenueDesignerStore((s) => s.setVenue);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 bg-background/90 backdrop-blur-sm"
        onClick={() => setOpen(true)}
      >
        <Settings2 className="h-3.5 w-3.5" />
        Venue Settings
      </Button>
    );
  }

  return (
    <div className="rounded-xl bg-background/90 backdrop-blur-sm border shadow-lg p-3 w-64 space-y-4 max-h-[80vh] overflow-y-auto">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold">Venue Settings</h4>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      {/* Dimensions */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Dimensions
        </p>
        {(["width", "length", "height"] as const).map((dim) => (
          <div key={dim} className="space-y-0.5">
            <label className="text-xs text-muted-foreground capitalize">
              {dim}: {venue[dim]}m
            </label>
            <input
              type="range"
              min={dim === "height" ? 3 : 5}
              max={dim === "height" ? 10 : 60}
              step={1}
              value={venue[dim]}
              onChange={(e) => setVenue({ [dim]: Number(e.target.value) })}
              className="w-full"
            />
          </div>
        ))}
      </div>

      {/* Floor Type */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Floor Type
        </p>
        <div className="grid grid-cols-4 gap-1.5">
          {FLOOR_OPTIONS.map((opt) => {
            const isActive = venue.floorType === opt.type;
            return (
              <button
                key={opt.type}
                onClick={() => setVenue({ floorType: opt.type })}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg p-1.5 text-center transition-all",
                  "border hover:border-foreground/30",
                  isActive
                    ? "border-rose-400 bg-rose-50 dark:bg-rose-900/20 dark:border-rose-600"
                    : "border-transparent"
                )}
              >
                {opt.type === "custom" ? (
                  <div className="h-6 w-6 rounded-full border-2 border-dashed border-muted-foreground/40 flex items-center justify-center">
                    <span className="text-[10px] text-muted-foreground">?</span>
                  </div>
                ) : (
                  <div
                    className="h-6 w-6 rounded-full border border-foreground/10"
                    style={{ backgroundColor: opt.swatch }}
                  />
                )}
                <span className="text-[10px] leading-tight">{opt.label}</span>
              </button>
            );
          })}
        </div>

        {venue.floorType === "custom" && (
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Floor Color</label>
            <input
              type="color"
              value={venue.floorColor}
              onChange={(e) => setVenue({ floorColor: e.target.value })}
              className="h-8 w-full cursor-pointer rounded border"
            />
          </div>
        )}
      </div>

      {/* Wall Color */}
      <div className="space-y-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Wall Color
        </p>
        <input
          type="color"
          value={venue.wallColor}
          onChange={(e) => setVenue({ wallColor: e.target.value })}
          className="h-8 w-full cursor-pointer rounded border"
        />
      </div>
    </div>
  );
}
