import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import en from "../../messages/en.json";
import ar from "../../messages/ar.json";
import { EmailSuggestion } from "@/components/ui/email-suggestion";

function Field({ initial }: { initial: string }) {
  const [email, setEmail] = useState(initial);
  return (
    <>
      <input aria-label="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <EmailSuggestion email={email} onApply={setEmail} />
    </>
  );
}

function renderField(initial: string, locale: "en" | "ar" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : ar}>
      <Field initial={initial} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("EmailSuggestion", () => {
  it("offers the fix for the real case and applies it on tap", () => {
    renderField("name@2008gmail.com");
    const fix = screen.getByRole("button", { name: "Use name2008@gmail.com" });
    expect(screen.getByRole("status")).toHaveTextContent("Did you mean name2008@gmail.com?");
    fireEvent.click(fix);
    expect(screen.getByLabelText("email")).toHaveValue("name2008@gmail.com");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("says nothing for an address that looks right", () => {
    renderField("noor@gmail.com");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("waits for typing to pause before second-guessing", () => {
    renderField("noor@gmail.com");
    const input = screen.getByLabelText("email");
    fireEvent.change(input, { target: { value: "noor@gmail.co" } });
    // Mid-word, on the way to `.com`: no flicker.
    expect(screen.queryByRole("button")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByRole("button", { name: "Use noor@gmail.com" })).toBeInTheDocument();
  });

  it("reads in Arabic, with the address kept left to right", () => {
    renderField("noor@gmial.com", "ar");
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("هل تقصدون");
    expect(status.querySelector("bdi")?.getAttribute("dir")).toBe("ltr");
  });
});
