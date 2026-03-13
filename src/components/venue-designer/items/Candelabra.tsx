"use client";
import * as THREE from "three";

const METAL = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.8,
});
const CANDLE = new THREE.MeshStandardMaterial({
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

export function Candelabra() {
  const armAngles = [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3];

  return (
    <group>
      {/* Base */}
      <mesh position={[0, 0.02, 0]} material={METAL} castShadow>
        <cylinderGeometry args={[0.1, 0.12, 0.04, 16]} />
      </mesh>
      {/* Center stem */}
      <mesh position={[0, 0.3, 0]} material={METAL} castShadow>
        <cylinderGeometry args={[0.02, 0.025, 0.56, 8]} />
      </mesh>
      {/* Center candle */}
      <mesh position={[0, 0.62, 0]} material={CANDLE} castShadow>
        <cylinderGeometry args={[0.025, 0.025, 0.12, 8]} />
      </mesh>
      <mesh position={[0, 0.7, 0]} material={FLAME}>
        <sphereGeometry args={[0.015, 8, 8]} />
      </mesh>

      {/* Arms */}
      {armAngles.map((angle, i) => {
        const x = Math.sin(angle) * 0.15;
        const z = Math.cos(angle) * 0.15;
        return (
          <group key={i}>
            {/* Arm */}
            <mesh position={[x * 0.5, 0.42, z * 0.5]} material={METAL} castShadow>
              <boxGeometry args={[0.02, 0.02, 0.18]} />
            </mesh>
            {/* Cup */}
            <mesh position={[x, 0.44, z]} material={METAL} castShadow>
              <cylinderGeometry args={[0.03, 0.02, 0.04, 8]} />
            </mesh>
            {/* Candle */}
            <mesh position={[x, 0.52, z]} material={CANDLE} castShadow>
              <cylinderGeometry args={[0.02, 0.02, 0.1, 8]} />
            </mesh>
            <mesh position={[x, 0.59, z]} material={FLAME}>
              <sphereGeometry args={[0.012, 8, 8]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
