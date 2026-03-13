"use client";
import { useMemo } from "react";
import * as THREE from "three";

const METAL_MAT = new THREE.MeshStandardMaterial({
  color: "#C0C0C0",
  roughness: 0.3,
  metalness: 0.6,
});

const GOLD_RING = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.7,
});

export function CocktailTable({ color }: { color?: string }) {
  const clothMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#FFFFFF",
        roughness: 0.85,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [color]
  );

  return (
    <group>
      {/* Weighted base */}
      <mesh position={[0, 0.015, 0]} material={METAL_MAT} castShadow>
        <cylinderGeometry args={[0.18, 0.20, 0.03, 14]} />
      </mesh>
      {/* Base gold trim */}
      <mesh position={[0, 0.032, 0]} material={GOLD_RING}>
        <torusGeometry args={[0.19, 0.004, 4, 14]} />
      </mesh>
      {/* Pedestal */}
      <mesh position={[0, 0.55, 0]} material={METAL_MAT} castShadow>
        <cylinderGeometry args={[0.02, 0.028, 1.04, 8]} />
      </mesh>
      {/* Tabletop */}
      <mesh position={[0, 1.09, 0]} material={METAL_MAT} castShadow receiveShadow>
        <cylinderGeometry args={[0.35, 0.35, 0.03, 16]} />
      </mesh>
      {/* Tabletop gold rim */}
      <mesh position={[0, 1.09, 0]} material={GOLD_RING}>
        <torusGeometry args={[0.35, 0.004, 4, 16]} />
      </mesh>
      {/* Full-length draped cloth */}
      <mesh position={[0, 0.56, 0]} material={clothMat} castShadow>
        <cylinderGeometry args={[0.37, 0.30, 1.06, 16]} />
      </mesh>
      {/* Cloth gathered at bottom */}
      <mesh position={[0, 0.05, 0]} material={clothMat}>
        <cylinderGeometry args={[0.30, 0.32, 0.06, 16]} />
      </mesh>
    </group>
  );
}
