"use client";

import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaletteOption {
  id: string;
  name: string;
  colors: string[];
}

interface PalettePickerProps {
  palettes: PaletteOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
}

export function PalettePicker({
  palettes,
  selectedId,
  onSelect,
  loading = false,
}: PalettePickerProps) {
  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-16"
      >
        <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
        <p className="mt-3 text-sm text-muted-foreground">
          AI is crafting palettes based on your vibe...
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
    >
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold tracking-tight">Color Palette</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          AI-suggested palettes inspired by your style preferences
        </p>
      </div>

      <div className="grid gap-4">
        {palettes.map((palette, i) => (
          <motion.button
            key={palette.id}
            type="button"
            onClick={() => onSelect(palette.id)}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1 }}
            className={cn(
              "group relative flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all",
              selectedId === palette.id
                ? "border-rose-500 bg-rose-50/50 shadow-md dark:bg-rose-950/20"
                : "border-muted hover:border-rose-300 hover:bg-muted/50"
            )}
          >
            <div className="flex gap-1 rounded-lg overflow-hidden shadow-inner">
              {palette.colors.map((color) => (
                <div
                  key={color}
                  className="h-12 w-10 first:rounded-l-lg last:rounded-r-lg"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>

            <div className="flex-1 min-w-0">
              <span className="text-sm font-semibold">{palette.name}</span>
              <div className="mt-1 flex gap-1.5 flex-wrap">
                {palette.colors.map((color) => (
                  <span
                    key={color}
                    className="text-[10px] font-mono text-muted-foreground"
                  >
                    {color}
                  </span>
                ))}
              </div>
            </div>

            {selectedId === palette.id && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white"
              >
                <Check className="h-4 w-4" />
              </motion.div>
            )}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
