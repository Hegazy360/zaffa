"use client";
import { useMemo } from "react";
import * as THREE from "three";

const GOLD_MAT = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.6,
});

const CANDLE_MAT = new THREE.MeshStandardMaterial({
  color: "#FFF8E7",
  roughness: 0.8,
});

const FLAME_MAT = new THREE.MeshStandardMaterial({
  color: "#FFD700",
  emissive: "#FF8C00",
  emissiveIntensity: 3,
  roughness: 0.3,
});

export function Chandelier({ color }: { color?: string }) {
  const crystalMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#F0E8D8",
        roughness: 0.1,
        metalness: 0.3,
        emissive: new THREE.Color(color || "#F0E8D8"),
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.75,
      }),
    [color]
  );

  const armCount = 6;
  const outerR = 0.22;
  const innerR = 0.14;

  return (
    <group position={[0, 2.5, 0]}>
      {/* Chain */}
      <mesh position={[0, 0.18, 0]} material={GOLD_MAT}>
        <cylinderGeometry args={[0.006, 0.006, 0.36, 4]} />
      </mesh>
      {/* Ceiling rosette */}
      <mesh position={[0, 0.37, 0]} material={GOLD_MAT}>
        <cylinderGeometry args={[0.04, 0.05, 0.02, 10]} />
      </mesh>
      {/* Top crown */}
      <mesh position={[0, 0.03, 0]} material={GOLD_MAT} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 0.04, 10]} />
      </mesh>
      {/* Outer ring */}
      <mesh material={GOLD_MAT} castShadow>
        <torusGeometry args={[outerR, 0.012, 6, 20]} />
      </mesh>
      {/* Inner ring */}
      <mesh position={[0, 0.05, 0]} material={GOLD_MAT} castShadow>
        <torusGeometry args={[innerR, 0.008, 6, 16]} />
      </mesh>
      {/* Arms with candles */}
      {Array.from({ length: armCount }).map((_, i) => {
        const angle = (i / armCount) * Math.PI * 2;
        const cx = Math.cos(angle) * outerR;
        const cz = Math.sin(angle) * outerR;
        return (
          <group key={i}>
            {/* Arm bar */}
            <mesh
              position={[Math.cos(angle) * (outerR / 2), 0.025, Math.sin(angle) * (outerR / 2)]}
              rotation={[0, -angle, 0]}
              material={GOLD_MAT}
            >
              <boxGeometry args={[outerR, 0.008, 0.008]} />
            </mesh>
            {/* Candle cup */}
            <mesh position={[cx, 0.01, cz]} material={GOLD_MAT}>
              <cylinderGeometry args={[0.018, 0.012, 0.02, 8]} />
            </mesh>
            {/* Candle */}
            <mesh position={[cx, 0.05, cz]} material={CANDLE_MAT} castShadow>
              <cylinderGeometry args={[0.01, 0.012, 0.06, 6]} />
            </mesh>
            {/* Flame */}
            <mesh position={[cx, 0.085, cz]} material={FLAME_MAT}>
              <sphereGeometry args={[0.008, 6, 6]} />
            </mesh>
          </group>
        );
      })}
      {/* Outer crystal drops */}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return (
          <mesh
            key={`oc${i}`}
            position={[Math.cos(angle) * outerR, -0.05, Math.sin(angle) * outerR]}
            material={crystalMat}
            castShadow
          >
            <coneGeometry args={[0.01, 0.045, 4]} />
          </mesh>
        );
      })}
      {/* Inner crystal drops */}
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i / 6) * Math.PI * 2 + Math.PI / 6;
        return (
          <mesh
            key={`ic${i}`}
            position={[Math.cos(angle) * innerR, -0.02, Math.sin(angle) * innerR]}
            material={crystalMat}
          >
            <coneGeometry args={[0.008, 0.035, 4]} />
          </mesh>
        );
      })}
      {/* Center finial */}
      <mesh position={[0, -0.06, 0]} material={crystalMat} castShadow>
        <coneGeometry args={[0.018, 0.07, 6]} />
      </mesh>
    </group>
  );
}
