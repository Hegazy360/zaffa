"use client";
import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { FLOWER_GEO, LEAF_GEO } from "./flowerGeometry";

const GOLD = new THREE.MeshStandardMaterial({ color: "#C4A35A", roughness: 0.3, metalness: 0.7 });
const LEAF = new THREE.MeshStandardMaterial({ color: "#4a6a38", roughness: 0.7, metalness: 0, side: THREE.DoubleSide });

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
}

const _obj = new THREE.Object3D();
const _color = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

const W = 2.2;
const H = 2.6;
const HW = W / 2;
const PIPE = 0.025;
const PILLAR_H = H * 0.75;
const ARC_RISE = H - PILLAR_H;

function ArchInner({ color = "#e8a0bf", isRound }: { color: string; isRound: boolean }) {
  const bloomRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);

  const colors = useMemo(() => {
    const c = new THREE.Color(color);
    return [
      c,
      new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.3),
      new THREE.Color(color).lerp(new THREE.Color("#4a1028"), 0.25),
      new THREE.Color(color).lerp(new THREE.Color("#f5d0a0"), 0.35),
    ];
  }, [color]);

  const topCurveGeo = useMemo(() => {
    if (!isRound) return null;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const a = Math.PI * t;
      pts.push(new THREE.Vector3(Math.cos(a) * HW, PILLAR_H + Math.sin(a) * ARC_RISE, 0));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 24, PIPE, 6, false);
  }, [isRound]);

  const { bloomData, leafData } = useMemo(() => {
    const rng = seededRandom(42);
    const blooms: { pos: THREE.Vector3; normal: THREE.Vector3; size: number; ci: number; spin: number }[] = [];
    const leaves: { pos: THREE.Vector3; rot: THREE.Euler; scale: number }[] = [];

    const addFlower = (pos: THREE.Vector3, center: THREE.Vector3) => {
      const outward = new THREE.Vector3().subVectors(pos, center);
      if (outward.length() < 0.001) outward.set(0, 0, 1);
      outward.normalize();
      blooms.push({ pos, normal: outward, size: 0.035 + rng() * 0.02, ci: Math.floor(rng() * 4), spin: rng() * Math.PI * 2 });
    };

    const addLeaf = (pos: THREE.Vector3) => {
      leaves.push({ pos, rot: new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * 0.5), scale: 0.04 + rng() * 0.03 });
    };

    const placeAlongLine = (sx: number, sy: number, ex: number, ey: number, steps: number) => {
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = sx + (ex - sx) * t;
        const y = sy + (ey - sy) * t;
        const center = new THREE.Vector3(x, y, 0);
        const R = 0.06;
        for (let r = 0; r < 3; r++) {
          const a = (r / 3) * Math.PI * 2 + (i % 2) * 0.5;
          addFlower(
            new THREE.Vector3(x + Math.cos(a) * R + (rng() - 0.5) * 0.01, y + Math.sin(a) * R * 0.5 + (rng() - 0.5) * 0.01, Math.sin(a) * R + (rng() - 0.5) * 0.01),
            center
          );
        }
        if (i % 5 === 0) addLeaf(new THREE.Vector3(x + (rng() - 0.5) * 0.12, y + (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.12));
      }
    };

    // Both variants: flowers on the two pillars
    placeAlongLine(-HW, 0, -HW, PILLAR_H, 25);
    placeAlongLine(HW, PILLAR_H, HW, 0, 25);

    if (isRound) {
      // Flowers along the curved top
      for (let i = 0; i <= 25; i++) {
        const t = i / 25;
        const a = Math.PI * t;
        const cx = Math.cos(a) * HW;
        const cy = PILLAR_H + Math.sin(a) * ARC_RISE;
        const center = new THREE.Vector3(cx, cy, 0);
        const R = 0.06;
        for (let r = 0; r < 3; r++) {
          const fa = (r / 3) * Math.PI * 2 + (i % 2) * 0.5;
          addFlower(
            new THREE.Vector3(cx + Math.cos(fa) * R + (rng() - 0.5) * 0.01, cy + Math.sin(fa) * R * 0.5 + (rng() - 0.5) * 0.01, Math.sin(fa) * R + (rng() - 0.5) * 0.01),
            center
          );
        }
        if (i % 5 === 0) addLeaf(new THREE.Vector3(cx + (rng() - 0.5) * 0.12, cy + (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.12));
      }
    } else {
      // Flowers along the straight beam
      placeAlongLine(-HW, H, HW, H, 25);
      // Corner clusters
      for (const [cx, cy] of [[-HW, H], [HW, H]] as [number, number][]) {
        const cc = new THREE.Vector3(cx, cy, 0);
        for (let j = 0; j < 6; j++) {
          addFlower(new THREE.Vector3(cx + (rng() - 0.5) * 0.1, cy + (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.1), cc);
        }
      }
    }

    return { bloomData: blooms, leafData: leaves };
  }, [isRound]);

  useEffect(() => {
    const mesh = bloomRef.current;
    if (!mesh) return;
    for (let i = 0; i < bloomData.length; i++) {
      const b = bloomData[i];
      _q1.setFromUnitVectors(_up, b.normal);
      _q2.setFromAxisAngle(b.normal, b.spin);
      _q1.premultiply(_q2);
      _obj.position.copy(b.pos);
      _obj.quaternion.copy(_q1);
      _obj.scale.setScalar(b.size);
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);
      mesh.setColorAt(i, _color.copy(colors[b.ci]));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [bloomData, colors]);

  useEffect(() => {
    const mesh = leafRef.current;
    if (!mesh) return;
    for (let i = 0; i < leafData.length; i++) {
      const l = leafData[i];
      _obj.position.copy(l.pos);
      _obj.rotation.copy(l.rot);
      _obj.scale.setScalar(l.scale);
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }, [leafData]);

  const bloomMat = useMemo(() => new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0 }), []);

  return (
    <group>
      {/* Pillars (always present) */}
      <mesh position={[-HW, PILLAR_H / 2, 0]} material={GOLD} castShadow>
        <cylinderGeometry args={[PIPE, PIPE, PILLAR_H, 6]} />
      </mesh>
      <mesh position={[HW, PILLAR_H / 2, 0]} material={GOLD} castShadow>
        <cylinderGeometry args={[PIPE, PIPE, PILLAR_H, 6]} />
      </mesh>
      {/* Base feet */}
      {[-HW, HW].map((x, i) => (
        <mesh key={i} position={[x, 0.015, 0]} material={GOLD} castShadow>
          <boxGeometry args={[0.1, 0.03, 0.1]} />
        </mesh>
      ))}

      {isRound && topCurveGeo ? (
        <mesh geometry={topCurveGeo} material={GOLD} castShadow />
      ) : (
        <>
          {/* Straight beam + vertical extensions to H */}
          <mesh position={[-HW, (PILLAR_H + H) / 2, 0]} material={GOLD}>
            <cylinderGeometry args={[PIPE, PIPE, H - PILLAR_H, 6]} />
          </mesh>
          <mesh position={[HW, (PILLAR_H + H) / 2, 0]} material={GOLD}>
            <cylinderGeometry args={[PIPE, PIPE, H - PILLAR_H, 6]} />
          </mesh>
          <mesh position={[0, H, 0]} rotation={[0, 0, Math.PI / 2]} material={GOLD}>
            <cylinderGeometry args={[PIPE, PIPE, W, 6]} />
          </mesh>
        </>
      )}

      <instancedMesh ref={bloomRef} args={[FLOWER_GEO, bloomMat, bloomData.length]} castShadow />
      <instancedMesh ref={leafRef} args={[LEAF_GEO, LEAF, leafData.length]} castShadow />
    </group>
  );
}

export function Arch({ color = "#e8a0bf", variant = "round" }: { color?: string; variant?: string }) {
  const isRound = variant === "round";
  return <ArchInner key={variant} color={color} isRound={isRound} />;
}
