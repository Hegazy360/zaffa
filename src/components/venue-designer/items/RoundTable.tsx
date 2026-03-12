"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD = new THREE.MeshStandardMaterial({
  color: "#8B6914",
  roughness: 0.65,
  metalness: 0.08,
});

export function RoundTable({ color }: { color?: string }) {
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

  const clothProfile = useMemo(() => {
    const pts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.68, 0),
      new THREE.Vector2(0.69, -0.005),
      new THREE.Vector2(0.695, -0.02),
      new THREE.Vector2(0.69, -0.08),
      new THREE.Vector2(0.68, -0.12),
    ];
    return new THREE.LatheGeometry(pts, 32);
  }, []);

  return (
    <group>
      {/* Pedestal */}
      <mesh position={[0, 0.4, 0]} material={WOOD} castShadow>
        <cylinderGeometry args={[0.07, 0.12, 0.8, 12]} />
      </mesh>
      {/* Base */}
      <mesh position={[0, 0.005, 0]} material={WOOD} castShadow receiveShadow>
        <cylinderGeometry args={[0.32, 0.35, 0.01, 16]} />
      </mesh>
      {/* Tabletop */}
      <mesh position={[0, 0.805, 0]} material={WOOD} castShadow receiveShadow>
        <cylinderGeometry args={[0.68, 0.68, 0.005, 32]} />
      </mesh>
      {/* Tablecloth drape */}
      <mesh position={[0, 0.81, 0]} geometry={clothProfile} material={clothMat} castShadow />
    </group>
  );
}
