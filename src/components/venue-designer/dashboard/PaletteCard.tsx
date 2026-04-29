"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { PALETTE_PRESETS } from "@/data/palettes";
import { cn } from "@/lib/utils";

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function PaletteCard() {
  const palette = useVenueDesignerStore((s) => s.palette);
  const setPalette = useVenueDesignerStore((s) => s.setPalette);
  const [draft, setDraft] = useState("");

  const isPresetActive = (id: string) => palette.name === id;

  const addColor = () => {
    const value = draft.trim();
    if (!HEX_RE.test(value)) return;
    if (palette.colors.includes(value)) return;
    if (palette.colors.length >= 8) return;
    setPalette({
      name: undefined,
      colors: [...palette.colors, value],
    });
    setDraft("");
  };

  const removeColor = (idx: number) => {
    setPalette({
      name: undefined,
      colors: palette.colors.filter((_, i) => i !== idx),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Color palette</CardTitle>
        <CardDescription>
          Pick a starting palette or build your own. The AI will weave these
          colors through the final render.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Curated palettes
          </Label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {PALETTE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  setPalette({ name: preset.id, colors: preset.colors })
                }
                className={cn(
                  "rounded-lg border p-2.5 text-left transition-colors hover:bg-accent",
                  isPresetActive(preset.id)
                    ? "border-rose-400 bg-rose-50/60 ring-1 ring-rose-300"
                    : "border-input"
                )}
              >
                <div className="flex h-6 overflow-hidden rounded-md ring-1 ring-foreground/10">
                  {preset.colors.map((c) => (
                    <div
                      key={c}
                      className="h-full flex-1"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="mt-2 text-sm font-medium">{preset.name}</div>
                <div className="text-xs text-muted-foreground">
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Custom
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            {palette.colors.map((color, i) => (
              <div
                key={`${color}-${i}`}
                className="group relative flex items-center gap-1.5 rounded-full border bg-background py-1 pr-1 pl-1.5"
              >
                <span
                  className="size-5 rounded-full ring-1 ring-foreground/10"
                  style={{ backgroundColor: color }}
                />
                <span className="font-mono text-xs">{color}</span>
                <button
                  type="button"
                  onClick={() => removeColor(i)}
                  className="rounded-full p-0.5 text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground"
                  aria-label={`Remove ${color}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            {palette.colors.length === 0 && (
              <span className="text-xs text-muted-foreground">
                No colors yet. Pick a preset above or add custom hex values.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addColor();
                }
              }}
              placeholder="#A1B2C3"
              className="max-w-[160px] font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addColor}
              disabled={!HEX_RE.test(draft.trim()) || palette.colors.length >= 8}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Add color
            </Button>
            {palette.colors.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPalette({ colors: [] })}
                className="text-muted-foreground"
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
