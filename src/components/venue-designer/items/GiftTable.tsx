"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: "#D4B896",
  roughness: 0.6,
  metalness: 0.05,
});

export function GiftTable({ color }: { color?: string }) {
  const clothMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#FAF0E6",
        roughness: 0.85,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [color]
  );

  return (
    <group>
      {/* Legs */}
      {[[-0.5, -0.3], [0.5, -0.3], [-0.5, 0.3], [0.5, 0.3]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.2, z]} material={WOOD_MAT} castShadow>
          <boxGeometry args={[0.04, 0.4, 0.04]} />
        </mesh>
      ))}
      {/* Tabletop */}
      <mesh position={[0, 0.41, 0]} material={WOOD_MAT} castShadow receiveShadow>
        <boxGeometry args={[1.1, 0.03, 0.65]} />
      </mesh>
      {/* Tablecloth */}
      <mesh position={[0, 0.40, 0]} material={clothMat} castShadow>
        <boxGeometry args={[1.2, 0.02, 0.75]} />
      </mesh>
      {/* Front drape */}
      <mesh position={[0, 0.22, 0.35]} material={clothMat} castShadow>
        <boxGeometry args={[1.15, 0.38, 0.01]} />
      </mesh>
      {/* Side drapes */}
      {[-0.57, 0.57].map((x, i) => (
        <mesh key={`sd${i}`} position={[x, 0.22, 0]} material={clothMat} castShadow>
          <boxGeometry args={[0.01, 0.38, 0.70]} />
        </mesh>
      ))}
    </group>
  );
}
