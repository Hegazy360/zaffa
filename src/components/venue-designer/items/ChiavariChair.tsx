"use client";
import { useMemo } from "react";
import * as THREE from "three";

const FRAME_MAT = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.5,
});

export function ChiavariChair({ color }: { color?: string }) {
  const cushionMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#F5F0EB",
        roughness: 0.85,
        metalness: 0,
      }),
    [color]
  );

  return (
    <group>
      {[[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]} material={FRAME_MAT} castShadow>
          <cylinderGeometry args={[0.01, 0.014, 0.44, 6]} />
        </mesh>
      ))}
      {/* Back legs extend up */}
      {[-0.13, 0.13].map((x, i) => (
        <mesh key={`b${i}`} position={[x, 0.66, -0.13]} material={FRAME_MAT} castShadow>
          <cylinderGeometry args={[0.01, 0.01, 0.44, 6]} />
        </mesh>
      ))}
      {/* Vertical back slats */}
      {[-0.065, 0, 0.065].map((x, i) => (
        <mesh key={`s${i}`} position={[x, 0.66, -0.13]} material={FRAME_MAT} castShadow>
          <cylinderGeometry args={[0.006, 0.006, 0.40, 4]} />
        </mesh>
      ))}
      {/* Top rail */}
      <mesh position={[0, 0.87, -0.13]} material={FRAME_MAT} castShadow>
        <boxGeometry args={[0.28, 0.025, 0.02]} />
      </mesh>
      {/* Seat frame */}
      <mesh position={[0, 0.44, 0]} material={FRAME_MAT} castShadow>
        <boxGeometry args={[0.30, 0.02, 0.30]} />
      </mesh>
      {/* Cushion */}
      <mesh position={[0, 0.46, 0]} material={cushionMat} castShadow>
        <boxGeometry args={[0.27, 0.025, 0.27]} />
      </mesh>
      {/* Cross bars */}
      <mesh position={[0, 0.15, 0.13]} material={FRAME_MAT}>
        <boxGeometry args={[0.24, 0.012, 0.012]} />
      </mesh>
      <mesh position={[0, 0.15, -0.13]} material={FRAME_MAT}>
        <boxGeometry args={[0.24, 0.012, 0.012]} />
      </mesh>
    </group>
  );
}
