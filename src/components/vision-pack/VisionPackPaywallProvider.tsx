"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { VisionPackPaywall } from "./VisionPackPaywall";
import { parsePackError, type PackErrorReason } from "./pack-error";

interface PackPaywallContext {
  /** Open the paywall manually (e.g. from a "Get yours" CTA). */
  open(args?: { reason?: PackErrorReason | null; returnPath?: string }): void;
  close(): void;
  /**
   * Inspect a tRPC error: if it's a pack-paywall reason, open the paywall
   * (with the right headline) and return true. Returns false for unrelated
   * errors so the caller can fall through to its existing toast.
   */
  handleError(err: unknown, returnPath?: string): boolean;
}

const Ctx = createContext<PackPaywallContext | null>(null);

/**
 * Mounts a single shared `<VisionPackPaywall>` for the whole subtree and
 * exposes `usePackPaywall()`. Designer pages, gallery, marketing CTAs
 * all share this one modal so triggering the paywall is a one-liner from
 * anywhere descendant.
 */
export function VisionPackPaywallProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(false);
  const [reason, setReason] = useState<PackErrorReason | null>(null);
  const [returnPath, setReturnPath] = useState<string | undefined>(undefined);

  const openPaywall = useCallback(
    (args?: { reason?: PackErrorReason | null; returnPath?: string }) => {
      setReason(args?.reason ?? null);
      setReturnPath(args?.returnPath);
      setOpenState(true);
    },
    [],
  );

  const closePaywall = useCallback(() => {
    setOpenState(false);
  }, []);

  const handleError = useCallback(
    (err: unknown, rp?: string): boolean => {
      const r = parsePackError(err);
      if (!r) return false;
      setReason(r);
      setReturnPath(rp);
      setOpenState(true);
      return true;
    },
    [],
  );

  return (
    <Ctx.Provider
      value={{ open: openPaywall, close: closePaywall, handleError }}
    >
      {children}
      <VisionPackPaywall
        open={open}
        onOpenChange={setOpenState}
        reason={reason}
        returnPath={returnPath}
      />
    </Ctx.Provider>
  );
}

export function usePackPaywall(): PackPaywallContext {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "usePackPaywall() called outside <VisionPackPaywallProvider>",
    );
  }
  return ctx;
}
