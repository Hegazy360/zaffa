"use client";
import { useMemo } from "react";
import * as THREE from "three";

export function GhostChair({ color }: { color?: string }) {
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: color || "#E8F4FF",
        roughness: 0.05,
        metalness: 0,
        transmission: 0.85,
        thickness: 0.5,
        transparent: true,
        opacity: 0.6,
      }),
    [color]
  );

  return (
    <group>
      {/* Legs */}
      {[[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]} material={mat} castShadow>
          <boxGeometry args={[0.025, 0.44, 0.025]} />
        </mesh>
      ))}
      {/* Seat */}
      <mesh position={[0, 0.44, 0]} material={mat} castShadow>
        <boxGeometry args={[0.32, 0.02, 0.32]} />
      </mesh>
      {/* Back - curved look using a thin box with slight taper */}
      <mesh position={[0, 0.68, -0.14]} material={mat} castShadow>
        <boxGeometry args={[0.30, 0.46, 0.015]} />
      </mesh>
      {/* Armrests */}
      {[-0.15, 0.15].map((x, i) => (
        <mesh key={`a${i}`} position={[x, 0.56, 0]} material={mat} castShadow>
          <boxGeometry args={[0.02, 0.02, 0.26]} />
        </mesh>
      ))}
    </group>
  );
}
