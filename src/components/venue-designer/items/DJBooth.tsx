"use client";
import { useMemo } from "react";
import * as THREE from "three";

const DARK_MAT = new THREE.MeshStandardMaterial({
  color: "#1A1A1A",
  roughness: 0.5,
  metalness: 0.3,
});

const METAL_MAT = new THREE.MeshStandardMaterial({
  color: "#555555",
  roughness: 0.3,
  metalness: 0.6,
});

export function DJBooth({ color }: { color?: string }) {
  const panelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#2A2A2A",
        roughness: 0.6,
        metalness: 0.1,
      }),
    [color]
  );

  const ledMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#00BFFF",
        emissive: new THREE.Color("#00BFFF"),
        emissiveIntensity: 0.8,
        roughness: 0.2,
      }),
    []
  );

  return (
    <group>
      {/* Main desk */}
      <mesh position={[0, 0.45, 0]} material={panelMat} castShadow>
        <boxGeometry args={[1.4, 0.9, 0.6]} />
      </mesh>
      {/* Desk top surface */}
      <mesh position={[0, 0.91, 0]} material={DARK_MAT} castShadow receiveShadow>
        <boxGeometry args={[1.44, 0.02, 0.64]} />
      </mesh>

      {/* Front panel LED strip */}
      <mesh position={[0, 0.45, 0.305]} material={ledMat}>
        <boxGeometry args={[1.2, 0.015, 0.003]} />
      </mesh>
      <mesh position={[0, 0.35, 0.305]} material={ledMat}>
        <boxGeometry args={[1.2, 0.015, 0.003]} />
      </mesh>

      {/* Turntable left */}
      <mesh position={[-0.35, 0.925, 0]} material={DARK_MAT}>
        <cylinderGeometry args={[0.16, 0.16, 0.01, 16]} />
      </mesh>
      <mesh position={[-0.35, 0.93, 0]} material={METAL_MAT}>
        <cylinderGeometry args={[0.015, 0.015, 0.01, 8]} />
      </mesh>

      {/* Turntable right */}
      <mesh position={[0.35, 0.925, 0]} material={DARK_MAT}>
        <cylinderGeometry args={[0.16, 0.16, 0.01, 16]} />
      </mesh>
      <mesh position={[0.35, 0.93, 0]} material={METAL_MAT}>
        <cylinderGeometry args={[0.015, 0.015, 0.01, 8]} />
      </mesh>

      {/* Mixer center */}
      <mesh position={[0, 0.925, 0]} material={DARK_MAT}>
        <boxGeometry args={[0.18, 0.015, 0.25]} />
      </mesh>
      {/* Mixer knobs */}
      {[-0.05, 0, 0.05].map((x, i) => (
        <mesh key={i} position={[x, 0.94, -0.05]} material={METAL_MAT}>
          <cylinderGeometry args={[0.008, 0.008, 0.01, 6]} />
        </mesh>
      ))}
      {/* Fader slots */}
      {[-0.04, 0.04].map((x, i) => (
        <mesh key={`f${i}`} position={[x, 0.935, 0.06]} material={METAL_MAT}>
          <boxGeometry args={[0.006, 0.008, 0.06]} />
        </mesh>
      ))}

      {/* Laptop stand */}
      <mesh position={[0, 0.98, -0.18]} rotation={[0.3, 0, 0]} material={METAL_MAT}>
        <boxGeometry args={[0.28, 0.005, 0.18]} />
      </mesh>
    </group>
  );
}
