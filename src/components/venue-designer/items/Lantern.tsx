"use client";
import { useMemo } from "react";
import * as THREE from "three";

export function Lantern({ color = "#C4A35A" }: { color?: string }) {
  const metalMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.65,
      }),
    [color]
  );

  const glassMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: "#fdf6e8",
        transparent: true,
        opacity: 0.3,
        roughness: 0.1,
        metalness: 0,
        transmission: 0.8,
      }),
    []
  );

  const frameEdges: [number, number, number][] = [
    [0.06, 0, 0.06],
    [-0.06, 0, 0.06],
    [0.06, 0, -0.06],
    [-0.06, 0, -0.06],
  ];

  return (
    <group>
      {/* Base plate */}
      <mesh position={[0, 0.01, 0]} material={metalMat} castShadow receiveShadow>
        <boxGeometry args={[0.16, 0.02, 0.16]} />
      </mesh>

      {/* Vertical frame edges */}
      {frameEdges.map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.14, pos[2]]} material={metalMat} castShadow>
          <boxGeometry args={[0.012, 0.24, 0.012]} />
        </mesh>
      ))}

      {/* Glass panels */}
      <mesh position={[0, 0.14, 0]} material={glassMat}>
        <boxGeometry args={[0.11, 0.22, 0.11]} />
      </mesh>

      {/* Top cap */}
      <mesh position={[0, 0.27, 0]} material={metalMat} castShadow>
        <coneGeometry args={[0.09, 0.08, 4]} />
      </mesh>

      {/* Top ring */}
      <mesh position={[0, 0.32, 0]} material={metalMat} castShadow>
        <torusGeometry args={[0.025, 0.006, 6, 12]} />
      </mesh>

      {/* Candle inside */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.02, 0.1, 8]} />
        <meshStandardMaterial color="#FFF8E7" roughness={0.9} />
      </mesh>

      {/* Flame */}
      <mesh position={[0, 0.14, 0]}>
        <sphereGeometry args={[0.012, 8, 6]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FF8C00"
          emissiveIntensity={2}
          roughness={0.2}
        />
      </mesh>

      {/* Warm glow */}
      <pointLight
        position={[0, 0.14, 0]}
        color="#FFAA44"
        intensity={0.5}
        distance={1.5}
        decay={2}
      />
    </group>
  );
}
