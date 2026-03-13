"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: "#8B6F47",
  roughness: 0.65,
  metalness: 0.05,
});

export function Bench({ color }: { color?: string }) {
  const cushionMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#F5F0EB",
        roughness: 0.85,
        metalness: 0,
      }),
    [color]
  );

  return (
    <group>
      {/* Legs - 3 pairs */}
      {[-0.5, 0, 0.5].map((x, i) => (
        <group key={i}>
          <mesh position={[x, 0.2, -0.15]} material={WOOD_MAT} castShadow>
            <boxGeometry args={[0.04, 0.4, 0.04]} />
          </mesh>
          <mesh position={[x, 0.2, 0.15]} material={WOOD_MAT} castShadow>
            <boxGeometry args={[0.04, 0.4, 0.04]} />
          </mesh>
          <mesh position={[x, 0.1, 0]} material={WOOD_MAT}>
            <boxGeometry args={[0.03, 0.02, 0.28]} />
          </mesh>
        </group>
      ))}
      {/* Seat plank */}
      <mesh position={[0, 0.41, 0]} material={WOOD_MAT} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.03, 0.35]} />
      </mesh>
      {/* Cushion */}
      <mesh position={[0, 0.44, 0]} material={cushionMat} castShadow>
        <boxGeometry args={[1.15, 0.04, 0.30]} />
      </mesh>
      {/* Back support */}
      <mesh position={[0, 0.65, -0.16]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[1.15, 0.25, 0.02]} />
      </mesh>
      <mesh position={[0, 0.80, -0.16]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[1.15, 0.03, 0.03]} />
      </mesh>
    </group>
  );
}
