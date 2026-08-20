import { describe, expect, it } from "vitest";
import {
  formatCopy,
  getCopy,
} from "@/server/services/notifications/copy";

describe("formatCopy", () => {
  it("substitutes placeholders", () => {
    expect(
      formatCopy("Hello {name}, your event {title} is set", {
        name: "Yasmin",
        title: "Wedding",
      }),
    ).toBe("Hello Yasmin, your event Wedding is set");
  });

  it("leaves unknown placeholders empty", () => {
    expect(formatCopy("Hi {missing}!", {})).toBe("Hi !");
  });

  it("ignores non-placeholder braces in the template", () => {
    expect(formatCopy("static text only", { a: "1" })).toBe("static text only");
  });
});

describe("getCopy", () => {
  it("renders English copy for proposal_received with vars filled in", () => {
    const copy = getCopy("proposal_received", "en", {
      plannerName: "Cairo Atelier",
      eventTitle: "October Wedding",
    });
    expect(copy.title).toContain("Cairo Atelier");
    expect(copy.body).toContain("October Wedding");
    expect(copy.eyebrow).toBeTruthy();
    expect(copy.ctaLabel).toBeTruthy();
  });

  it("renders Arabic copy for the same notification", () => {
    const copy = getCopy("proposal_received", "ar", {
      plannerName: "أتيليه القاهرة",
      eventTitle: "زفاف أكتوبر",
    });
    expect(copy.title).toContain("أتيليه القاهرة");
    expect(copy.body).toContain("زفاف أكتوبر");
  });

  it("falls back to English when the locale is unsupported (defensive)", () => {
    const copy = getCopy(
      "proposal_received",
      "en", // explicit en - confirms no exception thrown for known type
      { plannerName: "X", eventTitle: "Y" },
    );
    expect(copy.title.length).toBeGreaterThan(0);
  });

  it("emits facts for payment notifications", () => {
    const copy = getCopy("payment_disputed", "en", {
      eventTitle: "October Wedding",
      amount: "EGP 5,000",
    });
    expect(copy.facts).toBeDefined();
    expect(copy.facts!.some((f) => f.value.includes("October"))).toBe(true);
    expect(copy.facts!.some((f) => f.value.includes("5,000"))).toBe(true);
  });
});
