"use client";
import { useMemo } from "react";
import * as THREE from "three";

export function DanceFloor({ color }: { color?: string }) {
  const floorMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#2A2A2A",
        roughness: 0.15,
        metalness: 0.6,
      }),
    [color]
  );

  const edgeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#C4A35A",
        roughness: 0.3,
        metalness: 0.5,
      }),
    []
  );

  return (
    <group>
      {/* Main floor panel */}
      <mesh position={[0, 0.015, 0]} material={floorMat} castShadow receiveShadow>
        <boxGeometry args={[3.0, 0.03, 3.0]} />
      </mesh>
      {/* Gold border */}
      <mesh position={[0, 0.025, 1.52]} material={edgeMat}>
        <boxGeometry args={[3.05, 0.035, 0.015]} />
      </mesh>
      <mesh position={[0, 0.025, -1.52]} material={edgeMat}>
        <boxGeometry args={[3.05, 0.035, 0.015]} />
      </mesh>
      <mesh position={[-1.52, 0.025, 0]} material={edgeMat}>
        <boxGeometry args={[0.015, 0.035, 3.05]} />
      </mesh>
      <mesh position={[1.52, 0.025, 0]} material={edgeMat}>
        <boxGeometry args={[0.015, 0.035, 3.05]} />
      </mesh>
    </group>
  );
}
