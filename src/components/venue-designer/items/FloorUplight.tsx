"use client";
import { useMemo } from "react";
import * as THREE from "three";

export function FloorUplight({ color }: { color?: string }) {
  const lightColor = color || "#FFD700";

  const lensMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: lightColor,
        roughness: 0.2,
        metalness: 0.1,
        emissive: new THREE.Color(lightColor),
        emissiveIntensity: 1.0,
      }),
    [lightColor]
  );

  const beamMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: lightColor,
        emissive: new THREE.Color(lightColor),
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 0.08,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    [lightColor]
  );

  return (
    <group>
      {/* Housing base */}
      <mesh position={[0, 0.015, 0]} castShadow>
        <cylinderGeometry args={[0.065, 0.075, 0.03, 12]} />
        <meshStandardMaterial color="#1A1A1A" roughness={0.5} metalness={0.5} />
      </mesh>
      {/* Housing top rim */}
      <mesh position={[0, 0.035, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.065, 0.01, 12]} />
        <meshStandardMaterial color="#333333" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Lens */}
      <mesh position={[0, 0.045, 0]} material={lensMat}>
        <cylinderGeometry args={[0.05, 0.05, 0.01, 12]} />
      </mesh>
      {/* Subtle light beam cone */}
      <mesh position={[0, 0.35, 0]} material={beamMat}>
        <coneGeometry args={[0.25, 0.6, 12, 1, true]} />
      </mesh>
    </group>
  );
}
