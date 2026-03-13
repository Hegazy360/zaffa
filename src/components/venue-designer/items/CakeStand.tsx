"use client";
import { useMemo } from "react";
import * as THREE from "three";

const GOLD_MAT = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.6,
});

export function CakeStand({ color }: { color?: string }) {
  const cakeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#FEFEFE",
        roughness: 0.7,
        metalness: 0,
      }),
    [color]
  );

  return (
    <group>
      {/* Stand base */}
      <mesh position={[0, 0.015, 0]} material={GOLD_MAT} castShadow>
        <cylinderGeometry args={[0.18, 0.20, 0.03, 14]} />
      </mesh>
      {/* Stand pedestal */}
      <mesh position={[0, 0.13, 0]} material={GOLD_MAT} castShadow>
        <cylinderGeometry args={[0.03, 0.05, 0.20, 8]} />
      </mesh>
      {/* Stand plate */}
      <mesh position={[0, 0.24, 0]} material={GOLD_MAT} castShadow>
        <cylinderGeometry args={[0.24, 0.24, 0.015, 16]} />
      </mesh>
      {/* Plate rim */}
      <mesh position={[0, 0.25, 0]} material={GOLD_MAT}>
        <torusGeometry args={[0.24, 0.004, 4, 16]} />
      </mesh>

      {/* Bottom tier */}
      <mesh position={[0, 0.345, 0]} material={cakeMat} castShadow>
        <cylinderGeometry args={[0.19, 0.20, 0.18, 20]} />
      </mesh>
      {/* Bottom tier gold trim */}
      <mesh position={[0, 0.255, 0]} material={GOLD_MAT}>
        <torusGeometry args={[0.20, 0.004, 4, 20]} />
      </mesh>

      {/* Middle tier */}
      <mesh position={[0, 0.505, 0]} material={cakeMat} castShadow>
        <cylinderGeometry args={[0.14, 0.15, 0.14, 18]} />
      </mesh>
      {/* Middle tier gold trim */}
      <mesh position={[0, 0.435, 0]} material={GOLD_MAT}>
        <torusGeometry args={[0.15, 0.003, 4, 18]} />
      </mesh>

      {/* Top tier */}
      <mesh position={[0, 0.63, 0]} material={cakeMat} castShadow>
        <cylinderGeometry args={[0.09, 0.10, 0.10, 16]} />
      </mesh>
      {/* Top tier gold trim */}
      <mesh position={[0, 0.58, 0]} material={GOLD_MAT}>
        <torusGeometry args={[0.10, 0.003, 4, 16]} />
      </mesh>

      {/* Topper sphere */}
      <mesh position={[0, 0.70, 0]} material={GOLD_MAT} castShadow>
        <sphereGeometry args={[0.022, 8, 6]} />
      </mesh>
      {/* Topper stem */}
      <mesh position={[0, 0.69, 0]} material={GOLD_MAT}>
        <cylinderGeometry args={[0.004, 0.004, 0.02, 4]} />
      </mesh>
    </group>
  );
}
