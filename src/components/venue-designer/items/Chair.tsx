"use client";
import { useMemo } from "react";
import * as THREE from "three";

const FRAME_MAT = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.4,
  metalness: 0.35,
});

export function Chair({ color }: { color?: string }) {
  const cushionMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#F5F0EB",
        roughness: 0.85,
        metalness: 0,
      }),
    [color]
  );

  const legPositions: [number, number][] = [
    [-0.14, -0.14],
    [0.14, -0.14],
    [-0.14, 0.14],
    [0.14, 0.14],
  ];

  const backSlats = useMemo(() => {
    const slats: { x: number; height: number }[] = [];
    const count = 5;
    for (let i = 0; i < count; i++) {
      const t = (i / (count - 1)) * 2 - 1;
      const x = t * 0.12;
      const height = 0.38 - Math.abs(t) * 0.06;
      slats.push({ x, height });
    }
    return slats;
  }, []);

  return (
    <group>
      {/* Legs with slight taper */}
      {legPositions.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22, z]} material={FRAME_MAT} castShadow>
          <cylinderGeometry args={[0.012, 0.016, 0.44, 8]} />
        </mesh>
      ))}

      {/* Front cross bar */}
      <mesh position={[0, 0.12, 0.14]} rotation={[0, 0, 0]} material={FRAME_MAT} castShadow>
        <boxGeometry args={[0.26, 0.015, 0.015]} />
      </mesh>
      {/* Side cross bars */}
      <mesh position={[-0.14, 0.12, 0]} material={FRAME_MAT} castShadow>
        <boxGeometry args={[0.015, 0.015, 0.26]} />
      </mesh>
      <mesh position={[0.14, 0.12, 0]} material={FRAME_MAT} castShadow>
        <boxGeometry args={[0.015, 0.015, 0.26]} />
      </mesh>

      {/* Seat frame */}
      <mesh position={[0, 0.44, 0]} material={FRAME_MAT} castShadow receiveShadow>
        <boxGeometry args={[0.34, 0.025, 0.34]} />
      </mesh>

      {/* Cushion */}
      <mesh position={[0, 0.465, 0]} material={cushionMat} castShadow receiveShadow>
        <boxGeometry args={[0.30, 0.025, 0.30]} />
      </mesh>

      {/* Back frame - top rail (slightly curved via wider box) */}
      <mesh position={[0, 0.88, -0.14]} material={FRAME_MAT} castShadow>
        <boxGeometry args={[0.30, 0.025, 0.02]} />
      </mesh>

      {/* Back vertical slats with varying heights */}
      {backSlats.map((slat, i) => (
        <mesh
          key={i}
          position={[slat.x, 0.44 + slat.height / 2 + 0.025, -0.14]}
          material={FRAME_MAT}
          castShadow
        >
          <cylinderGeometry args={[0.008, 0.01, slat.height, 6]} />
        </mesh>
      ))}

      {/* Back legs extending upward */}
      <mesh position={[-0.14, 0.66, -0.14]} material={FRAME_MAT} castShadow>
        <cylinderGeometry args={[0.012, 0.014, 0.44, 8]} />
      </mesh>
      <mesh position={[0.14, 0.66, -0.14]} material={FRAME_MAT} castShadow>
        <cylinderGeometry args={[0.012, 0.014, 0.44, 8]} />
      </mesh>
    </group>
  );
}
