"use client";
import * as THREE from "three";

const WAX = new THREE.MeshStandardMaterial({
  color: "#FFF8E7",
  roughness: 0.8,
  metalness: 0,
});
const FLAME = new THREE.MeshStandardMaterial({
  color: "#FFD700",
  emissive: "#FF8C00",
  emissiveIntensity: 3,
  roughness: 0.3,
  metalness: 0,
});

interface CandleDef {
  x: number;
  z: number;
  height: number;
  radius: number;
}

const candles: CandleDef[] = [
  { x: 0, z: 0, height: 0.2, radius: 0.035 },
  { x: 0.08, z: 0.04, height: 0.15, radius: 0.025 },
  { x: -0.06, z: 0.06, height: 0.18, radius: 0.03 },
  { x: 0.05, z: -0.06, height: 0.12, radius: 0.028 },
  { x: -0.07, z: -0.04, height: 0.16, radius: 0.032 },
];

export function CandleCluster() {
  return (
    <group>
      {/* Tray */}
      <mesh position={[0, 0.01, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.18, 0.02, 24]} />
        <meshStandardMaterial color="#C4A35A" roughness={0.4} metalness={0.6} />
      </mesh>

      {candles.map((c, i) => (
        <group key={i}>
          <mesh
            position={[c.x, c.height / 2 + 0.02, c.z]}
            material={WAX}
            castShadow
          >
            <cylinderGeometry args={[c.radius, c.radius, c.height, 12]} />
          </mesh>
          <mesh
            position={[c.x, c.height + 0.04, c.z]}
            material={FLAME}
          >
            <sphereGeometry args={[0.01, 8, 8]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
