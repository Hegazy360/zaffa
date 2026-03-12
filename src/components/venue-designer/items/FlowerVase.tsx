"use client";
import { useMemo } from "react";
import * as THREE from "three";

const CERAMIC = new THREE.MeshStandardMaterial({
  color: "#E8DDD0",
  roughness: 0.5,
  metalness: 0.15,
});
const STEM_MAT = new THREE.MeshStandardMaterial({
  color: "#4a6b3a",
  roughness: 0.8,
  metalness: 0,
});
const LEAF_MAT = new THREE.MeshStandardMaterial({
  color: "#5a7a47",
  roughness: 0.7,
  metalness: 0,
  side: THREE.DoubleSide,
});

function Bloom({
  position,
  color,
  size = 0.06,
}: {
  position: [number, number, number];
  color: string;
  size?: number;
}) {
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0 }),
    [color]
  );
  const petalMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [color]
  );

  const petals = useMemo(() => {
    const arr: { angle: number; tilt: number; s: number }[] = [];
    for (let ring = 0; ring < 2; ring++) {
      const count = ring === 0 ? 5 : 7;
      const tilt = ring === 0 ? 0.4 : 0.8;
      const s = ring === 0 ? size * 0.7 : size * 0.9;
      for (let i = 0; i < count; i++) {
        arr.push({
          angle: (i / count) * Math.PI * 2 + ring * 0.3,
          tilt,
          s,
        });
      }
    }
    return arr;
  }, [size]);

  return (
    <group position={position}>
      {/* Center */}
      <mesh material={mat} castShadow>
        <sphereGeometry args={[size * 0.5, 10, 10]} />
      </mesh>
      {/* Petals */}
      {petals.map((p, i) => (
        <mesh
          key={i}
          position={[
            Math.cos(p.angle) * size * 0.4 * (1 + p.tilt * 0.3),
            p.tilt * size * 0.2,
            Math.sin(p.angle) * size * 0.4 * (1 + p.tilt * 0.3),
          ]}
          rotation={[p.tilt, p.angle, 0]}
          material={petalMat}
          castShadow
        >
          <sphereGeometry args={[p.s, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
        </mesh>
      ))}
    </group>
  );
}

function LeafSprig({ position, angle }: { position: [number, number, number]; angle: number }) {
  return (
    <group position={position} rotation={[0.3, angle, 0.2]}>
      <mesh material={STEM_MAT}>
        <cylinderGeometry args={[0.004, 0.006, 0.15, 4]} />
      </mesh>
      <mesh position={[0, 0.06, 0.01]} rotation={[0.4, 0, 0.2]} material={LEAF_MAT}>
        <planeGeometry args={[0.05, 0.03]} />
      </mesh>
      <mesh position={[0, 0.03, -0.01]} rotation={[-0.3, 0, -0.2]} material={LEAF_MAT}>
        <planeGeometry args={[0.04, 0.025]} />
      </mesh>
    </group>
  );
}

export function FlowerVase({ color = "#e8a0bf" }: { color?: string }) {
  const vaseProfile = useMemo(() => {
    const pts = [
      new THREE.Vector2(0.08, 0),
      new THREE.Vector2(0.09, 0.02),
      new THREE.Vector2(0.10, 0.06),
      new THREE.Vector2(0.08, 0.14),
      new THREE.Vector2(0.055, 0.22),
      new THREE.Vector2(0.05, 0.26),
      new THREE.Vector2(0.055, 0.30),
      new THREE.Vector2(0.06, 0.32),
      new THREE.Vector2(0.065, 0.33),
    ];
    return new THREE.LatheGeometry(pts, 24);
  }, []);

  const lighterColor = useMemo(() => {
    const c = new THREE.Color(color);
    c.lerp(new THREE.Color("#ffffff"), 0.3);
    return "#" + c.getHexString();
  }, [color]);

  const blooms: { pos: [number, number, number]; c: string; s: number }[] = [
    { pos: [0, 0.42, 0], c: color, s: 0.07 },
    { pos: [0.08, 0.40, 0.06], c: lighterColor, s: 0.06 },
    { pos: [-0.07, 0.41, 0.05], c: color, s: 0.055 },
    { pos: [0.05, 0.39, -0.08], c: lighterColor, s: 0.065 },
    { pos: [-0.06, 0.40, -0.06], c: color, s: 0.06 },
    { pos: [0.1, 0.38, -0.02], c: lighterColor, s: 0.05 },
    { pos: [-0.1, 0.39, 0], c: color, s: 0.055 },
    { pos: [0, 0.38, 0.09], c: lighterColor, s: 0.05 },
    { pos: [0, 0.39, -0.1], c: color, s: 0.048 },
  ];

  const stems: { angle: number }[] = [
    { angle: 0 },
    { angle: Math.PI * 0.4 },
    { angle: Math.PI * 0.8 },
    { angle: Math.PI * 1.2 },
    { angle: Math.PI * 1.6 },
  ];

  const leaves: { pos: [number, number, number]; angle: number }[] = [
    { pos: [0.08, 0.35, 0.08], angle: 0.5 },
    { pos: [-0.09, 0.36, 0.04], angle: 2.2 },
    { pos: [0.06, 0.34, -0.09], angle: 4.0 },
    { pos: [-0.05, 0.36, -0.07], angle: 5.5 },
    { pos: [0.1, 0.33, 0], angle: 1.2 },
    { pos: [-0.1, 0.34, -0.02], angle: 3.5 },
  ];

  return (
    <group>
      {/* Vase */}
      <mesh geometry={vaseProfile} material={CERAMIC} castShadow receiveShadow />

      {/* Stems */}
      {stems.map((s, i) => {
        const x = Math.cos(s.angle) * 0.03;
        const z = Math.sin(s.angle) * 0.03;
        return (
          <mesh
            key={i}
            position={[x, 0.34, z]}
            rotation={[Math.sin(s.angle) * 0.15, 0, Math.cos(s.angle) * 0.15]}
            material={STEM_MAT}
            castShadow
          >
            <cylinderGeometry args={[0.005, 0.006, 0.12, 4]} />
          </mesh>
        );
      })}

      {/* Blooms */}
      {blooms.map((b, i) => (
        <Bloom key={i} position={b.pos} color={b.c} size={b.s} />
      ))}

      {/* Greenery */}
      {leaves.map((l, i) => (
        <LeafSprig key={i} position={l.pos} angle={l.angle} />
      ))}
    </group>
  );
}
