import { cn } from "@/lib/utils";
import type { NamedColor, NamedPalette } from "@/types/posts";
import type { DesignPalette } from "@/types/venue-designer";

/**
 * Pure presentational palette row. Used by:
 *
 *  - The user-facing venue designer preset row
 *    (`src/components/venue-designer/dashboard/PaletteCard.tsx`).
 *  - The post-generator `PaletteSlide`
 *    (`src/components/admin/post-generator/slides/PaletteSlide.tsx`).
 *  - Anywhere else we need to display a palette consistently.
 *
 * Accepts either an unnamed `DesignPalette` (just hex strings — current
 * venue-designer shape) or a fully-`NamedPalette` (per-color names —
 * post-generator shape). The `layout` prop drives visual treatment.
 */
type PaletteInput = NamedPalette | DesignPalette | { colors: string[] };

export type PaletteSwatchRowLayout =
  /** Single row of equal-width color stripes with no gaps. The classic
   *  "preset card" treatment used by the venue-designer. */
  | "stripes"
  /** Pill-shaped chips with the hex shown in `font-mono`. */
  | "chips"
  /** Tall named-swatch tiles used by the carousel slide — each color
   *  shows the swatch + its human-readable name + hex underneath. Only
   *  meaningful when the palette includes per-color names. */
  | "named";

interface PaletteSwatchRowProps {
  palette: PaletteInput;
  layout?: PaletteSwatchRowLayout;
  /** Override per-row scale. `md` is the default. */
  scale?: "sm" | "md" | "lg" | "xl";
  /** Visible only on `chips` and `named`. */
  showHex?: boolean;
  className?: string;
}

function normalize(palette: PaletteInput): NamedColor[] {
  if (palette && "colors" in palette && Array.isArray(palette.colors)) {
    return (palette.colors as Array<string | NamedColor>).map((c) => {
      if (typeof c === "string") return { name: "", hex: c };
      return { name: c.name ?? "", hex: c.hex };
    });
  }
  return [];
}

const STRIPE_HEIGHT = {
  sm: "h-5",
  md: "h-6",
  lg: "h-10",
  xl: "h-16",
} as const;

const CHIP_SWATCH = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
  xl: "size-7",
} as const;

const NAMED_SWATCH = {
  sm: "size-12",
  md: "size-20",
  lg: "size-28",
  xl: "size-40",
} as const;

const NAMED_NAME_TEXT = {
  sm: "text-xs",
  md: "text-xs",
  lg: "text-sm",
  // 18px label + uppercase tracking reads cleanly at 1080px slide width;
  // anything smaller looks blurry once the carousel auto-scales on IG.
  xl: "text-[18px]",
} as const;

const NAMED_HEX_TEXT = {
  sm: "text-xs",
  md: "text-xs",
  lg: "text-xs",
  xl: "text-[14px]",
} as const;

export function PaletteSwatchRow({
  palette,
  layout = "stripes",
  scale = "md",
  showHex = true,
  className,
}: PaletteSwatchRowProps) {
  const colors = normalize(palette);
  if (colors.length === 0) return null;

  if (layout === "stripes") {
    return (
      <div
        className={cn(
          "flex overflow-hidden rounded-md ring-1 ring-foreground/10",
          STRIPE_HEIGHT[scale],
          className,
        )}
      >
        {colors.map((c, i) => (
          <div
            key={`${c.hex}-${i}`}
            className="h-full flex-1"
            style={{ backgroundColor: c.hex }}
            title={c.name || c.hex}
          />
        ))}
      </div>
    );
  }

  if (layout === "chips") {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)}>
        {colors.map((c, i) => (
          <div
            key={`${c.hex}-${i}`}
            className="inline-flex items-center gap-1.5 rounded-full border bg-background py-1 ps-1.5 pe-2.5"
          >
            <span
              className={cn(
                "rounded-full ring-1 ring-foreground/10",
                CHIP_SWATCH[scale],
              )}
              style={{ backgroundColor: c.hex }}
            />
            {showHex && (
              <span className="font-mono text-xs">{c.hex}</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // "named"
  return (
    <div
      className={cn(
        "grid grid-cols-5 gap-3",
        className,
      )}
    >
      {colors.map((c, i) => (
        <div key={`${c.hex}-${i}`} className="flex flex-col items-center text-center">
          <span
            className={cn(
              "rounded-full ring-1 ring-foreground/10 shadow-sm",
              NAMED_SWATCH[scale],
            )}
            style={{ backgroundColor: c.hex }}
          />
          {c.name && (
            <span
              className={cn(
                "mt-3 font-medium text-eyebrow text-stone-900",
                NAMED_NAME_TEXT[scale],
              )}
            >
              {c.name}
            </span>
          )}
          {showHex && (
            <span
              className={cn(
                "mt-1 font-mono text-muted-foreground",
                NAMED_HEX_TEXT[scale],
              )}
            >
              {c.hex}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
