"use client";
import { useMemo } from "react";
import * as THREE from "three";

const GOLD = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.7,
});
const STEM_MAT = new THREE.MeshStandardMaterial({
  color: "#3d5a2e",
  roughness: 0.8,
  metalness: 0,
});
const LEAF_MAT = new THREE.MeshStandardMaterial({
  color: "#5a7a47",
  roughness: 0.7,
  metalness: 0,
  side: THREE.DoubleSide,
});

export function TallArrangement({ color = "#c97b92" }: { color?: string }) {
  const flowerMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0 }),
    [color]
  );
  const lighterMat = useMemo(() => {
    const c = new THREE.Color(color);
    c.lerp(new THREE.Color("#ffffff"), 0.3);
    return new THREE.MeshStandardMaterial({
      color: "#" + c.getHexString(),
      roughness: 0.5,
      metalness: 0,
    });
  }, [color]);

  const standProfile = useMemo(() => {
    const pts = [
      new THREE.Vector2(0.12, 0),
      new THREE.Vector2(0.13, 0.02),
      new THREE.Vector2(0.04, 0.10),
      new THREE.Vector2(0.025, 0.40),
      new THREE.Vector2(0.03, 0.70),
      new THREE.Vector2(0.035, 0.72),
      new THREE.Vector2(0.10, 0.74),
      new THREE.Vector2(0.12, 0.76),
    ];
    return new THREE.LatheGeometry(pts, 16);
  }, []);

  const blooms: { pos: [number, number, number]; s: number; light: boolean }[] = [
    { pos: [0, 0.90, 0], s: 0.065, light: false },
    { pos: [0.08, 0.87, 0.06], s: 0.055, light: true },
    { pos: [-0.07, 0.88, 0.05], s: 0.05, light: false },
    { pos: [0.05, 0.86, -0.08], s: 0.06, light: true },
    { pos: [-0.06, 0.87, -0.06], s: 0.055, light: false },
    { pos: [0.1, 0.85, -0.02], s: 0.045, light: true },
    { pos: [-0.1, 0.86, 0], s: 0.05, light: false },
    { pos: [0, 0.85, 0.09], s: 0.048, light: true },
  ];

  const hangingVines: { angle: number; length: number }[] = [
    { angle: 0, length: 0.18 },
    { angle: Math.PI * 0.5, length: 0.22 },
    { angle: Math.PI, length: 0.16 },
    { angle: Math.PI * 1.5, length: 0.20 },
    { angle: Math.PI * 0.25, length: 0.14 },
    { angle: Math.PI * 1.25, length: 0.17 },
  ];

  return (
    <group>
      {/* Stand */}
      <mesh geometry={standProfile} material={GOLD} castShadow receiveShadow />

      {/* Bowl at top */}
      <mesh position={[0, 0.78, 0]} castShadow>
        <sphereGeometry args={[0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
        <meshStandardMaterial color="#3d5a2e" roughness={0.8} />
      </mesh>

      {/* Blooms */}
      {blooms.map((b, i) => {
        const mat = b.light ? lighterMat : flowerMat;
        return (
          <group key={i} position={b.pos}>
            <mesh material={mat} castShadow>
              <sphereGeometry args={[b.s * 0.4, 8, 8]} />
            </mesh>
            {Array.from({ length: 6 }).map((_, pi) => {
              const a = (pi / 6) * Math.PI * 2;
              return (
                <mesh
                  key={pi}
                  position={[Math.cos(a) * b.s * 0.35, 0, Math.sin(a) * b.s * 0.35]}
                  rotation={[0.6, a, 0]}
                  material={mat}
                  castShadow
                >
                  <sphereGeometry args={[b.s * 0.35, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
                </mesh>
              );
            })}
          </group>
        );
      })}

      {/* Hanging greenery */}
      {hangingVines.map((v, i) => {
        const x = Math.cos(v.angle) * 0.11;
        const z = Math.sin(v.angle) * 0.11;
        return (
          <group key={i} position={[x, 0.76, z]}>
            <mesh material={STEM_MAT}>
              <cylinderGeometry args={[0.004, 0.003, v.length, 4]} />
            </mesh>
            <mesh
              position={[0, -v.length * 0.3, 0.01]}
              rotation={[0.3, v.angle, 0]}
              material={LEAF_MAT}
            >
              <planeGeometry args={[0.04, 0.025]} />
            </mesh>
            <mesh
              position={[0, -v.length * 0.6, -0.01]}
              rotation={[-0.2, v.angle, 0]}
              material={LEAF_MAT}
            >
              <planeGeometry args={[0.035, 0.02]} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
