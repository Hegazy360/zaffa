"use client";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { VenueRoom } from "./VenueRoom";
import { SceneLighting } from "./SceneLighting";
import { PlacedItems } from "./PlacedItems";
import { PlacementPreview } from "./PlacementPreview";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";

export function VenueCanvas() {
  const select = useVenueDesignerStore((s) => s.select);
  const placingType = useVenueDesignerStore((s) => s.placingType);
  const cancelPlacing = useVenueDesignerStore((s) => s.cancelPlacing);

  return (
    <Canvas
      shadows
      camera={{ position: [12, 10, 16], fov: 50, near: 0.1, far: 200 }}
      onPointerMissed={() => {
        if (placingType) {
          cancelPlacing();
        } else {
          select(null);
        }
      }}
      style={{ cursor: placingType ? "crosshair" : "default" }}
    >
      <SceneLighting />
      <VenueRoom />
      <PlacedItems />
      <PlacementPreview />
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minPolarAngle={0.1}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={3}
        maxDistance={60}
      />
    </Canvas>
  );
}
