import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { randomUUID } from "node:crypto";

// The render panel flushes the design save before every render so the
// server can attach the render to the design (F0). On a brand-new design
// that flush is a create, and it can race the 8s autosave or a second tap.
// Two creates would leave a duplicate design with the render on the wrong
// one, so saves are queued. These tests drive `saveNow` through the real
// VenueDesigner with the tRPC save mocked, and pin: one create, then
// updates that carry the new id, and the venue photo in the payload.

type SaveVars = { id?: string; venue_photo?: unknown } & Record<string, unknown>;

const { saveCalls, saveImpl, captured } = vi.hoisted(() => ({
  saveCalls: [] as SaveVars[],
  saveImpl: {
    current: null as null | ((vars: SaveVars) => Promise<{ id: string }>),
  },
  captured: { saveNow: null as null | (() => Promise<string>) },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

vi.mock("framer-motion", () => ({
  motion: { main: (props: Record<string, unknown>) => <main>{props.children as never}</main> },
  useReducedMotion: () => true,
}));

vi.mock("@/lib/use-is-anonymous", () => ({ useIsAnonymous: () => true }));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    venueDesigns: {
      getById: { useQuery: () => ({ data: undefined, isLoading: false }) },
      save: {
        // Mirrors react-query: the hook options' onSuccess runs before the
        // mutateAsync promise resolves.
        useMutation: (opts: { onSuccess?: (r: { id: string }) => void }) => ({
          isPending: false,
          mutateAsync: async (vars: SaveVars) => {
            saveCalls.push(vars);
            const res = await saveImpl.current!(vars);
            opts.onSuccess?.(res);
            return res;
          },
        }),
      },
    },
    visionPacks: { current: { useQuery: () => ({ data: undefined }) } },
  },
}));

vi.mock("@/components/venue-designer/dashboard/DesignerStepper", () => ({
  DesignerStepper: () => null,
  StepHeading: () => null,
  StepNavFooter: () => null,
  STEP_IDS: ["basics", "generate"],
  useDesignerStep: () => ({ activeStep: "generate", goToStep: () => {} }),
}));

vi.mock("@/components/venue-designer/dashboard/GenerateRenderPanel", () => ({
  GenerateRenderPanel: (props: { saveNow?: () => Promise<string> }) => {
    captured.saveNow = props.saveNow ?? null;
    return null;
  },
}));
vi.mock("@/components/vision-pack/share-and-finish-panel", () => ({
  ShareAndFinishPanel: () => null,
}));
vi.mock("@/components/venue-designer/ui/DesignerHeader", () => ({
  DesignerHeader: () => null,
}));
vi.mock("@/components/venue-designer/dashboard/EventBasicsCard", () => ({
  EventBasicsCard: () => null,
}));
vi.mock("@/components/venue-designer/dashboard/PaletteCard", () => ({
  PaletteCard: () => null,
}));
vi.mock("@/components/venue-designer/dashboard/ReferenceCategoryCard", () => ({
  ReferenceCategoryCard: () => null,
}));
vi.mock("@/components/venue-designer/dashboard/StyleNotesCard", () => ({
  StyleNotesCard: () => null,
}));

const { VenueDesigner } = await import("@/components/venue-designer/VenueDesigner");
const { useVenueDesignerStore } = await import("@/stores/venue-designer-store");

const NEW_ID = randomUUID();

beforeEach(() => {
  saveCalls.length = 0;
  captured.saveNow = null;
  useVenueDesignerStore.getState().reset();
  // Each save takes a tick, long enough for a second caller to arrive
  // while the first is in flight.
  saveImpl.current = async (vars) => {
    await new Promise((r) => setTimeout(r, 5));
    return { id: vars.id ?? NEW_ID };
  };
});

describe("VenueDesigner saveNow (flush before render)", () => {
  it("creates a new design once and resolves with its id", async () => {
    render(<VenueDesigner />);
    let id = "";
    await act(async () => {
      id = await captured.saveNow!();
    });
    expect(id).toBe(NEW_ID);
    expect(saveCalls).toHaveLength(1);
    expect(saveCalls[0].id).toBeUndefined();
  });

  it("queues a second flush behind the first, so it updates instead of creating again", async () => {
    render(<VenueDesigner />);
    let ids: string[] = [];
    await act(async () => {
      ids = await Promise.all([captured.saveNow!(), captured.saveNow!()]);
    });
    expect(ids).toEqual([NEW_ID, NEW_ID]);
    expect(saveCalls.map((c) => c.id)).toEqual([undefined, NEW_ID]);
  });

  it("recovers after a failed save: the next one still goes out", async () => {
    render(<VenueDesigner />);
    saveImpl.current = async () => {
      throw new Error("network");
    };
    await act(async () => {
      await expect(captured.saveNow!()).rejects.toThrow("network");
    });
    saveImpl.current = async (vars) => ({ id: vars.id ?? NEW_ID });
    let id = "";
    await act(async () => {
      id = await captured.saveNow!();
    });
    expect(id).toBe(NEW_ID);
  });

  it("sends the venue photo with the design", async () => {
    const photo = {
      url: "https://res.cloudinary.com/c/image/upload/v1/zaffa-venues/u/p.jpg",
      publicId: "zaffa-venues/u/p",
      width: 1600,
      height: 1200,
    };
    render(<VenueDesigner />);
    act(() => useVenueDesignerStore.getState().setVenuePhoto(photo));
    await act(async () => {
      await captured.saveNow!();
    });
    expect(saveCalls[0].venue_photo).toEqual(photo);
  });

  it("updates an existing design in place", async () => {
    const existing = randomUUID();
    render(<VenueDesigner designId={existing} />);
    await act(async () => {
      await captured.saveNow!();
    });
    expect(saveCalls[0].id).toBe(existing);
  });
});

describe("venue designer store session state", () => {
  it("never serializes the active render and clears it on reset and load", () => {
    const store = useVenueDesignerStore.getState();
    store.setActiveRenderMediaId("m1");
    expect(useVenueDesignerStore.getState().serialize()).not.toHaveProperty(
      "activeRenderMediaId",
    );
    store.reset();
    expect(useVenueDesignerStore.getState().activeRenderMediaId).toBeNull();
    store.setActiveRenderMediaId("m2");
    store.deserialize({ name: "Another design" });
    expect(useVenueDesignerStore.getState().activeRenderMediaId).toBeNull();
  });

  it("round-trips the venue photo through serialize and deserialize", () => {
    const photo = {
      url: "https://res.cloudinary.com/c/image/upload/v1/zaffa-venues/u/p.jpg",
      publicId: "zaffa-venues/u/p",
      width: 1600,
      height: 1200,
    };
    const store = useVenueDesignerStore.getState();
    store.setVenuePhoto(photo);
    const doc = useVenueDesignerStore.getState().serialize();
    expect(doc.venuePhoto).toEqual(photo);
    store.reset();
    expect(useVenueDesignerStore.getState().venuePhoto).toBeNull();
    store.deserialize(doc);
    expect(useVenueDesignerStore.getState().venuePhoto).toEqual(photo);
    store.deserialize({ name: "No photo yet" });
    expect(useVenueDesignerStore.getState().venuePhoto).toBeNull();
  });
});
