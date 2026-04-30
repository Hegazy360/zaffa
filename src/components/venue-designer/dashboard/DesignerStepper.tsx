"use client";

import { useMemo, useSyncExternalStore } from "react";
import {
  Settings,
  Palette,
  Sparkles,
  Utensils,
  Flower2,
  Lamp,
  Frame,
  FileText,
  Wand2,
  Check,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { cn } from "@/lib/utils";

export const STEP_IDS = [
  "basics",
  "palette",
  "vibe",
  "tables",
  "florals",
  "lighting",
  "decor",
  "notes",
  "generate",
] as const;

export type StepId = (typeof STEP_IDS)[number];

interface StepDef {
  id: StepId;
  label: string;
  icon: LucideIcon;
  hint?: string;
}

const STEPS: StepDef[] = [
  { id: "basics", label: "Basics", icon: Settings, hint: "Event type, setting, size" },
  { id: "palette", label: "Palette", icon: Palette, hint: "Colors that anchor the design" },
  { id: "vibe", label: "Vibe", icon: Sparkles, hint: "Overall mood references" },
  { id: "tables", label: "Tables", icon: Utensils, hint: "Tables & seating references" },
  { id: "florals", label: "Florals", icon: Flower2, hint: "Floral references" },
  { id: "lighting", label: "Lighting", icon: Lamp, hint: "Lighting references" },
  { id: "decor", label: "Decor", icon: Frame, hint: "Decor & structure references" },
  { id: "notes", label: "Notes", icon: FileText, hint: "Free-text style notes" },
  { id: "generate", label: "Generate", icon: Wand2, hint: "Render your venue" },
];

const STEP_INDEX_BY_ID: Record<StepId, number> = STEPS.reduce(
  (acc, step, i) => {
    acc[step.id] = i;
    return acc;
  },
  {} as Record<StepId, number>
);

const STEP_TITLE: Record<StepId, string> = {
  basics: "Event basics",
  palette: "Color palette",
  vibe: "Overall vibe & mood",
  tables: "Tables & seating",
  florals: "Florals",
  lighting: "Lighting",
  decor: "Decor & structure",
  notes: "Style notes",
  generate: "Generate your render",
};

const STEP_SUBTITLE: Record<StepId, string> = {
  basics:
    "Tell us what you're planning. These choices shape the entire render.",
  palette:
    "Pick a curated palette or build your own. The AI weaves these colors through linens, florals, and lighting.",
  vibe:
    "The big-picture feeling of your event — moodboards or whole venues that capture the energy you want.",
  tables:
    "Table styles, linens, place settings, and seating arrangements you love.",
  florals:
    "Centerpieces, arches, bouquets, hanging florals, and any greenery you want featured.",
  lighting:
    "Chandeliers, string lights, candles, uplighting — anything that sets the mood.",
  decor:
    "Backdrops, signage, dance floors, drapery, and structural pieces that frame the space.",
  notes:
    "Anything else worth telling the AI? Cultural details, must-haves, vibe words.",
  generate:
    "Review your selections and turn them into a single photoreal render — then bring it to life.",
};

function isValidStepId(value: string | null | undefined): value is StepId {
  return !!value && (STEP_IDS as readonly string[]).includes(value);
}

function readStepFromHash(): StepId | null {
  if (typeof window === "undefined") return null;
  const match = window.location.hash.match(/step=([a-z]+)/i);
  const candidate = match?.[1]?.toLowerCase();
  return isValidStepId(candidate) ? candidate : null;
}

function subscribeToHash(listener: () => void): () => void {
  window.addEventListener("hashchange", listener);
  window.addEventListener("popstate", listener);
  return () => {
    window.removeEventListener("hashchange", listener);
    window.removeEventListener("popstate", listener);
  };
}

function getStepSnapshot(): StepId {
  return readStepFromHash() ?? "basics";
}

function getServerStepSnapshot(): StepId {
  return "basics";
}

export function useDesignerStep(): {
  activeStep: StepId;
  goToStep: (step: StepId) => void;
} {
  const activeStep = useSyncExternalStore(
    subscribeToHash,
    getStepSnapshot,
    getServerStepSnapshot
  );

  const goToStep = (step: StepId) => {
    if (typeof window === "undefined") return;
    const url = `${window.location.pathname}${window.location.search}#step=${step}`;
    window.history.replaceState(null, "", url);
    // history.replaceState doesn't fire hashchange; dispatch one manually so
    // useSyncExternalStore subscribers re-read the snapshot.
    window.dispatchEvent(new Event("hashchange"));
  };

  return { activeStep, goToStep };
}

interface DesignerStepperProps {
  activeStep: StepId;
  onStepChange: (step: StepId) => void;
}

export function DesignerStepper({
  activeStep,
  onStepChange,
}: DesignerStepperProps) {
  const palette = useVenueDesignerStore((s) => s.palette);
  const references = useVenueDesignerStore((s) => s.references);
  const styleNotes = useVenueDesignerStore((s) => s.styleNotes);
  const reduceMotion = useReducedMotion();

  const completion: Record<StepId, boolean> = useMemo(
    () => ({
      basics: true,
      palette: palette.colors.length > 0,
      vibe: references.overall_vibe.length > 0,
      tables: references.tables.length > 0,
      florals: references.flowers.length > 0,
      lighting: references.lighting.length > 0,
      decor: references.venue_decor.length > 0,
      notes: !!styleNotes && styleNotes.trim().length > 0,
      generate: false,
    }),
    [palette, references, styleNotes]
  );

  const activeIdx = STEP_INDEX_BY_ID[activeStep];
  const progressPct =
    STEPS.length > 1 ? (activeIdx / (STEPS.length - 1)) * 100 : 0;

  return (
    <nav
      aria-label="Designer steps"
      className="mx-auto w-full max-w-4xl px-6 pt-12 pb-10 sm:pt-16 sm:pb-12"
    >
      <div className="relative">
        {/* Track + progress fill: anchored 20px from each side so the line
            visually starts/ends at the centers of the first and last circles. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-5 right-5 left-5 h-px"
        >
          <div className="h-px w-full bg-border" />
          <motion.div
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{
              duration: reduceMotion ? 0 : 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute inset-y-0 left-0 h-px bg-gradient-to-r from-rose-300 via-rose-500 to-amber-500"
          />
        </div>

        <ol className="relative flex justify-between">
          {STEPS.map((step, i) => {
            const isActive = step.id === activeStep;
            const isPastOrCurrent = i <= activeIdx;
            const isComplete = completion[step.id] && !isActive;
            const StepIcon = step.icon;

            return (
              <li key={step.id} className="flex flex-col items-center">
                <motion.button
                  type="button"
                  onClick={() => onStepChange(step.id)}
                  title={step.hint}
                  aria-current={isActive ? "step" : undefined}
                  whileHover={reduceMotion ? undefined : { scale: 1.06 }}
                  whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                  className={cn(
                    "relative grid size-10 place-items-center rounded-full border transition-colors duration-300",
                    "focus-visible:ring-2 focus-visible:ring-rose-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none",
                    isActive
                      ? "border-rose-500 bg-gradient-to-br from-rose-500 to-rose-600 text-white shadow-lg shadow-rose-500/30 ring-4 ring-rose-100 dark:ring-rose-950/60"
                      : isPastOrCurrent
                        ? "border-rose-300 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300"
                        : "border-border bg-background text-muted-foreground hover:border-rose-300 hover:text-rose-500"
                  )}
                >
                  {isComplete ? (
                    <Check className="size-4" strokeWidth={2.5} />
                  ) : (
                    <StepIcon className="size-[15px]" strokeWidth={2} />
                  )}
                </motion.button>
                <span
                  className={cn(
                    "mt-3 hidden font-display text-[11px] tracking-wide transition-colors sm:block",
                    isActive
                      ? "font-medium text-foreground"
                      : isPastOrCurrent
                        ? "text-rose-700 dark:text-rose-300"
                        : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Mobile-only active step caption */}
      <p className="mt-6 text-center sm:hidden">
        <span className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Step {activeIdx + 1} of {STEPS.length}
        </span>
        <span className="mt-1 block font-display text-base text-foreground">
          {STEP_TITLE[activeStep]}
        </span>
      </p>
    </nav>
  );
}

interface StepHeadingProps {
  step: StepId;
  index: number;
  total: number;
}

export function StepHeading({ step, index, total }: StepHeadingProps) {
  const StepIcon =
    STEPS.find((s) => s.id === step)?.icon ?? Sparkles;

  return (
    <header className="space-y-4 text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-[11px] font-medium tracking-[0.18em] text-rose-700 uppercase backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
        <StepIcon className="size-3" />
        Step {index + 1} of {total}
      </div>
      <h1 className="font-display text-balance text-3xl leading-tight font-light tracking-tight sm:text-4xl">
        {STEP_TITLE[step]}
      </h1>
      <p className="mx-auto max-w-xl text-pretty text-sm text-muted-foreground sm:text-base">
        {STEP_SUBTITLE[step]}
      </p>
      <div aria-hidden className="champagne-hairline mx-auto h-px w-32" />
    </header>
  );
}

interface StepNavFooterProps {
  step: StepId;
  onStepChange: (step: StepId) => void;
}

export function StepNavFooter({ step, onStepChange }: StepNavFooterProps) {
  const idx = STEP_INDEX_BY_ID[step];
  const prev = idx > 0 ? STEP_IDS[idx - 1] : null;
  const next = idx < STEP_IDS.length - 1 ? STEP_IDS[idx + 1] : null;

  if (!prev && !next) return null;

  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-6">
      <Button
        type="button"
        variant="ghost"
        onClick={() => prev && onStepChange(prev)}
        disabled={!prev}
        className="gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        <ChevronLeft className="size-4" />
        <span className="hidden sm:inline">{prev ? STEP_TITLE[prev] : "Back"}</span>
        <span className="sm:hidden">Back</span>
      </Button>
      {next && (
        <Button
          type="button"
          onClick={() => onStepChange(next)}
          size="lg"
          className={cn(
            "h-11 gap-2 px-5 text-sm",
            next === "generate"
              ? "bg-gradient-to-r from-rose-600 to-amber-500 text-white shadow-lg shadow-rose-500/20 hover:opacity-90 hover:shadow-rose-500/30"
              : "bg-foreground text-background hover:bg-foreground/90"
          )}
        >
          <span className="hidden sm:inline">
            {next === "generate" ? "Continue to Generate" : STEP_TITLE[next]}
          </span>
          <span className="sm:hidden">
            {next === "generate" ? "Generate" : "Next"}
          </span>
          <ChevronRight className="size-4" />
        </Button>
      )}
    </div>
  );
}

export const DESIGNER_STEPS = STEPS;
