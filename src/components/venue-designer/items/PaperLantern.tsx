"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WIRE_MAT = new THREE.MeshStandardMaterial({
  color: "#333333",
  roughness: 0.6,
  metalness: 0.3,
});

export function PaperLantern({ color }: { color?: string }) {
  const c = color || "#F5E6D3";

  const paperMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: c,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        emissive: new THREE.Color(c),
        emissiveIntensity: 0.25,
      }),
    [c]
  );

  const innerGlowMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#FFCC66",
        emissive: "#FFAA33",
        emissiveIntensity: 1.5,
        transparent: true,
        opacity: 0.4,
      }),
    []
  );

  const tasselMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: c, roughness: 0.9 }),
    [c]
  );

  return (
    <group position={[0, 2.2, 0]}>
      {/* Hanging wire */}
      <mesh position={[0, 0.22, 0]} material={WIRE_MAT}>
        <cylinderGeometry args={[0.003, 0.003, 0.44, 4]} />
      </mesh>
      {/* Top cap */}
      <mesh position={[0, 0.185, 0]} material={WIRE_MAT}>
        <cylinderGeometry args={[0.015, 0.04, 0.015, 8]} />
      </mesh>
      {/* Paper globe */}
      <mesh material={paperMat} castShadow>
        <sphereGeometry args={[0.18, 14, 10]} />
      </mesh>
      {/* Inner glow sphere */}
      <mesh material={innerGlowMat}>
        <sphereGeometry args={[0.1, 8, 8]} />
      </mesh>
      {/* Wire ribs */}
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} rotation={[0, (i / 5) * Math.PI, 0]} material={WIRE_MAT}>
          <torusGeometry args={[0.18, 0.002, 4, 16, Math.PI]} />
        </mesh>
      ))}
      {/* Bottom cap */}
      <mesh position={[0, -0.175, 0]} material={WIRE_MAT}>
        <cylinderGeometry args={[0.03, 0.01, 0.015, 8]} />
      </mesh>
      {/* Tassel */}
      <mesh position={[0, -0.21, 0]} material={tasselMat}>
        <coneGeometry args={[0.015, 0.05, 6]} />
      </mesh>
      <mesh position={[0, -0.24, 0]} material={tasselMat}>
        <sphereGeometry args={[0.006, 6, 4]} />
      </mesh>
    </group>
  );
}
