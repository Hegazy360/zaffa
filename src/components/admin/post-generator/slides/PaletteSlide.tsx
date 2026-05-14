import { Slide } from "./Slide";
import { cn } from "@/lib/utils";
import type { NamedColor, NamedPalette } from "@/types/posts";

export interface PaletteSlideProps {
  palette: NamedPalette;
  vibe: string;
}

type ColorRole = "DOMINANT" | "SUPPORTING" | "ACCENT";

/**
 * Editorial palette specimen — five color cards weighted by role.
 *
 * The LLM-named palette comes in as [dominant, supporting, supporting,
 * accent, accent] (system-prompt convention). We map that hierarchy
 * onto an asymmetric grid: one hero card (dominant) anchors the top
 * row, the second top-row card carries a supporting tone, and the
 * three smaller bottom-row cards round out the rest. Inside each card,
 * a small role chip sits top-left over the raw color, and a cream
 * info card pinned bottom-left holds the name + hex. The cream card
 * makes color-name readability work regardless of how light or dark
 * the swatch is — no need for luminance math against five very
 * different background colors.
 */
export function PaletteSlide({ palette, vibe }: PaletteSlideProps) {
  // Defensive: if for some reason fewer than 5 colors are stored, repeat
  // the last one so the layout still renders without empty cells.
  const colors = [...palette.colors];
  while (colors.length < 5) {
    colors.push(colors[colors.length - 1] ?? { name: "color", hex: "#E8DFD2" });
  }

  return (
    <Slide className="bg-[#FAF6EE]">
      {/* paper grain — subtle multiply pattern to give the slide depth */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.04] mix-blend-multiply"
        style={{
          backgroundImage:
            "radial-gradient(rgba(60,30,10,0.7) 1px, transparent 1px)",
          backgroundSize: "3px 3px",
        }}
      />
      {/* warm corner wash */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 0% 0%, rgba(255,240,220,0.5), transparent 55%)",
        }}
      />

      {/* Header */}
      <div className="absolute inset-x-0 top-0 px-16 pt-20">
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.4em] text-rose-700">
            PALETTE STUDY
          </p>
          <p className="text-[0.65rem] font-medium uppercase tracking-[0.32em] text-stone-500">
            ZAFFA.AI
          </p>
        </div>
        <h2 className="mt-5 font-display text-[68px] font-medium leading-[1.0] tracking-[-0.015em] text-stone-900">
          {palette.name}
        </h2>
        <p className="mt-3 font-display text-[22px] font-light italic tracking-wide text-stone-600">
          Five colors composed for {vibe}.
        </p>
        <div className="mt-6 h-px w-32 bg-rose-700/40" />
      </div>

      {/* Color grid: 1 hero + 1 medium up top, then 3 smaller below.
          Locked positions (absolute) so the cards always read the same
          proportions regardless of how long the palette name runs. */}
      <div
        className="absolute inset-x-12 grid grid-rows-[1.25fr_1fr] gap-4"
        style={{ top: 440, bottom: 130 }}
      >
        <div className="grid grid-cols-[1.55fr_1fr] gap-4">
          <ColorCard
            color={colors[0]}
            role="DOMINANT"
            featured
          />
          <ColorCard color={colors[1]} role="SUPPORTING" />
        </div>
        <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-4">
          <ColorCard color={colors[2]} role="SUPPORTING" />
          <ColorCard color={colors[3]} role="ACCENT" compact />
          <ColorCard color={colors[4]} role="ACCENT" compact />
        </div>
      </div>

      {/* Footer signature */}
      <div className="absolute inset-x-0 bottom-0 px-16 pb-12">
        <div className="flex items-center justify-between gap-6">
          <div className="h-px flex-1 bg-stone-300" />
          <p className="font-display text-[16px] font-light italic tracking-wide text-stone-500">
            Composed for editorial wedding photography.
          </p>
          <div className="h-px flex-1 bg-stone-300" />
        </div>
      </div>
    </Slide>
  );
}

interface ColorCardProps {
  color: NamedColor;
  role: ColorRole;
  /** Hero card — bumps the role chip + uses a slightly more dramatic info card. */
  featured?: boolean;
  /** Tighter padding for the small accent cards on the bottom row. */
  compact?: boolean;
}

/**
 * One palette specimen. Color fills the whole tile; a tiny role chip
 * floats top-left over the color, and a cream info card bottom-left
 * holds the name + hex with consistent contrast independent of the
 * swatch lightness.
 */
function ColorCard({ color, role, featured, compact }: ColorCardProps) {
  const light = isLightColor(color.hex);
  return (
    <div
      className="relative overflow-hidden rounded-2xl shadow-[0_12px_30px_-12px_rgba(0,0,0,0.18)] ring-1 ring-stone-900/[0.06]"
      style={{ backgroundColor: color.hex }}
    >
      {/* subtle sheen so flat swatches don't feel printed-flat */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(155deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0) 45%, rgba(0,0,0,0.06) 100%)",
        }}
      />

      {/* role chip */}
      <span
        className={cn(
          "absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-semibold uppercase tracking-[0.36em]",
          featured
            ? "text-[12px]"
            : compact
              ? "text-[10px]"
              : "text-[11px]",
          light
            ? "bg-stone-900/85 text-white"
            : "bg-white/90 text-stone-900",
        )}
      >
        <span
          className={cn(
            "size-1 rounded-full",
            light ? "bg-rose-300" : "bg-rose-600",
          )}
        />
        {role}
      </span>

      {/* info card pinned bottom-left */}
      <div
        className={cn(
          "absolute left-4 bottom-4 rounded-lg bg-[#FAF6EE]/95 shadow-md ring-1 ring-stone-900/[0.05] backdrop-blur-sm",
          compact ? "px-3 py-2" : "px-4 py-3",
        )}
      >
        <p
          className={cn(
            "font-display font-medium leading-tight tracking-tight text-stone-900",
            featured ? "text-[26px]" : compact ? "text-[18px]" : "text-[22px]",
          )}
        >
          {color.name}
        </p>
        <p
          className={cn(
            "mt-0.5 font-mono uppercase tracking-[0.18em] text-stone-500",
            featured ? "text-[13px]" : compact ? "text-[10px]" : "text-[11px]",
          )}
        >
          {color.hex}
        </p>
      </div>
    </div>
  );
}

/**
 * Cheap perceived-lightness check using the YIQ formula. Returns true
 * for colors light enough that a dark role chip reads better than a
 * white one. Threshold tuned by eye against the palette ranges the LLM
 * actually emits (no extreme neons in the wedding context).
 */
function isLightColor(hex: string): boolean {
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return true;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return true;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150;
}
