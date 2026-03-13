"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: "#8B6F47",
  roughness: 0.7,
  metalness: 0.05,
});

export function CrossbackChair({ color }: { color?: string }) {
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
      {/* Legs */}
      {[[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]} material={WOOD_MAT} castShadow>
          <cylinderGeometry args={[0.014, 0.018, 0.44, 6]} />
        </mesh>
      ))}
      {/* Back posts */}
      {[-0.14, 0.14].map((x, i) => (
        <mesh key={`bp${i}`} position={[x, 0.66, -0.14]} material={WOOD_MAT} castShadow>
          <cylinderGeometry args={[0.014, 0.014, 0.44, 6]} />
        </mesh>
      ))}
      {/* X cross on back */}
      <mesh position={[0, 0.66, -0.14]} rotation={[0, 0, 0.55]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[0.38, 0.018, 0.018]} />
      </mesh>
      <mesh position={[0, 0.66, -0.14]} rotation={[0, 0, -0.55]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[0.38, 0.018, 0.018]} />
      </mesh>
      {/* Top rail */}
      <mesh position={[0, 0.87, -0.14]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[0.30, 0.03, 0.02]} />
      </mesh>
      {/* Seat */}
      <mesh position={[0, 0.44, 0]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[0.32, 0.02, 0.32]} />
      </mesh>
      {/* Cushion */}
      <mesh position={[0, 0.46, 0]} material={cushionMat} castShadow>
        <boxGeometry args={[0.28, 0.025, 0.28]} />
      </mesh>
    </group>
  );
}
