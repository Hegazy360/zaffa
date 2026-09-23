import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CompareSlider } from "@/components/ui/compare-slider";

// The before/after slider (F1) is a keyboard control first: the homepage,
// the render panel and the reveal page all hang their compare on it, and
// the Playwright spec only checks that ArrowRight moves it. These pin the
// whole contract: arrows by 5, Home/End, clamping, and the RTL mirror where
// the arrow follows the screen rather than the reading direction.

vi.mock("next/image", () => ({
  default: (props: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={props.src} alt={props.alt} />
  ),
}));

function renderSlider(dir: "ltr" | "rtl" = "ltr", initial?: number) {
  return render(
    <div dir={dir} style={{ direction: dir }}>
      <CompareSlider
        before={{ src: "/home/venue/hall-before.avif", alt: "before photo" }}
        after={{ src: "/home/venue/hall-after.avif", alt: "after photo" }}
        width={1600}
        height={900}
        sizes="hero"
        beforeLabel="Before"
        afterLabel="After"
        label="Compare"
        initial={initial}
      />
    </div>,
  );
}

function value(): number {
  return Number(screen.getByRole("slider").getAttribute("aria-valuenow"));
}

describe("CompareSlider", () => {
  it("starts in the middle with an accessible name and range", () => {
    renderSlider();
    const slider = screen.getByRole("slider", { name: "Compare" });
    expect(slider).toHaveAttribute("aria-valuemin", "0");
    expect(slider).toHaveAttribute("aria-valuemax", "100");
    expect(value()).toBe(50);
    expect(screen.getByText("Before")).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
    expect(screen.getByAltText("before photo")).toBeInTheDocument();
    expect(screen.getByAltText("after photo")).toBeInTheDocument();
  });

  it("steps 5% with the arrows and jumps with Home and End", () => {
    renderSlider();
    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(value()).toBe(55);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(value()).toBe(45);
    fireEvent.keyDown(slider, { key: "End" });
    expect(value()).toBe(100);
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(value()).toBe(100);
    fireEvent.keyDown(slider, { key: "Home" });
    expect(value()).toBe(0);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(value()).toBe(0);
  });

  it("in RTL the arrow follows the screen: right is toward inline-start", () => {
    renderSlider("rtl");
    const slider = screen.getByRole("slider");
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    expect(value()).toBe(45);
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    expect(value()).toBe(55);
  });

  it("clamps a start position outside 0 to 100", () => {
    renderSlider("ltr", 140);
    expect(value()).toBe(100);
  });

  it("ignores keys it does not own, so Tab still leaves the control", () => {
    renderSlider();
    const slider = screen.getByRole("slider");
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    slider.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(value()).toBe(50);
  });
});
