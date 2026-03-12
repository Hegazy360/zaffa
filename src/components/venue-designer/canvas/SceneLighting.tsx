"use client";
import { Environment, ContactShadows } from "@react-three/drei";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";

export function SceneLighting() {
  const venue = useVenueDesignerStore((s) => s.venue);
  const spread = Math.max(venue.width, venue.length);

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[5, 10, 7]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-near={0.5}
        shadow-camera-far={50}
        shadow-camera-left={-spread / 2}
        shadow-camera-right={spread / 2}
        shadow-camera-top={spread / 2}
        shadow-camera-bottom={-spread / 2}
      />
      <hemisphereLight
        args={["#FFF5E6", "#E8DDD0", 0.3]}
      />
      <ContactShadows
        position={[0, 0.01, 0]}
        opacity={0.35}
        scale={spread * 1.2}
        blur={1.5}
        far={10}
      />
      <Environment preset="apartment" background={false} />
    </>
  );
}
