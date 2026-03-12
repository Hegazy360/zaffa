"use client";
import { Suspense } from "react";
import { VenueCanvas } from "./canvas/VenueCanvas";
import { ItemCatalog } from "./ui/ItemCatalog";
import { Toolbar } from "./ui/Toolbar";
import { PropertiesPanel } from "./ui/PropertiesPanel";
import { VenueSettings } from "./ui/VenueSettings";
import { DesignerHeader } from "./ui/DesignerHeader";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { Loader2 } from "lucide-react";

function CanvasLoader() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted/30">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
        <p className="text-sm text-muted-foreground">Loading 3D scene...</p>
      </div>
    </div>
  );
}

export function VenueDesigner() {
  const placingType = useVenueDesignerStore((s) => s.placingType);

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background">
      {/* Left sidebar - Item catalog */}
      <div className="w-48 shrink-0 border-r bg-background/80 backdrop-blur-sm overflow-y-auto z-10">
        <ItemCatalog />
      </div>

      {/* Main canvas area */}
      <div className="relative flex-1">
        <Suspense fallback={<CanvasLoader />}>
          <VenueCanvas />
        </Suspense>

        {/* Top bar overlay */}
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between pointer-events-none">
          <div className="pointer-events-auto flex flex-col gap-2">
            <DesignerHeader />
            <Toolbar />
          </div>
          <div className="pointer-events-auto">
            <VenueSettings />
          </div>
        </div>

        {/* Placement hint */}
        {placingType && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-rose-500 text-white px-4 py-2 text-sm font-medium shadow-lg pointer-events-none">
            Click on the floor to place &middot; Press Esc to cancel
          </div>
        )}

        {/* Properties panel */}
        <PropertiesPanel />
      </div>
    </div>
  );
}
