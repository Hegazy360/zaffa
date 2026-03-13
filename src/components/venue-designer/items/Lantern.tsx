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
      new THREE.MeshStandardMaterial({
        color: "#FFDDAA",
        transparent: true,
        opacity: 0.35,
        roughness: 0.15,
        metalness: 0,
        emissive: new THREE.Color("#FFAA44"),
        emissiveIntensity: 0.5,
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
      <mesh position={[0, 0.008, 0]} material={metalMat} castShadow receiveShadow>
        <boxGeometry args={[0.16, 0.016, 0.16]} />
      </mesh>
      {/* Foot detail */}
      {[[-0.065, 0.065], [0.065, 0.065], [-0.065, -0.065], [0.065, -0.065]].map(([x, z], i) => (
        <mesh key={`f${i}`} position={[x, 0.003, z]} material={metalMat}>
          <sphereGeometry args={[0.012, 6, 4]} />
        </mesh>
      ))}

      {/* Vertical frame edges */}
      {frameEdges.map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.14, pos[2]]} material={metalMat} castShadow>
          <boxGeometry args={[0.01, 0.24, 0.01]} />
        </mesh>
      ))}

      {/* Glass panels - 4 sides with emissive warm glow */}
      {[[0, 0.06], [0, -0.06], [0.06, 0], [-0.06, 0]].map(([x, z], i) => (
        <mesh
          key={`g${i}`}
          position={[x, 0.14, z]}
          rotation={[0, i < 2 ? 0 : Math.PI / 2, 0]}
          material={glassMat}
        >
          <boxGeometry args={[0.10, 0.22, 0.002]} />
        </mesh>
      ))}

      {/* Top cap */}
      <mesh position={[0, 0.27, 0]} material={metalMat} castShadow>
        <coneGeometry args={[0.085, 0.07, 4]} />
      </mesh>

      {/* Top ring */}
      <mesh position={[0, 0.31, 0]} material={metalMat} castShadow>
        <torusGeometry args={[0.02, 0.005, 6, 12]} />
      </mesh>

      {/* Candle inside */}
      <mesh position={[0, 0.06, 0]} castShadow>
        <cylinderGeometry args={[0.016, 0.018, 0.08, 8]} />
        <meshStandardMaterial color="#FFF8E7" roughness={0.9} />
      </mesh>

      {/* Flame */}
      <mesh position={[0, 0.11, 0]}>
        <sphereGeometry args={[0.01, 8, 6]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FF8C00"
          emissiveIntensity={3}
          roughness={0.2}
        />
      </mesh>
    </group>
  );
}
