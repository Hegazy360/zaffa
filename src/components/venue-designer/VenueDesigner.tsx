"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useIsAnonymous } from "@/lib/use-is-anonymous";
import { isFreePack } from "@/lib/vision-pack";
import { EventBasicsCard } from "./dashboard/EventBasicsCard";
import { PaletteCard } from "./dashboard/PaletteCard";
import { ReferenceCategoryCard } from "./dashboard/ReferenceCategoryCard";
import { StyleNotesCard } from "./dashboard/StyleNotesCard";
import { GenerateRenderPanel } from "./dashboard/GenerateRenderPanel";
import { DecorPlanPanel } from "./dashboard/DecorPlanPanel";
import { ShareAndFinishPanel } from "@/components/vision-pack/share-and-finish-panel";
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
    venuePhoto: doc.venuePhoto ?? null,
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
  const venuePhoto = useVenueDesignerStore((s) => s.venuePhoto);

  const [currentId, setCurrentId] = useState<string | undefined>(designId);
  // Mirrors `currentId` for code that runs outside a render (a queued save
  // reads it when its turn comes, not when it was queued).
  const currentIdRef = useRef<string | undefined>(designId);
  const [loaded, setLoaded] = useState<boolean>(!designId);
  const [lastSavedKey, setLastSavedKey] = useState<string>(() =>
    snapshotKey(DEFAULT_DESIGN)
  );
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tail of the save queue, see `runSave`.
  const saveQueue = useRef<Promise<string> | null>(null);

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
      if (!currentIdRef.current) {
        currentIdRef.current = result.id;
        setCurrentId(result.id);
        // Update the URL to the new design's permalink in place. We use
        // `history.replaceState` rather than `router.replace` for two
        // reasons that both manifested as bugs:
        //   1) `router.replace(/venue-designer/<id>)` drops the
        //      `#step=...` hash, which `useDesignerStep` reads on every
        //      hashchange, so the autosave was silently jolting the
        //      user back to step 1.
        //   2) router.replace also unmounts `new/page.tsx` and mounts
        //      `[id]/page.tsx`, which fires `getById` and re-runs
        //      `deserialize(doc)`. Any edits the user made between the
        //      save firing and the new mount would be overwritten by
        //      the older just-saved snapshot. Staying on the same tree
        //      avoids the race entirely.
        // On full reload the [id] route picks up the URL correctly, so
        // there's no permalink regression.
        if (typeof window !== "undefined") {
          const url = `/venue-designer/${result.id}${window.location.hash}`;
          window.history.replaceState(null, "", url);
        }
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
      // Already parsed by `getById`; null when absent or unreadable.
      venuePhoto: existingDesign.venue_photo,
    };
    deserialize(doc);
    setLastSavedKey(snapshotKey(doc));
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingDesign, loaded]);

  // Every save goes through here: the 8s autosave, the header's Save, and
  // the flush before a render (`saveNow`). Saves run one at a time, each
  // queued behind the one in flight, because the first save of a new
  // design is a create: two creates racing (an autosave and a render
  // flush, say) would leave a duplicate design with the render attached
  // to the wrong one. The queued save reads the document and the id when
  // its turn comes, so it sends the latest edits as an update.
  // `mutateAsync` and `serialize` are stable, so an old closure is safe.
  const runSave = useCallback((): Promise<string> => {
    const send = async (): Promise<string> => {
      const doc = serialize();
      const saved = await saveMutation.mutateAsync({
        id: currentIdRef.current,
        name: doc.name,
        event_type: doc.eventType,
        setting: doc.setting,
        size: doc.size,
        guest_count: doc.guestCount ?? null,
        palette: doc.palette,
        references: doc.references,
        style_notes: doc.styleNotes ?? null,
        thumbnail: null,
        venue_photo: doc.venuePhoto,
      });
      return saved.id;
    };
    const queued = (saveQueue.current ?? Promise.resolve(""))
      .catch(() => "")
      .then(send);
    saveQueue.current = queued;
    return queued;
  }, [serialize, saveMutation]);

  const doSave = useCallback(() => {
    // The mutation's own state drives the header's save status, so a
    // failed autosave is visible there; nothing else to do with it here.
    runSave().catch(() => undefined);
  }, [runSave]);

  // Flush the design and resolve with its id, creating it on the first
  // save. The render panel calls this before `ai.renderScene` so the
  // server can write the render row onto the design itself: a render
  // requested before the first autosave landed used to come back with no
  // design to attach to, and was lost.
  const saveNow = useCallback((): Promise<string> => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = null;
    }
    return runSave();
  }, [runSave]);

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
        venuePhoto,
      }),
    [
      name,
      eventType,
      setting,
      size,
      guestCount,
      palette,
      references,
      styleNotes,
      venuePhoto,
    ]
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
      saveNow={saveNow}
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
  /** Flush the design save and resolve with its id (see `saveNow`). */
  saveNow: () => Promise<string>;
  saving: boolean;
  saveStatus: "saved" | "saving" | "unsaved";
  designId?: string;
}

function DesignerLayout({
  name,
  onNameChange,
  onSave,
  saveNow,
  saving,
  saveStatus,
  designId,
}: DesignerLayoutProps) {
  const { activeStep, goToStep } = useDesignerStep();
  const stepIndex = STEP_IDS.indexOf(activeStep);
  const reduceMotion = useReducedMotion();

  // Free-tier visitors (anonymous, or permanent on the free pack) get a
  // chrome-less designer - no header, no "My Designs" exit, no save
  // controls. The whole shell should feel like a one-shot try-out so
  // they aren't tempted to navigate away mid-flow. Treat
  // `useIsAnonymous() === null` (claims still resolving) as anonymous
  // to avoid a brief flash of the chrome on first paint.
  const anonClaim = useIsAnonymous();
  const isAnon = anonClaim !== false;
  const { data: currentPack } = trpc.visionPacks.current.useQuery(undefined, {
    enabled: !isAnon,
  });
  const onFreeTier = isAnon || !currentPack || isFreePack(currentPack.sku);

  return (
    <div className="relative isolate min-h-screen w-full overflow-x-hidden bg-gradient-to-b from-rose-50/50 via-background to-background">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 grain-bg opacity-50"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-rose-200/30 to-amber-200/20 blur-3xl"
      />

      {/* Sticky compact header, paid-pack chrome only. Free-tier
          users (anon or permanent on the free pack) see a chrome-less
          one-shot designer; the email gate + reveal page own their
          navigation surface, so the My-Designs / Save / Approve cluster
          isn't useful and would only tempt them off-flow. */}
      {!onFreeTier && (
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
      )}

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
          <StepBody step={activeStep} designId={designId} saveNow={saveNow} />
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
  saveNow: () => Promise<string>;
}

function StepBody({ step, designId, saveNow }: StepBodyProps) {
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
      return <GenerateStep designId={designId} saveNow={saveNow} />;
  }
}

/**
 * Last-step composite: the AI render panel sits on top, and the
 * share/lookbook/find-planner CTAs only appear once the couple has at
 * least one render, sharing an empty pack would just confuse recipients.
 *
 * `hasRender` is sourced from the same `venueDesigns.getById` query that
 * GenerateRenderPanel drives - react-query dedupes so the query is free,
 * and it auto-refetches when GenerateRenderPanel invalidates after a
 * successful render, so the share panel slides in the moment the first
 * render lands.
 */
function GenerateStep({
  designId,
  saveNow,
}: {
  designId?: string;
  saveNow: () => Promise<string>;
}) {
  const { data: design } = trpc.venueDesigns.getById.useQuery(
    { id: designId! },
    { enabled: !!designId },
  );
  // Newest first, as `getById` orders media.
  const renderIds = useMemo(
    () => (design?.media ?? []).filter((m) => m.type === "render").map((m) => m.id),
    [design?.media],
  );
  const hasRender = renderIds.length > 0;
  return (
    <div className="space-y-8">
      <GenerateRenderPanel designId={designId} saveNow={saveNow} />
      {/* F4: what it takes to build the version on screen. Flag-checked
          inside, and it hides itself on any error. */}
      {hasRender && designId ? (
        <DecorPlanPanel
          designId={designId}
          renderIds={renderIds}
          approved={Boolean(design?.approved_at)}
        />
      ) : null}
      {hasRender ? <ShareAndFinishPanel designId={designId} /> : null}
    </div>
  );
}
