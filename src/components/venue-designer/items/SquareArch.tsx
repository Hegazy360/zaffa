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

function CascadingVine({
  position,
  length,
  sway,
}: {
  position: [number, number, number];
  length: number;
  sway: number;
}) {
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector3(Math.sin(t * 2.5 + sway) * 0.025, -t * length, Math.cos(t * 3 + sway) * 0.02));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 14, 0.004, 4, false);
  }, [length, sway]);

  return (
    <group position={position}>
      <mesh geometry={geo} material={STEM_MAT} />
      {[1, 2, 3, 4].map((i) => (
        <mesh
          key={i}
          position={[(i % 2 === 0 ? 1 : -1) * 0.02, -i * (length / 5), 0]}
          rotation={[0.15, 0, (i % 2 === 0 ? 1 : -1) * 0.5]}
          material={i % 2 === 0 ? LEAF_MAT : DARK_LEAF_MAT}
        >
          <planeGeometry args={[0.04, 0.025]} />
        </mesh>
      ))}
    </group>
  );
}

export function SquareArch({ color = "#e8a0bf" }: { color?: string }) {
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

  const W = 2.2;
  const H = 2.6;
  const HW = W / 2;
  const PIPE_R = 0.025;
  const R = 0.07;

  const { blooms, greenery, vines } = useMemo(() => {
    const rng = seededRandom(99);
    const bloomArr: { pos: [number, number, number]; color: string; size: number }[] = [];
    const greenArr: { pos: [number, number, number]; rot: [number, number, number]; big: boolean }[] = [];
    const vineArr: { pos: [number, number, number]; len: number; sway: number }[] = [];
    const colors = [color, lighterColor, deeperColor, warmColor];

    const placeAlongLine = (
      startX: number, startY: number, endX: number, endY: number, steps: number
    ) => {
      const dx = endX - startX;
      const dy = endY - startY;
      const isVertical = Math.abs(dx) < 0.01;

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = startX + dx * t;
        const y = startY + dy * t;

        for (let r = 0; r < 5; r++) {
          const angle = (r / 5) * Math.PI * 2 + (i % 2) * 0.35;
          const ox = Math.cos(angle) * R;
          const oz = Math.sin(angle) * R;

          bloomArr.push({
            pos: [
              x + (isVertical ? ox : ox * 0.3) + (rng() - 0.5) * 0.008,
              y + (isVertical ? 0 : Math.sin(angle) * R * 0.5) + (rng() - 0.5) * 0.008,
              oz + (rng() - 0.5) * 0.008,
            ],
            color: colors[Math.floor(rng() * colors.length)],
            size: 0.045 + rng() * 0.02,
          });
        }

        if (i % 3 === 0) {
          greenArr.push({
            pos: [
              x + (rng() - 0.5) * R * 2.5,
              y + (rng() - 0.5) * R * 2,
              (rng() - 0.5) * R * 2.5,
            ],
            rot: [rng() * Math.PI, rng() * Math.PI, rng() * 0.5],
            big: rng() > 0.4,
          });
        }
      }
    };

    placeAlongLine(-HW, 0, -HW, H, 60);
    placeAlongLine(-HW, H, HW, H, 55);
    placeAlongLine(HW, H, HW, 0, 60);

    for (const [cx, cy] of [[-HW, H], [HW, H], [-HW, 0], [HW, 0]] as [number, number][]) {
      const isTop = cy > 1;
      const count = isTop ? 18 : 12;
      const spread = isTop ? 0.15 : 0.11;
      for (let j = 0; j < count; j++) {
        bloomArr.push({
          pos: [
            cx + (rng() - 0.5) * spread,
            cy + (rng() - 0.5) * spread,
            (rng() - 0.5) * spread,
          ],
          color: colors[Math.floor(rng() * colors.length)],
          size: isTop ? 0.05 + rng() * 0.025 : 0.04 + rng() * 0.02,
        });
      }
    }

    for (const cx of [-HW, HW]) {
      for (let v = 0; v < 5; v++) {
        vineArr.push({
          pos: [cx + (rng() - 0.5) * 0.12, H - 0.05 - rng() * 0.15, (rng() - 0.5) * 0.1],
          len: 0.3 + rng() * 0.5,
          sway: rng() * Math.PI * 2,
        });
      }
    }
    for (let v = 0; v < 8; v++) {
      vineArr.push({
        pos: [-HW + rng() * W, H - 0.03, (rng() - 0.5) * 0.08],
        len: 0.15 + rng() * 0.35,
        sway: rng() * Math.PI * 2,
      });
    }

    return { blooms: bloomArr, greenery: greenArr, vines: vineArr };
  }, [color, lighterColor, deeperColor, warmColor]);

  return (
    <group>
      <mesh position={[-HW, H / 2, 0]} material={GOLD_FRAME}>
        <cylinderGeometry args={[PIPE_R, PIPE_R, H, 8]} />
      </mesh>
      <mesh position={[HW, H / 2, 0]} material={GOLD_FRAME}>
        <cylinderGeometry args={[PIPE_R, PIPE_R, H, 8]} />
      </mesh>
      <mesh position={[0, H, 0]} rotation={[0, 0, Math.PI / 2]} material={GOLD_FRAME}>
        <cylinderGeometry args={[PIPE_R, PIPE_R, W, 8]} />
      </mesh>

      {[-HW, HW].map((x, i) => (
        <mesh key={i} position={[x, 0.015, 0]} material={GOLD_FRAME} castShadow receiveShadow>
          <boxGeometry args={[0.12, 0.03, 0.12]} />
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
          <planeGeometry args={g.big ? [0.065, 0.035] : [0.045, 0.022]} />
        </mesh>
      ))}

      {vines.map((v, i) => (
        <CascadingVine key={i} position={v.pos} length={v.len} sway={v.sway} />
      ))}
    </group>
  );
}
