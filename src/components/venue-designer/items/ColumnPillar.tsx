"use client";
import { useMemo } from "react";
import * as THREE from "three";

export function ColumnPillar({ color }: { color?: string }) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#F5F0EB",
        roughness: 0.5,
        metalness: 0.1,
      }),
    [color]
  );

  return (
    <group>
      {/* Base */}
      <mesh position={[0, 0.04, 0]} material={mat} castShadow>
        <boxGeometry args={[0.3, 0.08, 0.3]} />
      </mesh>
      {/* Shaft */}
      <mesh position={[0, 0.65, 0]} material={mat} castShadow>
        <cylinderGeometry args={[0.09, 0.11, 1.14, 12]} />
      </mesh>
      {/* Capital */}
      <mesh position={[0, 1.25, 0]} material={mat} castShadow>
        <boxGeometry args={[0.28, 0.06, 0.28]} />
      </mesh>
      {/* Top cap */}
      <mesh position={[0, 1.30, 0]} material={mat} castShadow>
        <cylinderGeometry args={[0.14, 0.14, 0.04, 12]} />
      </mesh>
    </group>
  );
}
