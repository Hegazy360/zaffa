"use client";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";

export function SceneLighting() {
  const venue = useVenueDesignerStore((s) => s.venue);
  const spread = Math.max(venue.width, venue.length);

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[5, 10, 7]}
        intensity={0.7}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-spread / 2}
        shadow-camera-right={spread / 2}
        shadow-camera-top={spread / 2}
        shadow-camera-bottom={-spread / 2}
      />
      <hemisphereLight args={["#FFF5E6", "#E8DDD0", 0.35]} />
    </>
  );
}
