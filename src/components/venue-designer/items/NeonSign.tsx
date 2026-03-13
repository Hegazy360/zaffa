"use client";
import { useMemo } from "react";
import * as THREE from "three";

export function NeonSign({ color }: { color?: string }) {
  const glowColor = color || "#FF6B8A";

  const tubeMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: glowColor,
        roughness: 0.2,
        metalness: 0.1,
        emissive: new THREE.Color(glowColor),
        emissiveIntensity: 0.8,
      }),
    [glowColor]
  );

  const backMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2A2A2A",
        roughness: 0.8,
        metalness: 0.1,
      }),
    []
  );

  return (
    <group>
      {/* Backing board */}
      <mesh position={[0, 0.5, -0.02]} material={backMat} castShadow>
        <boxGeometry args={[0.7, 0.35, 0.015]} />
      </mesh>
      {/* Heart shape using tubes */}
      <mesh position={[-0.1, 0.55, 0]} material={tubeMat}>
        <torusGeometry args={[0.08, 0.012, 8, 16, Math.PI]} />
      </mesh>
      <mesh position={[0.1, 0.55, 0]} material={tubeMat}>
        <torusGeometry args={[0.08, 0.012, 8, 16, Math.PI]} />
      </mesh>
      {/* V bottom of heart */}
      <mesh position={[-0.05, 0.48, 0]} rotation={[0, 0, -0.6]} material={tubeMat}>
        <cylinderGeometry args={[0.012, 0.012, 0.14, 6]} />
      </mesh>
      <mesh position={[0.05, 0.48, 0]} rotation={[0, 0, 0.6]} material={tubeMat}>
        <cylinderGeometry args={[0.012, 0.012, 0.14, 6]} />
      </mesh>
    </group>
  );
}
