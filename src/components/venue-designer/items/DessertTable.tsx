"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: "#D4B896",
  roughness: 0.6,
  metalness: 0.05,
});

const GOLD_MAT = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.5,
});

export function DessertTable({ color }: { color?: string }) {
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
      {/* Table legs */}
      {[[-0.6, -0.25], [0.6, -0.25], [-0.6, 0.25], [0.6, 0.25]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.2, z]} material={WOOD_MAT} castShadow>
          <boxGeometry args={[0.04, 0.4, 0.04]} />
        </mesh>
      ))}
      {/* Tabletop */}
      <mesh position={[0, 0.41, 0]} material={WOOD_MAT} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.03, 0.55]} />
      </mesh>
      {/* Tablecloth */}
      <mesh position={[0, 0.40, 0]} material={clothMat} castShadow>
        <boxGeometry args={[1.4, 0.02, 0.65]} />
      </mesh>
      {/* Front drape */}
      <mesh position={[0, 0.22, 0.30]} material={clothMat} castShadow>
        <boxGeometry args={[1.35, 0.38, 0.01]} />
      </mesh>
      {/* Tiered shelf - back */}
      <mesh position={[0, 0.55, -0.15]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[0.9, 0.02, 0.2]} />
      </mesh>
      {/* Shelf supports */}
      {[-0.4, 0.4].map((x, i) => (
        <mesh key={`ss${i}`} position={[x, 0.50, -0.15]} material={GOLD_MAT} castShadow>
          <cylinderGeometry args={[0.015, 0.015, 0.15, 6]} />
        </mesh>
      ))}
      {/* Top shelf */}
      <mesh position={[0, 0.70, -0.18]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[0.6, 0.02, 0.16]} />
      </mesh>
      {/* Top shelf supports */}
      {[-0.25, 0.25].map((x, i) => (
        <mesh key={`ts${i}`} position={[x, 0.64, -0.18]} material={GOLD_MAT} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.12, 6]} />
        </mesh>
      ))}
    </group>
  );
}
