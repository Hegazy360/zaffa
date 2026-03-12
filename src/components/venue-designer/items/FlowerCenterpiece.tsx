"use client";
import { useMemo } from "react";
import * as THREE from "three";

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

function Rose({
  position,
  color,
  size,
}: {
  position: [number, number, number];
  color: string;
  size: number;
}) {
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [color]
  );

  const layers = useMemo(() => {
    const result: { radius: number; y: number; count: number; tilt: number }[] = [];
    result.push({ radius: size * 0.2, y: 0, count: 3, tilt: 0.2 });
    result.push({ radius: size * 0.5, y: -size * 0.05, count: 5, tilt: 0.5 });
    result.push({ radius: size * 0.8, y: -size * 0.1, count: 7, tilt: 0.9 });
    return result;
  }, [size]);

  return (
    <group position={position}>
      <mesh material={mat} castShadow>
        <sphereGeometry args={[size * 0.25, 8, 8]} />
      </mesh>
      {layers.map((layer, li) =>
        Array.from({ length: layer.count }).map((_, pi) => {
          const angle = (pi / layer.count) * Math.PI * 2 + li * 0.4;
          return (
            <mesh
              key={`${li}-${pi}`}
              position={[
                Math.cos(angle) * layer.radius * 0.5,
                layer.y,
                Math.sin(angle) * layer.radius * 0.5,
              ]}
              rotation={[layer.tilt, angle, 0]}
              material={mat}
              castShadow
            >
              <sphereGeometry
                args={[layer.radius * 0.5, 6, 4, 0, Math.PI * 2, 0, Math.PI * 0.5]}
              />
            </mesh>
          );
        })
      )}
    </group>
  );
}

export function FlowerCenterpiece({ color = "#d4899e" }: { color?: string }) {
  const lighterColor = useMemo(() => {
    const c = new THREE.Color(color);
    c.lerp(new THREE.Color("#ffffff"), 0.35);
    return "#" + c.getHexString();
  }, [color]);

  const deeperColor = useMemo(() => {
    const c = new THREE.Color(color);
    c.lerp(new THREE.Color("#4a1028"), 0.25);
    return "#" + c.getHexString();
  }, [color]);

  const blooms: { pos: [number, number, number]; c: string; s: number }[] = [
    { pos: [0, 0.12, 0], c: color, s: 0.08 },
    { pos: [0.1, 0.10, 0.06], c: lighterColor, s: 0.07 },
    { pos: [-0.08, 0.11, 0.08], c: deeperColor, s: 0.065 },
    { pos: [0.06, 0.10, -0.1], c: lighterColor, s: 0.07 },
    { pos: [-0.1, 0.10, -0.06], c: color, s: 0.065 },
    { pos: [0.12, 0.09, -0.04], c: deeperColor, s: 0.055 },
    { pos: [-0.12, 0.09, 0.02], c: lighterColor, s: 0.06 },
    { pos: [0, 0.10, 0.12], c: color, s: 0.06 },
    { pos: [0, 0.10, -0.12], c: lighterColor, s: 0.055 },
    { pos: [0.08, 0.11, 0.1], c: deeperColor, s: 0.055 },
    { pos: [-0.06, 0.10, -0.11], c: color, s: 0.06 },
  ];

  const leaves: { pos: [number, number, number]; rot: [number, number, number] }[] = [
    { pos: [0.14, 0.06, 0], rot: [0, 0, -0.8] },
    { pos: [-0.14, 0.06, 0], rot: [0, Math.PI, 0.8] },
    { pos: [0, 0.06, 0.14], rot: [0.8, 0, 0] },
    { pos: [0, 0.06, -0.14], rot: [-0.8, 0, 0] },
    { pos: [0.1, 0.06, 0.1], rot: [0.5, Math.PI * 0.25, -0.5] },
    { pos: [-0.1, 0.06, 0.1], rot: [0.5, -Math.PI * 0.25, 0.5] },
    { pos: [0.1, 0.06, -0.1], rot: [-0.5, Math.PI * 0.75, -0.5] },
    { pos: [-0.1, 0.06, -0.1], rot: [-0.5, -Math.PI * 0.75, 0.5] },
  ];

  return (
    <group>
      {/* Base bowl */}
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.12, 0.06, 20]} />
        <meshStandardMaterial color="#C4A35A" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* Foam/base greenery mound */}
      <mesh position={[0, 0.07, 0]} material={STEM_MAT} castShadow>
        <sphereGeometry args={[0.14, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      </mesh>

      {/* Flowers */}
      {blooms.map((b, i) => (
        <Rose key={i} position={b.pos} color={b.c} size={b.s} />
      ))}

      {/* Trailing greenery leaves */}
      {leaves.map((l, i) => (
        <mesh key={i} position={l.pos} rotation={l.rot} material={LEAF_MAT} castShadow>
          <planeGeometry args={[0.06, 0.03]} />
        </mesh>
      ))}
    </group>
  );
}
