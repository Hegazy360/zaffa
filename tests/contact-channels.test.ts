import { describe, expect, it } from "vitest";
import {
  WHATSAPP_LINK,
  WHATSAPP_NUMBER_DIGITS,
  waLinkFor,
  whatsappLink,
} from "@/lib/contact-channels";

describe("whatsappLink", () => {
  it("produces a bare tap-to-chat link with no message", () => {
    expect(whatsappLink()).toBe(WHATSAPP_LINK);
    expect(whatsappLink("")).toBe(WHATSAPP_LINK);
  });

  it("keeps the number digits-only, as wa.me requires", () => {
    // A `+`, a space or a dash anywhere in the path and WhatsApp opens on a
    // blank chat instead of ours.
    expect(WHATSAPP_NUMBER_DIGITS).toMatch(/^\d+$/);
    expect(WHATSAPP_LINK).toBe(`https://wa.me/${WHATSAPP_NUMBER_DIGITS}`);
  });

  it("percent-encodes Arabic and newlines rather than passing them through", () => {
    // `wa.me` reads `text` literally, so an unencoded newline truncates the
    // message and unencoded Arabic can arrive mangled.
    const link = whatsappLink("أهلاً زفّة\nRef: abc123");
    expect(link).not.toContain("\n");
    expect(link).not.toContain("أهلا");
    expect(decodeURIComponent(link.split("?text=")[1])).toBe(
      "أهلاً زفّة\nRef: abc123",
    );
  });

  it("escapes characters that would otherwise split the query string", () => {
    const link = whatsappLink("budget? 45,000 & up #wedding");
    const [, query] = link.split("?text=");
    expect(query).not.toContain("&");
    expect(query).not.toContain("#");
    expect(decodeURIComponent(query)).toBe("budget? 45,000 & up #wedding");
  });
});

describe("waLinkFor", () => {
  it("returns null rather than a broken link when there is no usable number", () => {
    expect(waLinkFor(null)).toBeNull();
    expect(waLinkFor("")).toBeNull();
    expect(waLinkFor("12345")).toBeNull();
  });

  it("strips formatting from a lead's number", () => {
    expect(waLinkFor("+971 50 000 0123")).toBe("https://wa.me/971500000123");
  });
});
