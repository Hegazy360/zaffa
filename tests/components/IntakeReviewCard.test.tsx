import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";

// F3, "Here's what we'll create": the card above the render button. It asks
// the intake check on its own once the inputs settle, never twice for the
// same inputs, and never stands between the couple and the render (a
// failure makes it disappear). A setting conflict is fixed in one tap, a
// reference that looks like their empty venue becomes their venue photo in
// one tap, and the brief it hands the render is only ever the one read from
// the inputs on screen.
// tRPC, analytics, the stepper and images are mocked; translations are keys
// (with their values appended).

type CheckInput = Record<string, unknown> & { setting: string; locale?: string };

const h = vi.hoisted(() => ({
  check: vi.fn<(input: CheckInput) => Promise<unknown>>(),
  promote: vi.fn<(input: { url: string }) => Promise<unknown>>(),
  track: vi.fn(),
  goToStep: vi.fn(),
  flags: { current: {} as Record<string, boolean> },
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (k: string, values?: Record<string, unknown>) =>
    values ? `${k} ${JSON.stringify(values)}` : k,
  useLocale: () => "ar",
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    ai: { checkIntake: { useMutation: () => ({ mutateAsync: h.check }) } },
    venueDesigns: {
      promoteReferenceToVenue: { useMutation: () => ({ mutateAsync: h.promote }) },
    },
  },
}));
vi.mock("@/lib/analytics", () => ({ track: h.track }));
vi.mock("@/components/venue-designer/designer-flags-provider", () => ({
  useDesignerFlag: (key: string) => h.flags.current[key] ?? true,
}));
vi.mock("@/components/venue-designer/dashboard/DesignerStepper", () => ({
  useDesignerStep: () => ({ activeStep: "generate", goToStep: h.goToStep }),
}));
vi.mock("@/components/ui/media-image", () => ({
  MediaImage: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));

const { IntakeReviewCard } = await import(
  "@/components/venue-designer/dashboard/IntakeReviewCard"
);
const { forgetIntakeAnswers, INTAKE_DEBOUNCE_MS } = await import(
  "@/components/venue-designer/dashboard/intake-review"
);
const { useVenueDesignerStore } = await import("@/stores/venue-designer-store");

const LAWN = {
  id: "upload:zaffa-references/u1/lawn",
  url: "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-references/u1/lawn.jpg",
  source: "upload" as const,
};
const PIN = {
  id: "pinterest:9",
  url: "https://res.cloudinary.com/zaffa/image/upload/v1/zaffa-references/u1/pin.jpg",
  source: "pinterest" as const,
};

function answer(overrides: Record<string, unknown> = {}) {
  return {
    summary: "هنعملكم فرح في جنينة لـ 180 مدعو.",
    briefEn: "Secret garden, chandeliers hung in the trees.",
    conflicts: [],
    venueCandidateIndexes: [],
    notesSetting: "unclear",
    ...overrides,
  };
}

const SETTING_CONFLICT = {
  kind: "setting",
  message: "كلامكم عن جنينة، بس المكان داخلي.",
  suggestedSetting: "outdoor",
};

async function settle() {
  await act(async () => {
    vi.advanceTimersByTime(INTAKE_DEBOUNCE_MS);
  });
  // Let the resolved check land.
  await act(async () => {});
}

function renderCard() {
  const onBriefChange = vi.fn();
  const view = render(<IntakeReviewCard onBriefChange={onBriefChange} />);
  return { ...view, onBriefChange };
}

beforeEach(() => {
  vi.useFakeTimers();
  forgetIntakeAnswers();
  h.check.mockReset();
  h.promote.mockReset();
  h.track.mockReset();
  h.goToStep.mockReset();
  h.flags.current = {};
  const store = useVenueDesignerStore.getState();
  store.reset();
  store.setGuestCount(180);
  store.setStyleNotes("جنينة سرية ونجف متعلق في الشجر");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("asking the check", () => {
  it("waits for the inputs to settle, shows a skeleton meanwhile, then asks once", async () => {
    h.check.mockResolvedValue(answer());
    renderCard();
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "intake.checking");
    await act(async () => {
      vi.advanceTimersByTime(INTAKE_DEBOUNCE_MS - 1);
    });
    expect(h.check).not.toHaveBeenCalled();
    await settle();
    expect(h.check).toHaveBeenCalledTimes(1);
    expect(h.check.mock.calls[0][0]).toMatchObject({
      setting: "indoor",
      guestCount: 180,
      styleNotes: "جنينة سرية ونجف متعلق في الشجر",
      references: [],
      hasVenuePhoto: false,
      locale: "ar",
    });
    expect(document.querySelector("[data-intake-summary]")).toHaveTextContent(
      "هنعملكم فرح في جنينة",
    );
  });

  it("does not ask again for inputs it has already read", async () => {
    h.check.mockResolvedValue(answer());
    const first = renderCard();
    await settle();
    first.unmount();
    renderCard();
    await settle();
    expect(h.check).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-intake-summary]")).not.toBeNull();
  });

  it("asks nothing when there is nothing to read, or when it is switched off", async () => {
    useVenueDesignerStore.getState().setStyleNotes("");
    const empty = renderCard();
    await settle();
    expect(empty.container).toBeEmptyDOMElement();
    empty.unmount();

    useVenueDesignerStore.getState().setStyleNotes("garden");
    h.flags.current = { intakeCheck: false };
    const off = renderCard();
    await settle();
    expect(off.container).toBeEmptyDOMElement();
    expect(h.check).not.toHaveBeenCalled();
  });

  it("disappears quietly when the check fails, and hands the render no brief", async () => {
    h.check.mockRejectedValue(new Error("INTAKE_FAILED"));
    const { container, onBriefChange } = renderCard();
    await settle();
    expect(container).toBeEmptyDOMElement();
    expect(onBriefChange).not.toHaveBeenCalledWith(expect.any(String));
  });
});

describe("the brief it hands the render", () => {
  it("is the brief read from the inputs on screen, and nothing once they change", async () => {
    h.check.mockResolvedValueOnce(answer());
    const { onBriefChange } = renderCard();
    await settle();
    expect(onBriefChange).toHaveBeenLastCalledWith(
      "Secret garden, chandeliers hung in the trees.",
    );
    h.check.mockReturnValueOnce(new Promise(() => {}));
    act(() => useVenueDesignerStore.getState().setStyleNotes("قاعة كلاسيك"));
    expect(onBriefChange).toHaveBeenLastCalledWith(null);
  });
});

describe("a setting conflict", () => {
  it("switches the setting in one tap, says so, and reads the new inputs", async () => {
    h.check.mockResolvedValueOnce(answer({ conflicts: [SETTING_CONFLICT] }));
    renderCard();
    await settle();
    const conflict = document.querySelector('[data-intake-conflict="setting"]');
    expect(conflict).toHaveTextContent(SETTING_CONFLICT.message);

    h.check.mockResolvedValueOnce(answer({ summary: "جنينة مفتوحة." }));
    fireEvent.click(
      document.querySelector('[data-intake-fix-setting="outdoor"]') as HTMLElement,
    );
    expect(useVenueDesignerStore.getState().setting).toBe("outdoor");
    expect(document.querySelector("[data-intake-conflict]")).toBeNull();
    expect(document.querySelector("[data-intake-applied]")).toHaveTextContent(
      'intake.switched {"setting":"outdoor"}',
    );
    expect(h.track).toHaveBeenCalledWith("design.intake_fix_applied", {
      fix: "setting",
      from: "indoor",
      to: "outdoor",
    });

    await settle();
    expect(h.check).toHaveBeenCalledTimes(2);
    expect(h.check.mock.calls[1][0]).toMatchObject({ setting: "outdoor" });
    expect(document.querySelector("[data-intake-summary]")).toHaveTextContent("جنينة مفتوحة.");
  });

  it("words a conflict the server added itself", async () => {
    h.check.mockResolvedValueOnce(
      answer({ conflicts: [{ kind: "setting", message: null, suggestedSetting: "tent" }] }),
    );
    renderCard();
    await settle();
    expect(document.querySelector('[data-intake-conflict="setting"]')).toHaveTextContent(
      'intake.settingMismatch {"setting":"tent","current":"indoor"}',
    );
  });

  it("goes away on keep as is, and stays away", async () => {
    h.check.mockResolvedValue(answer({ conflicts: [SETTING_CONFLICT] }));
    renderCard();
    await settle();
    fireEvent.click(document.querySelector("[data-intake-keep]") as HTMLElement);
    expect(document.querySelector("[data-intake-conflict]")).toBeNull();
    expect(useVenueDesignerStore.getState().setting).toBe("indoor");
    expect(h.track).toHaveBeenCalledWith("design.intake_fix_applied", {
      fix: "kept",
      kind: "setting",
    });
    // A later read of changed notes that repeats it does not bring it back.
    act(() => useVenueDesignerStore.getState().setStyleNotes("جنينة، ورد أبيض"));
    await settle();
    expect(h.check).toHaveBeenCalledTimes(2);
    expect(document.querySelector("[data-intake-conflict]")).toBeNull();
  });
});

describe("a reference that looks like their empty venue", () => {
  it("is offered only for the couple's own upload, and becomes their venue photo in one tap", async () => {
    const store = useVenueDesignerStore.getState();
    store.addReference("overall_vibe", PIN);
    store.addReference("venue_decor", LAWN);
    h.check.mockResolvedValueOnce(answer({ venueCandidateIndexes: [0, 1] }));
    renderCard();
    await settle();
    const offers = document.querySelectorAll("[data-intake-venue-candidate]");
    expect(offers).toHaveLength(1);
    expect(offers[0]).toHaveAttribute("data-intake-venue-candidate", LAWN.id);

    const photo = {
      url: "https://res.cloudinary.com/zaffa/image/upload/v2/zaffa-venues/u1/lawn.jpg",
      publicId: "zaffa-venues/u1/lawn",
      width: 2048,
      height: 1536,
    };
    h.promote.mockResolvedValueOnce(photo);
    h.check.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      fireEvent.click(document.querySelector("[data-intake-use-venue]") as HTMLElement);
    });
    expect(h.promote).toHaveBeenCalledWith({ url: LAWN.url });
    const after = useVenueDesignerStore.getState();
    expect(after.venuePhoto).toEqual(photo);
    expect(after.references.venue_decor).toEqual([]);
    expect(after.references.overall_vibe).toEqual([PIN]);
    expect(document.querySelector("[data-intake-venue-candidate]")).toBeNull();
    expect(document.querySelector("[data-intake-applied]")).toHaveTextContent("intake.venueUsed");
    expect(h.track).toHaveBeenCalledWith("design.intake_fix_applied", { fix: "venue_photo" });
  });

  it("keeps the reference and says so when the copy fails", async () => {
    useVenueDesignerStore.getState().addReference("venue_decor", LAWN);
    h.check.mockResolvedValueOnce(answer({ venueCandidateIndexes: [0] }));
    renderCard();
    await settle();
    h.promote.mockRejectedValueOnce({ data: { code: "INTERNAL_SERVER_ERROR" } });
    await act(async () => {
      fireEvent.click(document.querySelector("[data-intake-use-venue]") as HTMLElement);
    });
    expect(screen.getByRole("alert")).toHaveTextContent("intake.venueFailed");
    expect(useVenueDesignerStore.getState().venuePhoto).toBeNull();
    expect(useVenueDesignerStore.getState().references.venue_decor).toEqual([LAWN]);
  });
});

describe("a missing guest count", () => {
  it("links back to the basics step", async () => {
    useVenueDesignerStore.getState().setGuestCount(null);
    h.check.mockResolvedValueOnce(answer());
    renderCard();
    await settle();
    const row = document.querySelector("[data-intake-guests-missing]") as HTMLElement;
    fireEvent.click(row.querySelector("button") as HTMLElement);
    expect(h.goToStep).toHaveBeenCalledWith("basics");
  });
});
