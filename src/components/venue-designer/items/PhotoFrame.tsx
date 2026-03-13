"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: "#D4B896",
  roughness: 0.65,
  metalness: 0.05,
});

export function PhotoFrame({ color }: { color?: string }) {
  const frameMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#C4A35A",
        roughness: 0.3,
        metalness: 0.5,
      }),
    [color]
  );

  return (
    <group>
      {/* Easel legs */}
      <mesh position={[-0.12, 0.4, 0.08]} rotation={[0.12, 0, -0.06]} material={WOOD_MAT} castShadow>
        <cylinderGeometry args={[0.01, 0.01, 0.82, 6]} />
      </mesh>
      <mesh position={[0.12, 0.4, 0.08]} rotation={[0.12, 0, 0.06]} material={WOOD_MAT} castShadow>
        <cylinderGeometry args={[0.01, 0.01, 0.82, 6]} />
      </mesh>
      <mesh position={[0, 0.35, -0.1]} rotation={[-0.2, 0, 0]} material={WOOD_MAT} castShadow>
        <cylinderGeometry args={[0.01, 0.01, 0.72, 6]} />
      </mesh>
      {/* Frame */}
      <mesh position={[0, 0.52, 0.04]} rotation={[0.1, 0, 0]} material={frameMat} castShadow>
        <boxGeometry args={[0.32, 0.40, 0.015]} />
      </mesh>
      {/* Photo area (dark) */}
      <mesh position={[0, 0.52, 0.045]} rotation={[0.1, 0, 0]} castShadow>
        <boxGeometry args={[0.26, 0.34, 0.005]} />
        <meshStandardMaterial color="#2A2A2A" roughness={0.9} />
      </mesh>
    </group>
  );
}
