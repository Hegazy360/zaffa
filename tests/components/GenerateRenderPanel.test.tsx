import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { randomUUID } from "node:crypto";

// The render panel after F1 (your venue, dressed). A couple can render on
// their venue photo alone, which takes about a minute, so three things
// have to hold that did not matter before:
//  - a venue render never goes out without the design that carries the
//    photo (it would come back as an imagined hall and use up a render);
//  - a render whose response was lost in transit is looked for on the
//    design, not reported as failed and paid for again;
//  - the timing hint tells the truth about the minute.
// tRPC, the gate, Turnstile and images are mocked; translations are keys.

type RenderVars = { designId: string | null; references: unknown[] };
type Media = { id: string; type: string; url: string; parent_id: string | null; meta: unknown; created_at: string };
type RenderOpts = {
  onSuccess: (data: unknown, vars: RenderVars) => void;
  onError: (err: unknown, vars: RenderVars) => void;
};

const h = vi.hoisted(() => ({
  renderCalls: [] as RenderVars[],
  renderOpts: { current: null as null | RenderOpts },
  design: { current: undefined as undefined | { media: Media[] } },
  getByIdOptions: { current: null as null | { refetchInterval?: unknown } },
  invalidateDesign: vi.fn(),
  invalidatePack: vi.fn(),
  fetchDesign: vi.fn(),
  toastError: vi.fn(),
  isAnon: { current: false as boolean },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string) => k,
}));

vi.mock("sonner", () => ({ toast: { error: h.toastError, success: vi.fn() } }));

vi.mock("@/lib/trpc", () => {
  const idle = () => ({ mutate: vi.fn(), isPending: false, reset: vi.fn() });
  return {
    trpc: {
      useUtils: () => ({
        venueDesigns: {
          getById: { invalidate: h.invalidateDesign, fetch: h.fetchDesign },
        },
        visionPacks: { current: { invalidate: h.invalidatePack } },
        ai: { videoStatus: { fetch: vi.fn() } },
      }),
      venueDesigns: {
        getById: {
          useQuery: (_input: unknown, opts: { refetchInterval?: unknown }) => {
            h.getByIdOptions.current = opts;
            return { data: h.design.current };
          },
        },
        saveMedia: { useMutation: idle },
        deleteMedia: { useMutation: idle },
      },
      visionPacks: { current: { useQuery: () => ({ data: undefined }) } },
      ai: {
        renderScene: {
          useMutation: (opts: RenderOpts) => {
            h.renderOpts.current = opts;
            return {
              mutate: (vars: RenderVars) => h.renderCalls.push(vars),
              isPending: false,
              reset: vi.fn(),
            };
          },
        },
        startVideo: { useMutation: idle },
      },
    },
  };
});

vi.mock("@/lib/use-formatters", () => ({
  useFormatters: () => ({ relativeTime: () => "" }),
}));
vi.mock("@/lib/use-is-anonymous", () => ({ useIsAnonymous: () => h.isAnon.current }));
vi.mock("@/components/vision-pack/VisionPackPaywallProvider", () => ({
  usePackPaywall: () => ({ handleError: () => false }),
}));
vi.mock("@/components/venue-designer/dashboard/EmailGateOverlay", () => ({
  EmailGateOverlay: (props: { watermarkedImageUrl: string }) => (
    <div data-testid="email-gate" data-src={props.watermarkedImageUrl} />
  ),
}));
vi.mock("@/components/security/Turnstile", () => ({ Turnstile: () => null }));
vi.mock("@/components/ui/confirm", () => ({ useConfirm: () => async () => true }));
vi.mock("@/components/venue-designer/designer-flags-provider", () => ({
  useDesignerFlag: () => true,
}));
vi.mock("@/components/ui/media-image", () => ({
  MediaImage: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));
vi.mock("@/components/ui/compare-slider", () => ({
  CompareSlider: (props: { after: { src: string } }) => (
    <div data-testid="compare" data-after={props.after.src} />
  ),
}));

const { GenerateRenderPanel } = await import(
  "@/components/venue-designer/dashboard/GenerateRenderPanel"
);
const { useVenueDesignerStore } = await import("@/stores/venue-designer-store");

const DESIGN_ID = randomUUID();
const OLD_RENDER_ID = randomUUID();
const LANDED_RENDER_ID = randomUUID();
const LANDED_URL = "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-renders/landed.png";

function media(id: string, url: string): Media {
  return { id, type: "render", url, parent_id: null, meta: null, created_at: new Date().toISOString() };
}

function withVenuePhoto() {
  useVenueDesignerStore.getState().setVenuePhoto({
    url: "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-venues/u1/hall.jpg",
    publicId: "zaffa-venues/u1/hall",
    width: 1600,
    height: 900,
  });
}

function withReference() {
  useVenueDesignerStore.getState().addReference("flowers", {
    id: "ref-1",
    url: "https://res.cloudinary.com/zaffa/image/upload/v1/ref.jpg",
    source: "upload",
  });
}

function generateButton(): HTMLElement {
  return document.querySelector("[data-generate-render]") as HTMLElement;
}

async function pressGenerate() {
  await act(async () => {
    fireEvent.click(generateButton());
  });
}

// What a dropped connection or a suspended tab looks like to the client: a
// TRPCClientError with no tRPC error data.
const LOST_IN_TRANSIT = { message: "Failed to fetch", data: undefined };

beforeEach(() => {
  h.renderCalls.length = 0;
  h.renderOpts.current = null;
  h.design.current = { media: [media(OLD_RENDER_ID, "https://old.example/render.png")] };
  h.getByIdOptions.current = null;
  h.invalidateDesign.mockReset();
  h.invalidatePack.mockReset();
  h.fetchDesign.mockReset();
  h.toastError.mockReset();
  h.isAnon.current = false;
  useVenueDesignerStore.getState().reset();
});

describe("a venue render waits for the saved design", () => {
  it("does not render, and says so, when the save before it fails", async () => {
    withVenuePhoto();
    const saveNow = vi.fn(async (): Promise<string> => {
      throw new Error("timeout");
    });
    render(<GenerateRenderPanel designId={DESIGN_ID} saveNow={saveNow} />);
    await pressGenerate();
    expect(saveNow).toHaveBeenCalledTimes(1);
    expect(h.renderCalls).toHaveLength(0);
    expect(screen.getByRole("alert")).toHaveTextContent("venuePhoto.saveFailed");
  });

  it("renders with the design id once the save works", async () => {
    withVenuePhoto();
    render(<GenerateRenderPanel designId={DESIGN_ID} saveNow={async () => DESIGN_ID} />);
    await pressGenerate();
    expect(h.renderCalls).toHaveLength(1);
    expect(h.renderCalls[0]).toMatchObject({ designId: DESIGN_ID, references: [] });
  });

  it("still renders a design without a venue photo after a failed save", async () => {
    withReference();
    const saveNow = async (): Promise<string> => {
      throw new Error("timeout");
    };
    render(<GenerateRenderPanel designId={DESIGN_ID} saveNow={saveNow} />);
    await pressGenerate();
    expect(h.renderCalls).toHaveLength(1);
    expect(h.renderCalls[0].designId).toBeNull();
  });
});

describe("a render lost in transit", () => {
  async function loseRender() {
    const view = render(
      <GenerateRenderPanel designId={DESIGN_ID} saveNow={async () => DESIGN_ID} />,
    );
    await pressGenerate();
    expect(h.renderCalls).toHaveLength(1);
    act(() => {
      h.renderOpts.current!.onError(LOST_IN_TRANSIT, h.renderCalls[0]);
    });
    return view;
  }

  it("refetches the design and the pack, says the connection dropped and keeps watching", async () => {
    withVenuePhoto();
    await loseRender();
    expect(h.invalidateDesign).toHaveBeenCalledWith({ id: DESIGN_ID });
    expect(h.invalidatePack).toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("renderInterrupted");
    expect(h.getByIdOptions.current?.refetchInterval).toBe(10_000);
  });

  it("shows the render the server finished anyway, once the design brings it back", async () => {
    withVenuePhoto();
    const view = await loseRender();
    h.design.current = {
      media: [media(LANDED_RENDER_ID, LANDED_URL), ...h.design.current!.media],
    };
    view.rerender(
      <GenerateRenderPanel designId={DESIGN_ID} saveNow={async () => DESIGN_ID} />,
    );
    expect(screen.getByAltText("renderedAlt")).toHaveAttribute("src", LANDED_URL);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(useVenueDesignerStore.getState().activeRenderMediaId).toBe(LANDED_RENDER_ID);
    // Found: no more polling.
    expect(h.getByIdOptions.current?.refetchInterval).toBe(false);
  });

  it("puts an anonymous visitor's landed render behind the email gate", async () => {
    // An anonymous visitor with a render is already behind the gate; this
    // is their first.
    h.isAnon.current = true;
    h.design.current = { media: [] };
    withVenuePhoto();
    const view = await loseRender();
    h.design.current = { media: [media(LANDED_RENDER_ID, LANDED_URL)] };
    view.rerender(
      <GenerateRenderPanel designId={DESIGN_ID} saveNow={async () => DESIGN_ID} />,
    );
    expect(screen.getByTestId("email-gate")).toHaveAttribute("data-src", LANDED_URL);
  });

  it("looks for it before a retry pays for another render", async () => {
    withVenuePhoto();
    await loseRender();
    h.fetchDesign.mockResolvedValue({
      media: [media(LANDED_RENDER_ID, LANDED_URL), ...h.design.current!.media],
    });
    await pressGenerate();
    expect(h.fetchDesign).toHaveBeenCalledWith({ id: DESIGN_ID }, { staleTime: 0 });
    expect(h.renderCalls).toHaveLength(1);
    expect(screen.getByAltText("renderedAlt")).toHaveAttribute("src", LANDED_URL);
  });

  it("retries when nothing landed", async () => {
    withVenuePhoto();
    await loseRender();
    h.fetchDesign.mockResolvedValue(h.design.current);
    await pressGenerate();
    expect(h.renderCalls).toHaveLength(2);
  });

  it("does not treat an old render as the lost one", async () => {
    withVenuePhoto();
    const view = await loseRender();
    view.rerender(
      <GenerateRenderPanel designId={DESIGN_ID} saveNow={async () => DESIGN_ID} />,
    );
    expect(screen.queryByAltText("renderedAlt")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("renderInterrupted");
  });
});

describe("a render the server answered", () => {
  async function failWith(err: unknown) {
    withReference();
    render(<GenerateRenderPanel designId={DESIGN_ID} saveNow={async () => DESIGN_ID} />);
    await pressGenerate();
    act(() => {
      h.renderOpts.current!.onError(err, h.renderCalls[0]);
    });
  }

  it("refused (4xx): no refetch, no watch", async () => {
    await failWith({
      message: "Render limit reached.",
      data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 },
    });
    expect(h.invalidateDesign).not.toHaveBeenCalled();
    expect(h.getByIdOptions.current?.refetchInterval).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent("renderRateLimited");
  });

  it("faulted (5xx): one refetch, a plain failure, no watch", async () => {
    await failWith({
      message: "Image generation failed: 402",
      data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 },
    });
    expect(h.invalidateDesign).toHaveBeenCalledWith({ id: DESIGN_ID });
    expect(h.getByIdOptions.current?.refetchInterval).toBe(false);
    expect(screen.getByRole("alert")).toHaveTextContent("renderFailed");
  });

  it("had nothing to render from: asks for a reference", async () => {
    await failWith({
      message: "REFERENCES_REQUIRED",
      data: { code: "BAD_REQUEST", httpStatus: 400 },
    });
    expect(screen.getByRole("alert")).toHaveTextContent("needRefBeforeRender");
  });
});

describe("the timing hint", () => {
  it("says about a minute when the render dresses a venue photo", () => {
    withVenuePhoto();
    render(<GenerateRenderPanel designId={DESIGN_ID} />);
    expect(screen.getByText("venuePhoto.renderTimeHint")).toBeInTheDocument();
    expect(screen.queryByText("renderTimeHint")).toBeNull();
  });

  it("keeps the short hint for a render from mood references", () => {
    withReference();
    render(<GenerateRenderPanel designId={DESIGN_ID} />);
    expect(screen.getByText("renderTimeHint")).toBeInTheDocument();
  });
});
