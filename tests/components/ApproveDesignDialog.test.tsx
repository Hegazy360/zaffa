import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

// F5: the approval dialog every approve button opens. The tRPC hooks are
// faked so this pins what the dialog sends and what it shows after.

type ApproveVars = Record<string, unknown>;
type ApproveResult = { enquiryId: string | null; alreadyApproved: boolean; detailsAdded: boolean };

const state = vi.hoisted(() => ({
  profilePhone: null as string | null,
  calls: [] as ApproveVars[],
  result: null as null | { enquiryId: string | null; alreadyApproved: boolean; detailsAdded: boolean },
  fail: false,
  invalidated: [] as string[],
}));

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      venueDesigns: {
        list: { invalidate: () => state.invalidated.push("list") },
        getById: { invalidate: () => state.invalidated.push("getById") },
      },
      enquiries: { mine: { invalidate: () => state.invalidated.push("mine") } },
    }),
    profile: {
      me: { useQuery: () => ({ data: { phone: state.profilePhone } }) },
    },
    venueDesigns: {
      approve: {
        useMutation: (opts: {
          onSuccess?: (r: ApproveResult) => void;
          onError?: (e: Error) => void;
        }) => ({
          isPending: false,
          mutate: (vars: ApproveVars) => {
            state.calls.push(vars);
            if (state.fail) opts.onError?.(new Error("boom"));
            else opts.onSuccess?.(state.result!);
          },
        }),
      },
    },
  },
}));

const { ApproveDesignDialog, pickApproveMediaId } = await import(
  "@/components/venue-designer/ApproveDesignDialog"
);

const DESIGN_ID = "3f1c2b8e-1111-4222-8333-944455556666";
const MEDIA_ID = "7a7a7a7a-1111-4222-8333-944455556666";

function open(locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ar}>
      <ApproveDesignDialog
        open
        onOpenChange={() => {}}
        designId={DESIGN_ID}
        designName="Garden nikah"
        mediaId={MEDIA_ID}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.profilePhone = null;
  state.calls = [];
  state.fail = false;
  state.invalidated = [];
  state.result = { enquiryId: "abcdef12-0000-4000-8000-000000000000", alreadyApproved: false, detailsAdded: false };
});

describe("ApproveDesignDialog", () => {
  it("sends the details with the version on screen", () => {
    open();
    fireEvent.change(screen.getByLabelText("WhatsApp number"), {
      target: { value: "+20 101 234 5678" },
    });
    fireEvent.change(screen.getByLabelText("Wedding month"), { target: { value: "2026-10" } });
    fireEvent.change(screen.getByLabelText("City"), { target: { value: " Cairo " } });
    fireEvent.click(screen.getByRole("button", { name: "Send to our team" }));
    expect(state.calls).toEqual([
      {
        designId: DESIGN_ID,
        mediaId: MEDIA_ID,
        phone: "+20 101 234 5678",
        eventDate: "2026-10",
        city: "Cairo",
        // No cookie in the test, so no country guessed.
        country: undefined,
      },
    ]);
    expect(state.invalidated.sort()).toEqual(["getById", "list", "mine"]);
  });

  it("lets the couple send nothing but the approval", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Send to our team" }));
    expect(state.calls[0]).toMatchObject({
      designId: DESIGN_ID,
      phone: undefined,
      eventDate: undefined,
      city: undefined,
    });
  });

  it("offers the number already on the profile", () => {
    state.profilePhone = "+971501112222";
    open();
    expect(screen.getByLabelText("WhatsApp number")).toHaveValue("+971501112222");
  });

  it("stops a phone that is not a number, and says how to fix it", () => {
    open();
    const phone = screen.getByLabelText("WhatsApp number");
    fireEvent.change(phone, { target: { value: "call my mum" } });
    fireEvent.click(screen.getByRole("button", { name: "Send to our team" }));
    expect(state.calls).toHaveLength(0);
    expect(phone).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Add your country code/)).toBeInTheDocument();
  });

  it("shows what happens next and a WhatsApp chat that names the design", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Send to our team" }));
    expect(screen.getByText("Your design is with our team")).toBeInTheDocument();
    expect(screen.getByText("What happens next")).toBeInTheDocument();
    expect(screen.getByText(/We reply within 24 hours/)).toBeInTheDocument();
    // The Button primitive renders the anchor with role=button.
    const wa = screen.getByRole("button", { name: "Message us on WhatsApp now" });
    expect(wa.tagName).toBe("A");
    const href = decodeURIComponent(wa.getAttribute("href") ?? "");
    expect(href).toMatch(/^https:\/\/wa\.me\/33769999707\?text=/);
    expect(href).toContain("Garden nikah");
    expect(href).toContain("ABCDEF12");
  });

  it("says the team already had it when the design was approved before", () => {
    state.result = { enquiryId: null, alreadyApproved: true, detailsAdded: true };
    open();
    fireEvent.click(screen.getByRole("button", { name: "Send to our team" }));
    expect(screen.getByText(/We have added what you told us/)).toBeInTheDocument();
  });

  it("keeps the form and says so when sending fails", () => {
    state.fail = true;
    open();
    fireEvent.click(screen.getByRole("button", { name: "Send to our team" }));
    expect(screen.getByRole("alert")).toHaveTextContent("That did not go through");
    expect(screen.getByRole("button", { name: "Send to our team" })).toBeInTheDocument();
  });

  it("reads right to left in Arabic, with the number field left to right", () => {
    document.documentElement.dir = "rtl";
    open("ar");
    expect(screen.getByText("احصلوا على عرض سعر حقيقي لهذا التصميم")).toBeInTheDocument();
    expect(screen.getByLabelText("رقم واتساب")).toHaveAttribute("dir", "ltr");
    act(() => {
      document.documentElement.dir = "";
    });
  });
});

describe("pickApproveMediaId", () => {
  it("pins the version on screen when it belongs to the design, else the newest", () => {
    expect(pickApproveMediaId("b", ["a", "b"])).toBe("b");
    expect(pickApproveMediaId("elsewhere", ["a", "b"])).toBe("a");
    expect(pickApproveMediaId(null, ["a"])).toBe("a");
    expect(pickApproveMediaId(null, [])).toBeUndefined();
  });
});
