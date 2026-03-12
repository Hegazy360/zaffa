"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WOOD = new THREE.MeshStandardMaterial({
  color: "#8B6914",
  roughness: 0.65,
  metalness: 0.08,
});

export function RectangularTable({ color }: { color?: string }) {
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

  const runnerMat = useMemo(() => {
    const c = new THREE.Color(color || "#FAF0E6");
    c.lerp(new THREE.Color("#C4A35A"), 0.35);
    return new THREE.MeshStandardMaterial({
      color: "#" + c.getHexString(),
      roughness: 0.7,
      metalness: 0.1,
    });
  }, [color]);

  const legPositions: [number, number, number][] = [
    [-0.55, 0.4, -0.3],
    [0.55, 0.4, -0.3],
    [-0.55, 0.4, 0.3],
    [0.55, 0.4, 0.3],
  ];

  return (
    <group>
      {/* Legs */}
      {legPositions.map((pos, i) => (
        <mesh key={i} position={pos} material={WOOD} castShadow>
          <cylinderGeometry args={[0.025, 0.035, 0.78, 8]} />
        </mesh>
      ))}

      {/* Tabletop */}
      <mesh position={[0, 0.80, 0]} material={WOOD} castShadow receiveShadow>
        <boxGeometry args={[1.3, 0.005, 0.75]} />
      </mesh>

      {/* Tablecloth */}
      <mesh position={[0, 0.805, 0]} material={clothMat} castShadow>
        <boxGeometry args={[1.34, 0.002, 0.79]} />
      </mesh>

      {/* Cloth overhang - short drape */}
      <mesh position={[0, 0.74, 0.395]} material={clothMat} castShadow>
        <boxGeometry args={[1.34, 0.12, 0.002]} />
      </mesh>
      <mesh position={[0, 0.74, -0.395]} material={clothMat} castShadow>
        <boxGeometry args={[1.34, 0.12, 0.002]} />
      </mesh>
      <mesh position={[-0.675, 0.74, 0]} material={clothMat} castShadow>
        <boxGeometry args={[0.002, 0.12, 0.79]} />
      </mesh>
      <mesh position={[0.675, 0.74, 0]} material={clothMat} castShadow>
        <boxGeometry args={[0.002, 0.12, 0.79]} />
      </mesh>

      {/* Table runner */}
      <mesh position={[0, 0.808, 0]} material={runnerMat} castShadow>
        <boxGeometry args={[0.25, 0.002, 0.82]} />
      </mesh>
    </group>
  );
}
