"use client";

import dynamic from "next/dynamic";

const VenueDesigner = dynamic(
  () =>
    import("@/components/venue-designer/VenueDesigner").then(
      (m) => m.VenueDesigner
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-screen w-full items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-rose-200 border-t-rose-500" />
          <p className="text-sm text-muted-foreground">
            Loading venue designer...
          </p>
        </div>
      </div>
    ),
  }
);

export default function VenueDesignerPage() {
  return <VenueDesigner />;
}
