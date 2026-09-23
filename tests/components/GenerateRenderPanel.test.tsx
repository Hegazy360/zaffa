import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { randomUUID } from "node:crypto";

// The render panel after F1 (your venue, dressed) and F2 (talk to your
// design). A couple can render on their venue photo alone, which takes
// about a minute, so three things have to hold that did not matter before:
//  - a venue render never goes out without the design that carries the
//    photo (it would come back as an imagined hall and use up a render);
//  - a render whose response was lost in transit is looked for on the
//    design, not reported as failed and paid for again;
//  - the timing hint tells the truth about the minute.
// And under a render the couple can type a change: the box sends it for the
// version on screen, a change that lands goes on screen and joins the
// version strip, and every refusal reads as the couple's words, never the
// server's. None of it is ever shown behind the email gate.
// tRPC, the gate, Turnstile and images are mocked; translations are keys
// (with their values appended, where they have any).

type RenderVars = { designId: string | null; references: unknown[] };
type Media = { id: string; type: string; url: string; parent_id: string | null; meta: unknown; created_at: string };
type RenderOpts = {
  onSuccess: (data: unknown, vars: RenderVars) => void;
  onError: (err: unknown, vars: RenderVars) => void;
};
type RefineVars = { mediaId: string; instruction: string; locale?: string };
type RefineOpts = {
  onSuccess: (data: unknown, vars: RefineVars) => void;
  onError: (err: unknown, vars: RefineVars) => void;
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
  refineCalls: [] as RefineVars[],
  refineOpts: { current: null as null | RefineOpts },
  pack: { current: undefined as undefined | { sku: string; edits_left: number } },
  flags: { current: {} as Record<string, boolean> },
  paywallHandle: vi.fn<(err: unknown) => boolean>(() => false),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, values?: Record<string, unknown>) =>
    values ? `${k} ${JSON.stringify(values)}` : k,
  useLocale: () => "en",
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
      visionPacks: { current: { useQuery: () => ({ data: h.pack.current }) } },
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
        refineRender: {
          useMutation: (opts: RefineOpts) => {
            h.refineOpts.current = opts;
            return {
              mutate: (vars: RefineVars) => h.refineCalls.push(vars),
              isPending: false,
              reset: vi.fn(),
            };
          },
        },
      },
    },
  };
});

vi.mock("@/lib/use-formatters", () => ({
  useFormatters: () => ({ relativeTime: () => "" }),
}));
vi.mock("@/lib/use-is-anonymous", () => ({ useIsAnonymous: () => h.isAnon.current }));
vi.mock("@/components/vision-pack/VisionPackPaywallProvider", () => ({
  usePackPaywall: () => ({ handleError: h.paywallHandle }),
}));
vi.mock("@/components/venue-designer/dashboard/EmailGateOverlay", () => ({
  EmailGateOverlay: (props: { watermarkedImageUrl: string }) => (
    <div data-testid="email-gate" data-src={props.watermarkedImageUrl} />
  ),
}));
vi.mock("@/components/security/Turnstile", () => ({ Turnstile: () => null }));
vi.mock("@/components/ui/confirm", () => ({ useConfirm: () => async () => true }));
vi.mock("@/components/venue-designer/designer-flags-provider", () => ({
  useDesignerFlag: (key: string) => h.flags.current[key] ?? true,
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
  h.refineCalls.length = 0;
  h.refineOpts.current = null;
  h.pack.current = undefined;
  h.flags.current = {};
  h.paywallHandle.mockReset();
  h.paywallHandle.mockReturnValue(false);
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

describe("talking to the render (F2)", () => {
  const CHANGE_ID = randomUUID();
  const NEW_ID = randomUUID();
  const OLD_URL = "https://old.example/render.png";
  const CHANGE_URL = "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-renders/change.png";
  const NEW_URL = "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-renders/new.png";

  function change(id: string, url: string, parent: string, instruction: string): Media {
    return {
      id,
      type: "render",
      url,
      parent_id: parent,
      meta: {
        mode: "refine",
        instructionRaw: instruction,
        confirmation: `Done: ${instruction}`,
        venuePublicId: null,
      },
      created_at: new Date(Date.now() + 1000).toISOString(),
    };
  }

  const selectLabel = (label: string) =>
    `versions.selectAria ${JSON.stringify({ label })}`;
  const input = () => document.querySelector("[data-refine-input]") as HTMLTextAreaElement;
  const sendButton = () => document.querySelector("[data-refine-send]") as HTMLButtonElement;
  const stripItems = () => Array.from(document.querySelectorAll("[data-version-id]"));

  /** A signed-in couple back on the generate step opens their render. */
  function openOriginal() {
    render(<GenerateRenderPanel designId={DESIGN_ID} saveNow={async () => DESIGN_ID} />);
    fireEvent.click(screen.getByRole("button", { name: selectLabel("versions.original") }));
  }

  it("lets a couple coming back open their render from the versions, then shows the box under it", () => {
    render(<GenerateRenderPanel designId={DESIGN_ID} saveNow={async () => DESIGN_ID} />);
    // The form view lists the render as a version...
    expect(stripItems()).toHaveLength(1);
    expect(document.querySelector("[data-refine-box]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: selectLabel("versions.original") }));
    // ...and opening it puts it on screen with the box under it.
    expect(screen.getByAltText("renderedAlt")).toHaveAttribute("src", OLD_URL);
    expect(document.querySelector("[data-refine-box]")).not.toBeNull();
    expect(useVenueDesignerStore.getState().activeRenderMediaId).toBe(OLD_RENDER_ID);
    // One version: no strip under the image yet.
    expect(stripItems()).toHaveLength(0);
  });

  it("fills the box from a suggestion, and sends it for the version on screen", async () => {
    openOriginal();
    fireEvent.click(screen.getByRole("button", { name: "refine.chipMoreFlowers" }));
    expect(input().value).toBe("refine.chipMoreFlowers");
    // Nothing is sent until the couple says so.
    expect(h.refineCalls).toHaveLength(0);
    await act(async () => {
      fireEvent.click(sendButton());
    });
    expect(h.refineCalls).toEqual([
      { mediaId: OLD_RENDER_ID, instruction: "refine.chipMoreFlowers", locale: "en" },
    ]);
  });

  it("sends on Enter, and not an empty box", async () => {
    openOriginal();
    expect(sendButton()).toBeDisabled();
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(h.refineCalls).toHaveLength(0);
    fireEvent.change(input(), { target: { value: "  عايزين ورد أبيض أكتر  " } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(h.refineCalls).toEqual([
      { mediaId: OLD_RENDER_ID, instruction: "عايزين ورد أبيض أكتر", locale: "en" },
    ]);
    expect(input()).toHaveAttribute("dir", "auto");
  });

  it("puts a change that landed on screen, in the strip, with its confirmation and what is left", () => {
    openOriginal();
    fireEvent.change(input(), { target: { value: "more candles" } });
    fireEvent.click(sendButton());
    act(() => {
      h.refineOpts.current!.onSuccess(
        {
          mediaId: NEW_ID,
          parentId: OLD_RENDER_ID,
          imageUrl: NEW_URL,
          confirmation: "Done: we added candles on every table.",
          editsLeft: 2,
        },
        h.refineCalls[0],
      );
    });
    expect(screen.getByAltText("renderedAlt")).toHaveAttribute("src", NEW_URL);
    expect(useVenueDesignerStore.getState().activeRenderMediaId).toBe(NEW_ID);
    // The strip now holds both, the new one on screen and captioned.
    expect(stripItems().map((el) => el.getAttribute("data-version-id"))).toEqual([
      OLD_RENDER_ID,
      NEW_ID,
    ]);
    const current = document.querySelector("[data-version-active]")!;
    expect(current.getAttribute("data-version-id")).toBe(NEW_ID);
    expect(current).toHaveTextContent('versions.change {"n":1}');
    expect(current).toHaveTextContent("more candles");
    expect(document.querySelector("[data-refine-confirmation]")).toHaveTextContent(
      "Done: we added candles on every table.",
    );
    expect(document.querySelector("[data-refine-edits-left]")).toHaveTextContent(
      'refine.editsLeft {"count":2}',
    );
    expect(input().value).toBe("");
    expect(h.invalidateDesign).toHaveBeenCalledWith({ id: DESIGN_ID });
    expect(h.invalidatePack).toHaveBeenCalled();
  });

  it("says Done when the confirmation did not come back", () => {
    openOriginal();
    fireEvent.change(input(), { target: { value: "more candles" } });
    fireEvent.click(sendButton());
    act(() => {
      h.refineOpts.current!.onSuccess(
        { mediaId: NEW_ID, parentId: OLD_RENDER_ID, imageUrl: NEW_URL, confirmation: null, editsLeft: 1 },
        h.refineCalls[0],
      );
    });
    expect(document.querySelector("[data-refine-confirmation]")).toHaveTextContent("refine.done");
  });

  it("applies the next change to whichever version is on screen", () => {
    h.design.current = {
      media: [change(CHANGE_ID, CHANGE_URL, OLD_RENDER_ID, "a dance floor"), media(OLD_RENDER_ID, OLD_URL)],
    };
    render(<GenerateRenderPanel designId={DESIGN_ID} saveNow={async () => DESIGN_ID} />);
    fireEvent.click(screen.getByRole("button", { name: selectLabel('versions.change {"n":1}') }));
    // The change's own confirmation comes back with it.
    expect(document.querySelector("[data-refine-confirmation]")).toHaveTextContent(
      "Done: a dance floor",
    );
    fireEvent.click(screen.getByRole("button", { name: selectLabel("versions.original") }));
    expect(screen.getByAltText("renderedAlt")).toHaveAttribute("src", OLD_URL);
    expect(document.querySelector("[data-refine-confirmation]")).toBeNull();
    fireEvent.change(input(), { target: { value: "gold chairs" } });
    fireEvent.click(sendButton());
    expect(h.refineCalls[0].mediaId).toBe(OLD_RENDER_ID);
  });

  it("answers a refused change in the couple's words and keeps what they typed", () => {
    openOriginal();
    fireEvent.change(input(), { target: { value: "add the bride" } });
    fireEvent.click(sendButton());
    act(() => {
      h.refineOpts.current!.onError(
        { message: "REFINE_REJECTED", data: { code: "BAD_REQUEST", httpStatus: 400 } },
        h.refineCalls[0],
      );
    });
    expect(screen.getByRole("alert")).toHaveTextContent("refine.rejected");
    expect(input().value).toBe("add the bride");
  });

  it("shows the email gate when the server asks for the email first", () => {
    openOriginal();
    fireEvent.change(input(), { target: { value: "more flowers" } });
    fireEvent.click(sendButton());
    act(() => {
      h.refineOpts.current!.onError(
        { message: "EMAIL_REQUIRED", data: { code: "FORBIDDEN", httpStatus: 403 } },
        h.refineCalls[0],
      );
    });
    expect(screen.getByTestId("email-gate")).toHaveAttribute("data-src", OLD_URL);
    expect(document.querySelector("[data-refine-box]")).toBeNull();
  });

  it("opens the paywall when the changes are used up", () => {
    h.paywallHandle.mockReturnValue(true);
    openOriginal();
    fireEvent.change(input(), { target: { value: "more flowers" } });
    fireEvent.click(sendButton());
    const err = { message: "PACK_QUOTA_EDITS", data: { code: "FORBIDDEN", httpStatus: 403 } };
    act(() => {
      h.refineOpts.current!.onError(err, h.refineCalls[0]);
    });
    expect(h.paywallHandle).toHaveBeenCalledWith(err);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it.each([
    [{ message: "Change limit reached.", data: { code: "TOO_MANY_REQUESTS", httpStatus: 429 } }, "renderRateLimited"],
    [{ message: "REFINE_FAILED", data: { code: "INTERNAL_SERVER_ERROR", httpStatus: 500 } }, "refine.failed"],
  ])("never shows the server's message: %j", (err, copy) => {
    openOriginal();
    fireEvent.change(input(), { target: { value: "more flowers" } });
    fireEvent.click(sendButton());
    act(() => {
      h.refineOpts.current!.onError(err, h.refineCalls[0]);
    });
    expect(screen.getByRole("alert")).toHaveTextContent(copy);
    expect(screen.getByRole("alert")).not.toHaveTextContent(err.message);
  });

  it("looks for a change whose answer was lost", () => {
    openOriginal();
    fireEvent.change(input(), { target: { value: "more flowers" } });
    fireEvent.click(sendButton());
    act(() => {
      h.refineOpts.current!.onError(LOST_IN_TRANSIT, h.refineCalls[0]);
    });
    expect(h.invalidateDesign).toHaveBeenCalledWith({ id: DESIGN_ID });
    expect(h.invalidatePack).toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("refine.interrupted");
  });

  it("counts changes out loud on the free tier only", () => {
    h.pack.current = { sku: "wedding_free_taste_v1", edits_left: 3 };
    const view = render(<GenerateRenderPanel designId={DESIGN_ID} saveNow={async () => DESIGN_ID} />);
    fireEvent.click(screen.getByRole("button", { name: selectLabel("versions.original") }));
    expect(document.querySelector("[data-refine-edits-left]")).toHaveTextContent(
      'refine.editsLeft {"count":3}',
    );
    view.unmount();

    h.pack.current = { sku: "wedding_design_pack_v1", edits_left: 50 };
    render(<GenerateRenderPanel designId={DESIGN_ID} saveNow={async () => DESIGN_ID} />);
    fireEvent.click(screen.getByRole("button", { name: selectLabel("versions.original") }));
    expect(document.querySelector("[data-refine-edits-left]")).toBeNull();
  });

  it("offers delete on a paid pack only", () => {
    const deleteLabel = `versions.deleteAria ${JSON.stringify({ label: "versions.original" })}`;
    h.pack.current = { sku: "wedding_free_taste_v1", edits_left: 3 };
    const view = render(<GenerateRenderPanel designId={DESIGN_ID} />);
    expect(screen.queryByRole("button", { name: deleteLabel })).toBeNull();
    view.unmount();

    h.pack.current = { sku: "wedding_design_pack_v1", edits_left: 50 };
    render(<GenerateRenderPanel designId={DESIGN_ID} />);
    expect(screen.getByRole("button", { name: deleteLabel })).toBeInTheDocument();
  });

  it("hides the box while the kill switch is off", () => {
    h.flags.current = { refineRender: false };
    openOriginal();
    expect(screen.getByAltText("renderedAlt")).toBeInTheDocument();
    expect(document.querySelector("[data-refine-box]")).toBeNull();
  });

  it("never shows the box or the versions to an anonymous visitor: the gate stands in front", () => {
    h.isAnon.current = true;
    h.design.current = {
      media: [change(CHANGE_ID, CHANGE_URL, OLD_RENDER_ID, "a dance floor"), media(OLD_RENDER_ID, OLD_URL)],
    };
    render(<GenerateRenderPanel designId={DESIGN_ID} />);
    expect(screen.getByTestId("email-gate")).toBeInTheDocument();
    expect(document.querySelector("[data-refine-box]")).toBeNull();
    expect(stripItems()).toHaveLength(0);
  });
});
