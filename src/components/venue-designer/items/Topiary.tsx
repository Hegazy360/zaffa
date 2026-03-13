"use client";
import { useMemo } from "react";
import * as THREE from "three";

const POT_MAT = new THREE.MeshStandardMaterial({
  color: "#8B6F47",
  roughness: 0.7,
  metalness: 0.05,
});
const STEM_MAT = new THREE.MeshStandardMaterial({
  color: "#5A3E28",
  roughness: 0.8,
  metalness: 0,
});

export function Topiary({ color }: { color?: string }) {
  const leafMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#4A7A3D",
        roughness: 0.75,
        metalness: 0,
      }),
    [color]
  );

  return (
    <group>
      {/* Pot */}
      <mesh position={[0, 0.1, 0]} material={POT_MAT} castShadow>
        <cylinderGeometry args={[0.12, 0.1, 0.2, 10]} />
      </mesh>
      <mesh position={[0, 0.21, 0]} material={POT_MAT} castShadow>
        <cylinderGeometry args={[0.13, 0.12, 0.02, 10]} />
      </mesh>
      {/* Stem */}
      <mesh position={[0, 0.5, 0]} material={STEM_MAT} castShadow>
        <cylinderGeometry args={[0.02, 0.025, 0.55, 6]} />
      </mesh>
      {/* Foliage ball */}
      <mesh position={[0, 0.9, 0]} material={leafMat} castShadow>
        <sphereGeometry args={[0.2, 12, 10]} />
      </mesh>
    </group>
  );
}
