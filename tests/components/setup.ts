// Setup file for the jsdom-flavoured Vitest project. Loaded once per test
// process before any spec runs; we expose `expect`'s jest-dom matchers and
// stub a handful of browser globals the components reach for.

import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(() => cleanup());

// jsdom doesn't ship matchMedia or ResizeObserver, components from
// shadcn/Radix call them on mount.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (q: string) => ({
        matches: false,
        media: q,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    });
  }
  if (typeof globalThis.ResizeObserver === "undefined") {
    class RO {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
    (globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
  }
}
