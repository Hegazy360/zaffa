"use client";
import { useMemo } from "react";
import * as THREE from "three";

const GOLD_FRAME = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.7,
});
const LEAF_MAT = new THREE.MeshStandardMaterial({
  color: "#5a7a47",
  roughness: 0.7,
  metalness: 0,
  side: THREE.DoubleSide,
});
const DARK_LEAF_MAT = new THREE.MeshStandardMaterial({
  color: "#3d5a2e",
  roughness: 0.75,
  metalness: 0,
  side: THREE.DoubleSide,
});
const STEM_MAT = new THREE.MeshStandardMaterial({
  color: "#3a5028",
  roughness: 0.8,
  metalness: 0,
});

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function RoseBloom({
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
        roughness: 0.45,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [color]
  );

  return (
    <group position={position}>
      <mesh material={mat} castShadow>
        <sphereGeometry args={[size * 0.4, 8, 8]} />
      </mesh>
      {Array.from({ length: 6 }).map((_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * size * 0.3, 0, Math.sin(a) * size * 0.3]}
            rotation={[0.5, a, 0]}
            material={mat}
            castShadow
          >
            <sphereGeometry args={[size * 0.35, 6, 5, 0, Math.PI * 2, 0, Math.PI * 0.6]} />
          </mesh>
        );
      })}
    </group>
  );
}

function HangingVine({
  position,
  length,
  angle,
}: {
  position: [number, number, number];
  length: number;
  angle: number;
}) {
  const vineGeo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      pts.push(new THREE.Vector3(Math.sin(t * 2) * 0.02, -t * length, Math.cos(t * 3) * 0.015));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.004, 4, false);
  }, [length]);

  return (
    <group position={position} rotation={[0, angle, 0]}>
      <mesh geometry={vineGeo} material={STEM_MAT} />
      {[1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[(i % 2 === 0 ? 1 : -1) * 0.02, -i * (length / 5), 0]}
          rotation={[0.2, 0, (i % 2 === 0 ? 1 : -1) * 0.6]}
          material={i % 2 === 0 ? LEAF_MAT : DARK_LEAF_MAT}
        >
          <planeGeometry args={[0.04, 0.025]} />
        </mesh>
      ))}
    </group>
  );
}

export function FloralArch({ color = "#e8a0bf" }: { color?: string }) {
  const lighterColor = useMemo(() => {
    const c = new THREE.Color(color);
    c.lerp(new THREE.Color("#ffffff"), 0.3);
    return "#" + c.getHexString();
  }, [color]);

  const deeperColor = useMemo(() => {
    const c = new THREE.Color(color);
    c.lerp(new THREE.Color("#4a1028"), 0.25);
    return "#" + c.getHexString();
  }, [color]);

  const warmColor = useMemo(() => {
    const c = new THREE.Color(color);
    c.lerp(new THREE.Color("#f5d0a0"), 0.35);
    return "#" + c.getHexString();
  }, [color]);

  const archCurve = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      const a = Math.PI * t;
      pts.push(new THREE.Vector3(Math.cos(a) * 1.1, Math.sin(a) * 2.3 + 0.1, 0));
    }
    return new THREE.CatmullRomCurve3(pts);
  }, []);

  const archFrameGeo = useMemo(
    () => new THREE.TubeGeometry(archCurve, 56, 0.03, 8, false),
    [archCurve]
  );

  const R = 0.08;

  const { blooms, greenery, vines } = useMemo(() => {
    const rng = seededRandom(42);
    const bloomArr: { pos: [number, number, number]; color: string; size: number }[] = [];
    const greenArr: { pos: [number, number, number]; rot: [number, number, number]; big: boolean }[] = [];
    const vineArr: { pos: [number, number, number]; len: number; ang: number }[] = [];
    const colors = [color, lighterColor, deeperColor, warmColor];

    const steps = 90;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pt = archCurve.getPoint(t);
      const tangent = archCurve.getTangent(t);
      const up = new THREE.Vector3(0, 0, 1);
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const outward = new THREE.Vector3().crossVectors(side, tangent).normalize();

      for (let r = 0; r < 5; r++) {
        const angle = (r / 5) * Math.PI * 2 + (i % 2) * 0.35;
        const offY = outward.y * Math.cos(angle) * R + side.y * Math.sin(angle) * R;
        const offX = outward.x * Math.cos(angle) * R + side.x * Math.sin(angle) * R;
        const offZ = Math.sin(angle) * R;

        bloomArr.push({
          pos: [pt.x + offX + (rng() - 0.5) * 0.008, pt.y + offY + (rng() - 0.5) * 0.008, offZ + (rng() - 0.5) * 0.008],
          color: colors[Math.floor(rng() * colors.length)],
          size: 0.05 + rng() * 0.02,
        });
      }

      if (i % 3 === 0) {
        greenArr.push({
          pos: [
            pt.x + (rng() - 0.5) * R * 2.5,
            pt.y + (rng() - 0.5) * R * 2,
            (rng() - 0.5) * R * 2.5,
          ],
          rot: [rng() * Math.PI, rng() * Math.PI, rng() * 0.5],
          big: rng() > 0.4,
        });
      }
    }

    for (const s of [-1, 1]) {
      const basePt = archCurve.getPoint(s === -1 ? 0 : 1);
      for (let j = 0; j < 18; j++) {
        bloomArr.push({
          pos: [
            basePt.x + (rng() - 0.5) * 0.2,
            basePt.y + rng() * 0.25,
            (rng() - 0.5) * 0.18,
          ],
          color: colors[Math.floor(rng() * colors.length)],
          size: 0.045 + rng() * 0.03,
        });
      }
      for (let v = 0; v < 5; v++) {
        vineArr.push({
          pos: [basePt.x + (rng() - 0.5) * 0.12, 0.15 + rng() * 0.5, (rng() - 0.5) * 0.1],
          len: 0.15 + rng() * 0.35,
          ang: rng() * Math.PI * 2,
        });
      }
    }

    return { blooms: bloomArr, greenery: greenArr, vines: vineArr };
  }, [archCurve, color, lighterColor, deeperColor, warmColor]);

  return (
    <group>
      <mesh geometry={archFrameGeo} material={GOLD_FRAME} />

      {[-1.1, 1.1].map((x, i) => (
        <mesh key={i} position={[x, 0.04, 0]} material={GOLD_FRAME} castShadow>
          <cylinderGeometry args={[0.05, 0.07, 0.08, 10]} />
        </mesh>
      ))}

      {blooms.map((b, i) => (
        <RoseBloom key={i} position={b.pos} color={b.color} size={b.size} />
      ))}

      {greenery.map((g, i) => (
        <mesh
          key={i}
          position={g.pos}
          rotation={g.rot}
          material={i % 3 === 0 ? DARK_LEAF_MAT : LEAF_MAT}
          castShadow
        >
          <planeGeometry args={g.big ? [0.07, 0.035] : [0.05, 0.025]} />
        </mesh>
      ))}

      {vines.map((v, i) => (
        <HangingVine key={i} position={v.pos} length={v.len} angle={v.ang} />
      ))}
    </group>
  );
}
