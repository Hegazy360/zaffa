"use client";

import { createContext, useContext, type ReactNode } from "react";
import { isFlagEnabled } from "@/lib/flags";
import type { DesignerFlagKey, DesignerFlags } from "@/lib/designer-flags";

// Server-read kill switches for the designer UI, see src/lib/designer-flags.ts
// for why the browser cannot read them itself.

const DesignerFlagsContext = createContext<DesignerFlags | null>(null);

export function DesignerFlagsProvider({
  flags,
  children,
}: {
  flags: DesignerFlags;
  children: ReactNode;
}) {
  return (
    <DesignerFlagsContext.Provider value={flags}>
      {children}
    </DesignerFlagsContext.Provider>
  );
}

/**
 * Whether a design partner feature is switched on. Outside the provider
 * (a component rendered on its own, a test) it falls back to the static
 * default, which is what the flag would read with no env override.
 */
export function useDesignerFlag(key: DesignerFlagKey): boolean {
  const flags = useContext(DesignerFlagsContext);
  return flags ? flags[key] : isFlagEnabled(key);
}
