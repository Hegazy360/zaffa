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
  const { width, length, height, floorType, floorColor, wallColor } = venue;
  const hw = width / 2;
  const hl = length / 2;

  const floorMat = useFloorMaterial(floorType, floorColor);

  const wallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: wallColor,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [wallColor]
  );

  const frontWallMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: wallColor,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
      }),
    [wallColor]
  );

  const gridHelper = useMemo(() => {
    const size = Math.max(width, length);
    const divisions = Math.round(size);
    const gridColor = floorType === "grass" || floorType === "sand" ? "#00000015" : "#ccc";
    const gridSub = floorType === "grass" || floorType === "sand" ? "#00000008" : "#e0e0e0";
    const grid = new THREE.GridHelper(size, divisions, gridColor, gridSub);
    grid.position.y = 0.005;
    return grid;
  }, [width, length, floorType]);

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow material={floorMat}>
        <planeGeometry args={[width, length]} />
      </mesh>

      <primitive object={gridHelper} />

      <mesh position={[0, height / 2, -hl]} material={wallMat} receiveShadow>
        <planeGeometry args={[width, height]} />
      </mesh>
      <mesh position={[-hw, height / 2, 0]} rotation-y={Math.PI / 2} material={wallMat} receiveShadow>
        <planeGeometry args={[length, height]} />
      </mesh>
      <mesh position={[hw, height / 2, 0]} rotation-y={-Math.PI / 2} material={wallMat} receiveShadow>
        <planeGeometry args={[length, height]} />
      </mesh>
      <mesh position={[0, height / 2, hl]} rotation-y={Math.PI} material={frontWallMat}>
        <planeGeometry args={[width, height]} />
      </mesh>
    </group>
  );
}
