"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: "#5C3A1E",
  roughness: 0.55,
  metalness: 0.1,
});

const FOOT_MAT = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.6,
});

export function BarCounter({ color }: { color?: string }) {
  const panelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#3D2B1F",
        roughness: 0.6,
        metalness: 0.05,
      }),
    [color]
  );

  const topMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2A1F14",
        roughness: 0.35,
        metalness: 0.15,
      }),
    []
  );

  return (
    <group>
      {/* Front panel */}
      <mesh position={[0, 0.5, 0.22]} material={panelMat} castShadow>
        <boxGeometry args={[1.8, 1.0, 0.04]} />
      </mesh>
      {/* Back panel */}
      <mesh position={[0, 0.5, -0.22]} material={panelMat} castShadow>
        <boxGeometry args={[1.8, 1.0, 0.04]} />
      </mesh>
      {/* Side panels */}
      {[-0.88, 0.88].map((x, i) => (
        <mesh key={i} position={[x, 0.5, 0]} material={panelMat} castShadow>
          <boxGeometry args={[0.04, 1.0, 0.48]} />
        </mesh>
      ))}
      {/* Bar top - polished wood */}
      <mesh position={[0, 1.01, 0]} material={topMat} castShadow receiveShadow>
        <boxGeometry args={[1.9, 0.04, 0.55]} />
      </mesh>
      {/* Top edge lip */}
      <mesh position={[0, 1.035, 0.26]} material={topMat}>
        <boxGeometry args={[1.9, 0.02, 0.02]} />
      </mesh>
      {/* Foot rail */}
      <mesh position={[0, 0.15, 0.24]} material={FOOT_MAT}>
        <cylinderGeometry args={[0.012, 0.012, 1.7, 6]} />
      </mesh>
      {/* Foot rail brackets */}
      {[-0.7, 0, 0.7].map((x, i) => (
        <mesh key={`b${i}`} position={[x, 0.15, 0.24]} rotation={[0, 0, Math.PI / 2]} material={FOOT_MAT}>
          <cylinderGeometry args={[0.008, 0.008, 0.04, 4]} />
        </mesh>
      ))}
      {/* Shelf inside */}
      <mesh position={[0, 0.45, 0]} material={WOOD_MAT} receiveShadow>
        <boxGeometry args={[1.7, 0.02, 0.35]} />
      </mesh>
    </group>
  );
}
