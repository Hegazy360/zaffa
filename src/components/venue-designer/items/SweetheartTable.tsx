"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: "#D4B896",
  roughness: 0.6,
  metalness: 0.05,
});

export function SweetheartTable({ color }: { color?: string }) {
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

  const accentMat = useMemo(() => {
    const c = new THREE.Color(color || "#FAF0E6");
    c.lerp(new THREE.Color("#C4A35A"), 0.4);
    return new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, metalness: 0.1 });
  }, [color]);

  return (
    <group>
      {/* Legs */}
      {[[-0.35, -0.25], [0.35, -0.25], [-0.35, 0.25], [0.35, 0.25]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.2, z]} material={WOOD_MAT} castShadow>
          <boxGeometry args={[0.04, 0.4, 0.04]} />
        </mesh>
      ))}
      {/* Tabletop */}
      <mesh position={[0, 0.41, 0]} material={WOOD_MAT} castShadow receiveShadow>
        <boxGeometry args={[0.80, 0.03, 0.55]} />
      </mesh>
      {/* Tablecloth */}
      <mesh position={[0, 0.40, 0]} material={clothMat} castShadow>
        <boxGeometry args={[0.90, 0.02, 0.65]} />
      </mesh>
      {/* Front drape */}
      <mesh position={[0, 0.22, 0.30]} material={clothMat} castShadow>
        <boxGeometry args={[0.85, 0.38, 0.01]} />
      </mesh>
      {/* Decorative swag on front */}
      <mesh position={[0, 0.30, 0.31]} material={accentMat} castShadow>
        <boxGeometry args={[0.50, 0.06, 0.015]} />
      </mesh>
    </group>
  );
}
