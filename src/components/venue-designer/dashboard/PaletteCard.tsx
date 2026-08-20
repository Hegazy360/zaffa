"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
import { PaletteSwatchRow } from "@/components/design-system/PaletteSwatchRow";
import { cn } from "@/lib/utils";

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function PaletteCard() {
  const t = useTranslations("designer");
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
        <CardTitle>{t("stepPaletteTitle")}</CardTitle>
        <CardDescription>{t("paletteDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("curatedPalettesLabel")}
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
                  "rounded-lg border p-2.5 text-start transition-colors hover:bg-accent",
                  isPresetActive(preset.id)
                    ? "border-rose-400 bg-rose-50/60 ring-1 ring-rose-300"
                    : "border-input"
                )}
              >
                <PaletteSwatchRow
                  palette={{ colors: preset.colors }}
                  layout="stripes"
                />
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
            {t("customLabel")}
          </Label>
          <div className="flex flex-wrap items-center gap-2">
            {palette.colors.map((color, i) => (
              <div
                key={`${color}-${i}`}
                className="group relative flex items-center gap-1.5 rounded-full border bg-background py-1 pe-1 ps-1.5"
              >
                <span
                  className="size-5 rounded-full ring-1 ring-foreground/10"
                  style={{ backgroundColor: color }}
                />
                <span className="font-mono text-xs">{color}</span>
                {/*
                  Bumped to a 28px hit target so the X is comfortable
                  on touch, the previous 0.5 padding around a 12px
                  icon landed under 20px effective hit area.
                */}
                <button
                  type="button"
                  onClick={() => removeColor(i)}
                  className="grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t("removeColorAria", { color })}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {palette.colors.length === 0 && (
              <span className="text-xs text-muted-foreground">
                {t("noColorsYet")}
              </span>
            )}
          </div>
          {/*
            Custom-hex row. On phones the input stretches to full width
            and the Add/Clear pair drops to its own row; otherwise the
            three controls line up inline like before.
          */}
          <div className="flex flex-wrap items-center gap-2">
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
              className="h-11 w-full font-mono sm:h-9 sm:max-w-[160px]"
            />
            <div className="flex flex-1 items-center gap-2 sm:flex-none">
              <Button
                type="button"
                variant="outline"
                onClick={addColor}
                disabled={!HEX_RE.test(draft.trim()) || palette.colors.length >= 8}
                className="h-10 flex-1 gap-1.5 sm:h-9 sm:flex-none"
              >
                <Plus className="size-4" />
                {t("addColor")}
              </Button>
              {palette.colors.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setPalette({ colors: [] })}
                  className="h-10 text-muted-foreground sm:h-9"
                >
                  {t("clearColors")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
