"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: "#D4B896",
  roughness: 0.65,
  metalness: 0.05,
});

const GOLD_MAT = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.5,
});

const LEAF_MAT = new THREE.MeshStandardMaterial({
  color: "#5a7247",
  roughness: 0.8,
});

export function WelcomeSign({ color }: { color?: string }) {
  const boardMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#F5F0EB",
        roughness: 0.8,
        metalness: 0,
      }),
    [color]
  );

  const flowerMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e8a0bf",
        roughness: 0.75,
      }),
    []
  );

  return (
    <group>
      {/* Easel legs - front two */}
      <mesh position={[-0.18, 0.55, 0.12]} rotation={[0.15, 0, -0.08]} material={WOOD_MAT} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 1.1, 6]} />
      </mesh>
      <mesh position={[0.18, 0.55, 0.12]} rotation={[0.15, 0, 0.08]} material={WOOD_MAT} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 1.1, 6]} />
      </mesh>
      {/* Easel back leg */}
      <mesh position={[0, 0.45, -0.15]} rotation={[-0.25, 0, 0]} material={WOOD_MAT} castShadow>
        <cylinderGeometry args={[0.012, 0.012, 0.95, 6]} />
      </mesh>
      {/* Cross bar */}
      <mesh position={[0, 0.45, 0.10]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[0.38, 0.02, 0.02]} />
      </mesh>
      {/* Shelf ledge */}
      <mesh position={[0, 0.42, 0.08]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[0.40, 0.015, 0.04]} />
      </mesh>
      {/* Board */}
      <mesh position={[0, 0.72, 0.06]} rotation={[0.12, 0, 0]} material={boardMat} castShadow>
        <boxGeometry args={[0.45, 0.55, 0.012]} />
      </mesh>
      {/* Gold decorative frame border */}
      {/* Top */}
      <mesh position={[0, 0.997, 0.067]} rotation={[0.12, 0, 0]} material={GOLD_MAT}>
        <boxGeometry args={[0.47, 0.015, 0.006]} />
      </mesh>
      {/* Bottom */}
      <mesh position={[0, 0.443, 0.053]} rotation={[0.12, 0, 0]} material={GOLD_MAT}>
        <boxGeometry args={[0.47, 0.015, 0.006]} />
      </mesh>
      {/* Left */}
      <mesh position={[-0.228, 0.72, 0.06]} rotation={[0.12, 0, 0]} material={GOLD_MAT}>
        <boxGeometry args={[0.015, 0.57, 0.006]} />
      </mesh>
      {/* Right */}
      <mesh position={[0.228, 0.72, 0.06]} rotation={[0.12, 0, 0]} material={GOLD_MAT}>
        <boxGeometry args={[0.015, 0.57, 0.006]} />
      </mesh>
      {/* Corner flower accent - top right */}
      {[
        [0.18, 0.96, 0.07],
        [0.21, 0.93, 0.07],
        [0.15, 0.94, 0.07],
      ].map(([x, y, z], i) => (
        <mesh key={`fl${i}`} position={[x, y, z]} material={flowerMat}>
          <sphereGeometry args={[0.018 - i * 0.003, 6, 6]} />
        </mesh>
      ))}
      {/* Leaves */}
      {[
        [0.22, 0.97, 0.07],
        [0.12, 0.97, 0.07],
      ].map(([x, y, z], i) => (
        <mesh key={`lf${i}`} position={[x, y, z]} rotation={[0, 0, i === 0 ? 0.3 : -0.3]} material={LEAF_MAT}>
          <sphereGeometry args={[0.012, 4, 4]} />
        </mesh>
      ))}
    </group>
  );
}
