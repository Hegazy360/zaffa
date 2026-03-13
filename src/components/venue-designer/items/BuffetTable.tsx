"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: "#6B4226",
  roughness: 0.6,
  metalness: 0.05,
});

const METAL_MAT = new THREE.MeshStandardMaterial({
  color: "#C0C0C0",
  roughness: 0.3,
  metalness: 0.6,
});

const FLAME_MAT = new THREE.MeshStandardMaterial({
  color: "#4488FF",
  emissive: "#3366CC",
  emissiveIntensity: 1.5,
  roughness: 0.3,
});

export function BuffetTable({ color }: { color?: string }) {
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
      {/* Table legs */}
      {[[-0.75, -0.25], [0.75, -0.25], [-0.75, 0.25], [0.75, 0.25]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.21, z]} material={WOOD_MAT} castShadow>
          <boxGeometry args={[0.05, 0.42, 0.05]} />
        </mesh>
      ))}
      {/* Tabletop */}
      <mesh position={[0, 0.425, 0]} material={WOOD_MAT} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.03, 0.6]} />
      </mesh>
      {/* Tablecloth drape */}
      <mesh position={[0, 0.30, 0.28]} material={clothMat} castShadow>
        <boxGeometry args={[1.6, 0.28, 0.02]} />
      </mesh>
      <mesh position={[0, 0.30, -0.28]} material={clothMat}>
        <boxGeometry args={[1.6, 0.28, 0.02]} />
      </mesh>

      {/* Chafing dishes - 3 in a row */}
      {[-0.5, 0, 0.5].map((x, i) => (
        <group key={`cd${i}`} position={[x, 0, 0]}>
          {/* Wire stand frame */}
          <mesh position={[0, 0.47, 0]} material={METAL_MAT}>
            <boxGeometry args={[0.28, 0.02, 0.22]} />
          </mesh>
          {/* Stand legs */}
          {[[-0.12, -0.09], [0.12, -0.09], [-0.12, 0.09], [0.12, 0.09]].map(([lx, lz], li) => (
            <mesh key={li} position={[lx, 0.455, lz]} material={METAL_MAT}>
              <cylinderGeometry args={[0.006, 0.008, 0.04, 4]} />
            </mesh>
          ))}
          {/* Water pan */}
          <mesh position={[0, 0.50, 0]} material={METAL_MAT} castShadow>
            <boxGeometry args={[0.26, 0.04, 0.20]} />
          </mesh>
          {/* Food pan */}
          <mesh position={[0, 0.535, 0]} material={METAL_MAT} castShadow>
            <boxGeometry args={[0.24, 0.03, 0.18]} />
          </mesh>
          {/* Lid - slightly open */}
          <mesh position={[0, 0.56, -0.06]} rotation={[-0.15, 0, 0]} material={METAL_MAT} castShadow>
            <boxGeometry args={[0.25, 0.01, 0.19]} />
          </mesh>
          {/* Lid handle */}
          <mesh position={[0, 0.575, -0.06]} rotation={[-0.15, 0, 0]} material={METAL_MAT}>
            <boxGeometry args={[0.04, 0.015, 0.015]} />
          </mesh>
          {/* Sterno flame underneath */}
          <mesh position={[0, 0.445, 0]} material={FLAME_MAT}>
            <sphereGeometry args={[0.012, 6, 4]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
