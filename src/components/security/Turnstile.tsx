"use client";

import { useEffect, useId, useRef } from "react";

interface TurnstileProps {
  /** Called every time Cloudflare hands us a fresh token. */
  onToken(token: string | null): void;
  /** Force a re-render with a new challenge (e.g. after submit failure). */
  resetKey?: number;
  /** Visual size; defaults to compact since this lives inside other UI. */
  size?: "normal" | "compact" | "flexible";
}

declare global {
  interface Window {
    turnstile?: {
      render(
        el: HTMLElement,
        opts: {
          sitekey: string;
          callback: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
          size?: "normal" | "compact" | "flexible";
        },
      ): string;
      reset(widgetId?: string): void;
      remove(widgetId?: string): void;
    };
    __zaffaTurnstileScriptLoading__?: Promise<void>;
  }
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

function loadScriptOnce(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (window.__zaffaTurnstileScriptLoading__) {
    return window.__zaffaTurnstileScriptLoading__;
  }
  window.__zaffaTurnstileScriptLoading__ = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SCRIPT_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("turnstile_load")));
      return;
    }
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.addEventListener("load", () => resolve());
    s.addEventListener("error", () => reject(new Error("turnstile_load")));
    document.head.appendChild(s);
  });
  return window.__zaffaTurnstileScriptLoading__;
}

/**
 * Renders the Cloudflare Turnstile widget and emits the token via
 * `onToken`. When `NEXT_PUBLIC_TURNSTILE_SITE_KEY` isn't set this
 * mounts nothing and immediately calls `onToken(null)` so dev/preview
 * flows aren't blocked. Server-side verification is also a no-op when
 * `TURNSTILE_SECRET_KEY` is missing, so the two ends agree.
 */
export function Turnstile({ onToken, resetKey, size = "compact" }: TurnstileProps) {
  const id = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? null;

  useEffect(() => {
    if (!siteKey) {
      onTokenRef.current(null);
      return;
    }
    let cancelled = false;
    loadScriptOnce()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          size,
          callback: (token) => onTokenRef.current(token),
          "error-callback": () => onTokenRef.current(null),
          "expired-callback": () => onTokenRef.current(null),
        });
      })
      .catch(() => {
        onTokenRef.current(null);
      });
    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [siteKey, size]);

  useEffect(() => {
    if (!widgetIdRef.current || !window.turnstile) return;
    if (resetKey === undefined) return;
    try {
      window.turnstile.reset(widgetIdRef.current);
    } catch {
      // ignore
    }
  }, [resetKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} id={`turnstile-${id}`} />;
}
