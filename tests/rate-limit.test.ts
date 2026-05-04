import { describe, expect, it } from "vitest";
import { ipFromRequest } from "@/lib/rate-limit";

describe("ipFromRequest", () => {
  it("returns the first ip from x-forwarded-for", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" },
    });
    expect(ipFromRequest(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-real-ip": "9.8.7.6" },
    });
    expect(ipFromRequest(req)).toBe("9.8.7.6");
  });

  it("returns 'unknown' when no proxy headers", () => {
    const req = new Request("http://localhost/");
    expect(ipFromRequest(req)).toBe("unknown");
  });
});
