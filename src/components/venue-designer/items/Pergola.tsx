"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD_MAT = new THREE.MeshStandardMaterial({
  color: "#D4B896",
  roughness: 0.65,
  metalness: 0.05,
});

export function Pergola({ color }: { color?: string }) {
  const fabricMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#F5E6D3",
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    [color]
  );

  const posts: [number, number][] = [
    [-1.0, -0.8],
    [1.0, -0.8],
    [-1.0, 0.8],
    [1.0, 0.8],
  ];

  return (
    <group>
      {/* Posts */}
      {posts.map(([x, z], i) => (
        <mesh key={i} position={[x, 1.3, z]} material={WOOD_MAT} castShadow>
          <boxGeometry args={[0.08, 2.6, 0.08]} />
        </mesh>
      ))}
      {/* Top beams - long sides */}
      <mesh position={[0, 2.62, -0.8]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[2.1, 0.06, 0.08]} />
      </mesh>
      <mesh position={[0, 2.62, 0.8]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[2.1, 0.06, 0.08]} />
      </mesh>
      {/* Top beams - short sides */}
      <mesh position={[-1.0, 2.62, 0]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[0.08, 0.06, 1.68]} />
      </mesh>
      <mesh position={[1.0, 2.62, 0]} material={WOOD_MAT} castShadow>
        <boxGeometry args={[0.08, 0.06, 1.68]} />
      </mesh>
      {/* Cross slats */}
      {[-0.5, 0, 0.5].map((x, i) => (
        <mesh key={`sl${i}`} position={[x, 2.66, 0]} material={WOOD_MAT} castShadow>
          <boxGeometry args={[0.04, 0.03, 1.6]} />
        </mesh>
      ))}
      {/* Draped fabric on top */}
      <mesh position={[0, 2.58, 0]} material={fabricMat} castShadow>
        <boxGeometry args={[1.9, 0.01, 1.5]} />
      </mesh>
    </group>
  );
}
