"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
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

interface VenueDesignerProps {
  designId?: string;
}

function snapshotKey(doc: DesignDocument): string {
  return JSON.stringify({
    name: doc.name,
    eventType: doc.eventType,
    setting: doc.setting,
    size: doc.size,
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
  const serialize = useVenueDesignerStore((s) => s.serialize);
  const deserialize = useVenueDesignerStore((s) => s.deserialize);
  const reset = useVenueDesignerStore((s) => s.reset);
  const name = useVenueDesignerStore((s) => s.name);
  const setName = useVenueDesignerStore((s) => s.setName);

  const eventType = useVenueDesignerStore((s) => s.eventType);
  const setting = useVenueDesignerStore((s) => s.setting);
  const size = useVenueDesignerStore((s) => s.size);
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
        palette,
        references,
        styleNotes,
      }),
    [name, eventType, setting, size, palette, references, styleNotes]
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
          <p className="text-sm text-muted-foreground">Loading design...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-muted/30">
      <div className="sticky top-0 z-30 border-b bg-background/80 px-4 py-2 backdrop-blur-md">
        <div className="mx-auto max-w-5xl">
          <DesignerHeader
            name={name}
            onNameChange={setName}
            onSave={doSave}
            saving={saveMutation.isPending}
            saveStatus={saveStatus}
            designId={currentId}
          />
        </div>
      </div>

      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Design your event
          </h1>
          <p className="text-sm text-muted-foreground">
            Tell us the basics, pick a palette, and gather inspiration for each
            part of your venue. We&apos;ll bring it all together into a single
            photoreal render.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <EventBasicsCard />
          <PaletteCard />
        </div>

        <div className="space-y-1 pt-2">
          <h2 className="text-base font-medium">Inspiration</h2>
          <p className="text-sm text-muted-foreground">
            Add up to 3 reference photos per category. Pick from our curated
            gallery or upload your own.
          </p>
        </div>

        <div className="grid gap-5">
          {REFERENCE_CATEGORIES.map((cat) => (
            <ReferenceCategoryCard key={cat} category={cat} />
          ))}
        </div>

        <StyleNotesCard />

        <GenerateRenderPanel designId={currentId} />
      </div>
    </div>
  );
}
