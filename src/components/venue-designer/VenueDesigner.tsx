"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { trpc } from "@/lib/trpc";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import {
  DEFAULT_DESIGN,
  REFERENCE_CATEGORIES,
  type DesignDocument,
  type DesignReferences,
  type EventType,
  type Setting,
  type Size,
} from "@/types/venue-designer";
import { DesignerHeader } from "./ui/DesignerHeader";
import { EventBasicsCard } from "./dashboard/EventBasicsCard";
import { PaletteCard } from "./dashboard/PaletteCard";
import { ReferenceCategoryCard } from "./dashboard/ReferenceCategoryCard";
import { StyleNotesCard } from "./dashboard/StyleNotesCard";
import { GenerateRenderPanel } from "./dashboard/GenerateRenderPanel";
import {
  DesignerStepper,
  StepHeading,
  StepNavFooter,
  STEP_IDS,
  useDesignerStep,
  type StepId,
} from "./dashboard/DesignerStepper";

interface VenueDesignerProps {
  designId?: string;
}

function snapshotKey(doc: DesignDocument): string {
  return JSON.stringify({
    name: doc.name,
    eventType: doc.eventType,
    setting: doc.setting,
    size: doc.size,
    guestCount: doc.guestCount ?? null,
    palette: doc.palette,
    references: doc.references,
    styleNotes: doc.styleNotes ?? "",
  });
}

function normalizeReferences(value: unknown): DesignReferences {
  const obj =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const result: DesignReferences = {
    overall_vibe: [],
    tables: [],
    flowers: [],
    lighting: [],
    venue_decor: [],
  };
  for (const cat of REFERENCE_CATEGORIES) {
    const arr = obj[cat];
    if (Array.isArray(arr)) {
      result[cat] = arr as DesignReferences[typeof cat];
    }
  }
  return result;
}

function normalizePalette(value: unknown): DesignDocument["palette"] {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    const colors = Array.isArray(obj.colors)
      ? (obj.colors.filter((c) => typeof c === "string") as string[])
      : [];
    const name = typeof obj.name === "string" ? obj.name : undefined;
    return { name, colors };
  }
  return { colors: [] };
}

export function VenueDesigner({ designId }: VenueDesignerProps) {
  const router = useRouter();
  const t = useTranslations("designer");
  const serialize = useVenueDesignerStore((s) => s.serialize);
  const deserialize = useVenueDesignerStore((s) => s.deserialize);
  const reset = useVenueDesignerStore((s) => s.reset);
  const name = useVenueDesignerStore((s) => s.name);
  const setName = useVenueDesignerStore((s) => s.setName);

  const eventType = useVenueDesignerStore((s) => s.eventType);
  const setting = useVenueDesignerStore((s) => s.setting);
  const size = useVenueDesignerStore((s) => s.size);
  const guestCount = useVenueDesignerStore((s) => s.guestCount);
  const palette = useVenueDesignerStore((s) => s.palette);
  const references = useVenueDesignerStore((s) => s.references);
  const styleNotes = useVenueDesignerStore((s) => s.styleNotes);

  const [currentId, setCurrentId] = useState<string | undefined>(designId);
  const [loaded, setLoaded] = useState<boolean>(!designId);
  const [lastSavedKey, setLastSavedKey] = useState<string>(() =>
    snapshotKey(DEFAULT_DESIGN)
  );
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!designId) {
      reset();
      setLastSavedKey(snapshotKey(DEFAULT_DESIGN));
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId]);

  const { data: existingDesign, isLoading } = trpc.venueDesigns.getById.useQuery(
    { id: designId! },
    { enabled: !!designId }
  );

  const saveMutation = trpc.venueDesigns.save.useMutation({
    onSuccess: (result) => {
      if (!currentId) {
        setCurrentId(result.id);
        router.replace(`/venue-designer/${result.id}`);
      }
      setLastSavedKey(snapshotKey(serialize()));
    },
  });

  useEffect(() => {
    if (!existingDesign || loaded) return;
    const doc: DesignDocument = {
      name: existingDesign.name,
      eventType: (existingDesign.event_type as EventType) ?? "wedding",
      setting: (existingDesign.setting as Setting) ?? "indoor",
      size: (existingDesign.size as Size) ?? "medium",
      guestCount: existingDesign.guest_count ?? null,
      palette: normalizePalette(existingDesign.palette),
      references: normalizeReferences(existingDesign.references),
      styleNotes: existingDesign.style_notes ?? "",
    };
    deserialize(doc);
    setLastSavedKey(snapshotKey(doc));
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingDesign, loaded]);

  const doSave = useCallback(() => {
    const doc = serialize();
    saveMutation.mutate({
      id: currentId,
      name: doc.name,
      event_type: doc.eventType,
      setting: doc.setting,
      size: doc.size,
      guest_count: doc.guestCount ?? null,
      palette: doc.palette,
      references: doc.references,
      style_notes: doc.styleNotes ?? null,
      thumbnail: null,
    });
  }, [currentId, serialize, saveMutation]);

  const currentKey = useMemo(
    () =>
      snapshotKey({
        name,
        eventType,
        setting,
        size,
        guestCount,
        palette,
        references,
        styleNotes,
      }),
    [name, eventType, setting, size, guestCount, palette, references, styleNotes]
  );

  const dirty = loaded && currentKey !== lastSavedKey;
  const saveStatus: "saved" | "saving" | "unsaved" = saveMutation.isPending
    ? "saving"
    : dirty
      ? "unsaved"
      : "saved";

  useEffect(() => {
    if (!dirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      doSave();
    }, 8000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [dirty, doSave]);

  if (designId && isLoading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
          <p className="text-sm text-muted-foreground">{t("loadingDesign")}</p>
        </div>
      </div>
    );
  }

  return (
    <DesignerLayout
      name={name}
      onNameChange={setName}
      onSave={doSave}
      saving={saveMutation.isPending}
      saveStatus={saveStatus}
      designId={currentId}
    />
  );
}

interface DesignerLayoutProps {
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  saving: boolean;
  saveStatus: "saved" | "saving" | "unsaved";
  designId?: string;
}

function DesignerLayout({
  name,
  onNameChange,
  onSave,
  saving,
  saveStatus,
  designId,
}: DesignerLayoutProps) {
  const { activeStep, goToStep } = useDesignerStep();
  const stepIndex = STEP_IDS.indexOf(activeStep);
  const reduceMotion = useReducedMotion();

  return (
    <div className="relative isolate min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background dark:from-rose-950/15">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 start-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-200/30 to-amber-200/20 blur-3xl dark:from-rose-900/15 dark:to-amber-900/10"
      />

      {/* Sticky compact header */}
      <div className="sticky top-0 z-30 border-b border-border/60 bg-background/70 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 py-2">
          <DesignerHeader
            name={name}
            onNameChange={onNameChange}
            onSave={onSave}
            saving={saving}
            saveStatus={saveStatus}
            designId={designId}
          />
        </div>
      </div>

      <DesignerStepper activeStep={activeStep} onStepChange={goToStep} />

      <motion.main
        key={activeStep}
        initial={reduceMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        id="step-body"
        className={cnStepBody}
      >
        <StepHeading
          step={activeStep}
          index={stepIndex}
          total={STEP_IDS.length}
        />

        <div className="mt-2">
          <StepBody step={activeStep} designId={designId} />
        </div>

        <StepNavFooter step={activeStep} onStepChange={goToStep} />
      </motion.main>
    </div>
  );
}

// Tailwind class string for the step body container. The selectors lightly
// override the default shadcn Card chrome so each step's card feels integrated
// with the editorial frame: softer corners, hairline ring, warm rose-tinted
// shadow, and a translucent backdrop that picks up the page gradient.
const cnStepBody = [
  "mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pb-24 sm:px-6",
  "[&_[data-slot=card]]:rounded-2xl",
  "[&_[data-slot=card]]:bg-card/85",
  "[&_[data-slot=card]]:backdrop-blur-sm",
  "[&_[data-slot=card]]:ring-foreground/[0.06]",
  "[&_[data-slot=card]]:shadow-[0_12px_40px_-18px_rgba(244,63,94,0.18)]",
  "[&_[data-slot=card]]:py-6",
  "[&_[data-slot=card-header]]:px-5",
  "sm:[&_[data-slot=card-header]]:px-7",
  "[&_[data-slot=card-content]]:px-5",
  "sm:[&_[data-slot=card-content]]:px-7",
].join(" ");

interface StepBodyProps {
  step: StepId;
  designId?: string;
}

function StepBody({ step, designId }: StepBodyProps) {
  switch (step) {
    case "basics":
      return <EventBasicsCard />;
    case "palette":
      return <PaletteCard />;
    case "vibe":
      return <ReferenceCategoryCard category="overall_vibe" />;
    case "tables":
      return <ReferenceCategoryCard category="tables" />;
    case "florals":
      return <ReferenceCategoryCard category="flowers" />;
    case "lighting":
      return <ReferenceCategoryCard category="lighting" />;
    case "decor":
      return <ReferenceCategoryCard category="venue_decor" />;
    case "notes":
      return <StyleNotesCard />;
    case "generate":
      return <GenerateRenderPanel designId={designId} />;
  }
}
