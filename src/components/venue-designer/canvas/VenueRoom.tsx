"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import type { FloorType } from "@/types/venue-designer";

interface FloorPreset {
  color: string;
  roughness: number;
  metalness: number;
}

const FLOOR_PRESETS: Record<Exclude<FloorType, "custom">, FloorPreset> = {
  ceramic: { color: "#E8DDD0", roughness: 0.6, metalness: 0.08 },
  marble: { color: "#F0ECE3", roughness: 0.25, metalness: 0.12 },
  wood: { color: "#9E7B4F", roughness: 0.75, metalness: 0.03 },
  grass: { color: "#5A8C3E", roughness: 0.95, metalness: 0 },
  sand: { color: "#D4C4A0", roughness: 0.92, metalness: 0 },
  concrete: { color: "#B8B4AC", roughness: 0.85, metalness: 0.02 },
};

function useFloorMaterial(floorType: FloorType, floorColor: string) {
  return useMemo(() => {
    if (floorType === "custom") {
      return new THREE.MeshStandardMaterial({
        color: floorColor,
        roughness: 0.7,
        metalness: 0.05,
      });
    }
    const preset = FLOOR_PRESETS[floorType];
    return new THREE.MeshStandardMaterial({
      color: preset.color,
      roughness: preset.roughness,
      metalness: preset.metalness,
    });
  }, [floorType, floorColor]);
}

export function VenueRoom() {
  const venue = useVenueDesignerStore((s) => s.venue);
  const { width, length, floorType, floorColor } = venue;

  const floorMat = useFloorMaterial(floorType, floorColor);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow material={floorMat}>
        <planeGeometry args={[width, length]} />
      </mesh>
    </group>
  );
}
