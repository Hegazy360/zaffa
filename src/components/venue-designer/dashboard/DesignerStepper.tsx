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
import { useTranslations } from "next-intl";
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
  icon: LucideIcon;
  labelKey: "stepBasicsLabel" | "stepPaletteLabel" | "stepVibeLabel" | "stepTablesLabel" | "stepFloralsLabel" | "stepLightingLabel" | "stepDecorLabel" | "stepNotesLabel" | "stepGenerateLabel";
  hintKey: "stepBasicsHint" | "stepPaletteHint" | "stepVibeHint" | "stepTablesHint" | "stepFloralsHint" | "stepLightingHint" | "stepDecorHint" | "stepNotesHint" | "stepGenerateHint";
  titleKey: "stepBasicsTitle" | "stepPaletteTitle" | "stepVibeTitle" | "stepTablesTitle" | "stepFloralsTitle" | "stepLightingTitle" | "stepDecorTitle" | "stepNotesTitle" | "stepGenerateTitle";
  subtitleKey: "stepBasicsSubtitle" | "stepPaletteSubtitle" | "stepVibeSubtitle" | "stepTablesSubtitle" | "stepFloralsSubtitle" | "stepLightingSubtitle" | "stepDecorSubtitle" | "stepNotesSubtitle" | "stepGenerateSubtitle";
}

const STEPS: StepDef[] = [
  { id: "basics", icon: Settings, labelKey: "stepBasicsLabel", hintKey: "stepBasicsHint", titleKey: "stepBasicsTitle", subtitleKey: "stepBasicsSubtitle" },
  { id: "palette", icon: Palette, labelKey: "stepPaletteLabel", hintKey: "stepPaletteHint", titleKey: "stepPaletteTitle", subtitleKey: "stepPaletteSubtitle" },
  { id: "vibe", icon: Sparkles, labelKey: "stepVibeLabel", hintKey: "stepVibeHint", titleKey: "stepVibeTitle", subtitleKey: "stepVibeSubtitle" },
  { id: "tables", icon: Utensils, labelKey: "stepTablesLabel", hintKey: "stepTablesHint", titleKey: "stepTablesTitle", subtitleKey: "stepTablesSubtitle" },
  { id: "florals", icon: Flower2, labelKey: "stepFloralsLabel", hintKey: "stepFloralsHint", titleKey: "stepFloralsTitle", subtitleKey: "stepFloralsSubtitle" },
  { id: "lighting", icon: Lamp, labelKey: "stepLightingLabel", hintKey: "stepLightingHint", titleKey: "stepLightingTitle", subtitleKey: "stepLightingSubtitle" },
  { id: "decor", icon: Frame, labelKey: "stepDecorLabel", hintKey: "stepDecorHint", titleKey: "stepDecorTitle", subtitleKey: "stepDecorSubtitle" },
  { id: "notes", icon: FileText, labelKey: "stepNotesLabel", hintKey: "stepNotesHint", titleKey: "stepNotesTitle", subtitleKey: "stepNotesSubtitle" },
  { id: "generate", icon: Wand2, labelKey: "stepGenerateLabel", hintKey: "stepGenerateHint", titleKey: "stepGenerateTitle", subtitleKey: "stepGenerateSubtitle" },
];

const STEP_INDEX_BY_ID: Record<StepId, number> = STEPS.reduce(
  (acc, step, i) => {
    acc[step.id] = i;
    return acc;
  },
  {} as Record<StepId, number>
);

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
  const t = useTranslations("designer");
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
      aria-label={t("designerStepsAria")}
      className="mx-auto w-full max-w-4xl px-4 pt-6 pb-6 sm:px-6 sm:pt-16 sm:pb-12"
    >
      {/* Mobile: compact progress bar instead of the dense dot rail. */}
      <div className="sm:hidden">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-rose-100/70 dark:bg-rose-950/40">
          <motion.div
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{
              duration: reduceMotion ? 0 : 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-r from-rose-400 via-rose-500 to-amber-500"
          />
        </div>
      </div>

      {/* Desktop: original dot rail with progress line under it. */}
      <div className="relative hidden sm:block">
        {/* Track + progress fill: anchored 20px from each side so the line
            visually starts/ends at the centers of the first and last circles. */}
        <div
          aria-hidden
          className="pointer-events-none absolute top-5 end-5 start-5 h-px"
        >
          <div className="h-px w-full bg-border" />
          <motion.div
            initial={false}
            animate={{ width: `${progressPct}%` }}
            transition={{
              duration: reduceMotion ? 0 : 0.5,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="absolute inset-y-0 start-0 h-px bg-gradient-to-r from-rose-300 via-rose-500 to-amber-500"
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
                  title={t(step.hintKey)}
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
                  {t(step.labelKey)}
                </span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Mobile-only active step caption */}
      <p className="mt-4 text-center sm:hidden">
        <span className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
          {t("stepIndicator", { n: activeIdx + 1, total: STEPS.length })}
        </span>
        <span className="mt-1 block font-display text-base text-foreground">
          {t(STEPS[activeIdx].titleKey)}
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
  const t = useTranslations("designer");
  const stepDef = STEPS.find((s) => s.id === step);
  const StepIcon = stepDef?.icon ?? Sparkles;

  return (
    <header className="space-y-4 text-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-rose-200/70 bg-rose-50/70 px-3.5 py-1 text-[11px] font-medium tracking-[0.18em] text-rose-700 uppercase backdrop-blur-sm dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
        <StepIcon className="size-3" />
        {t("stepIndicator", { n: index + 1, total })}
      </div>
      <h1 className="font-display text-balance text-3xl leading-tight font-light tracking-tight sm:text-4xl">
        {stepDef ? t(stepDef.titleKey) : ""}
      </h1>
      <p className="mx-auto max-w-xl text-pretty text-sm text-muted-foreground sm:text-base">
        {stepDef ? t(stepDef.subtitleKey) : ""}
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
  const t = useTranslations("designer");
  const idx = STEP_INDEX_BY_ID[step];
  const prev = idx > 0 ? STEP_IDS[idx - 1] : null;
  const next = idx < STEP_IDS.length - 1 ? STEP_IDS[idx + 1] : null;

  if (!prev && !next) return null;

  const prevTitle = prev
    ? t(STEPS[STEP_INDEX_BY_ID[prev]].titleKey)
    : t("stepBack");
  const nextTitle = next
    ? next === "generate"
      ? t("stepContinueGenerate")
      : t(STEPS[STEP_INDEX_BY_ID[next]].titleKey)
    : "";

  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-t border-border/60 pt-6">
      <Button
        type="button"
        variant="ghost"
        onClick={() => prev && onStepChange(prev)}
        disabled={!prev}
        className="gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-40"
      >
        <ChevronLeft className="size-4 rtl:-scale-x-100" />
        <span className="hidden sm:inline">{prevTitle}</span>
        <span className="sm:hidden">{t("stepBack")}</span>
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
          <span className="hidden sm:inline">{nextTitle}</span>
          <span className="sm:hidden">
            {next === "generate" ? t("stepGenerateShort") : t("stepNext")}
          </span>
          <ChevronRight className="size-4 rtl:-scale-x-100" />
        </Button>
      )}
    </div>
  );
}

export const DESIGNER_STEPS = STEPS;
