"use client";
import { useMemo } from "react";
import * as THREE from "three";

const POT_MAT = new THREE.MeshStandardMaterial({
  color: "#8B6F47",
  roughness: 0.7,
  metalness: 0.05,
});
const SOIL_MAT = new THREE.MeshStandardMaterial({
  color: "#3D2E1F",
  roughness: 0.95,
  metalness: 0,
});

export function PottedPlant({ color }: { color?: string }) {
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
        <cylinderGeometry args={[0.14, 0.10, 0.2, 10]} />
      </mesh>
      <mesh position={[0, 0.21, 0]} material={POT_MAT} castShadow>
        <cylinderGeometry args={[0.15, 0.14, 0.02, 10]} />
      </mesh>
      {/* Soil */}
      <mesh position={[0, 0.2, 0]} material={SOIL_MAT}>
        <cylinderGeometry args={[0.12, 0.12, 0.02, 10]} />
      </mesh>
      {/* Bushy foliage - layered spheres */}
      <mesh position={[0, 0.38, 0]} material={leafMat} castShadow>
        <sphereGeometry args={[0.16, 10, 8]} />
      </mesh>
      <mesh position={[-0.06, 0.45, 0.05]} material={leafMat} castShadow>
        <sphereGeometry args={[0.11, 8, 6]} />
      </mesh>
      <mesh position={[0.07, 0.43, -0.04]} material={leafMat} castShadow>
        <sphereGeometry args={[0.10, 8, 6]} />
      </mesh>
      <mesh position={[0, 0.50, 0]} material={leafMat} castShadow>
        <sphereGeometry args={[0.09, 8, 6]} />
      </mesh>
    </group>
  );
}
