"use client";
import React, { useMemo, useRef, useEffect, Suspense, Component, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { FLOWER_GEO, LEAF_GEO } from "./flowerGeometry";

const GOLD_FRAME = new THREE.MeshStandardMaterial({ color: "#C4A35A", roughness: 0.3, metalness: 0.7 });
const LEAF_MAT = new THREE.MeshStandardMaterial({ color: "#4a6a38", roughness: 0.7, metalness: 0, side: THREE.DoubleSide });

function seededRandom(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return (s - 1) / 2147483646; };
}

const _obj = new THREE.Object3D();
const _color = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _quat = new THREE.Quaternion();
const _spinQuat = new THREE.Quaternion();

const MODEL_PATH = "/models/square-arch.glb";

class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() { return this.state.hasError ? this.props.fallback : this.props.children; }
}

function GLBModel({ color }: { color: string }) {
  const { scene } = useGLTF(MODEL_PATH);
  const cloned = useMemo(() => {
    const s = scene.clone(true);
    s.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
        if (mat.color) mat.color.lerp(new THREE.Color(color), 0.5);
        mesh.material = mat;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return s;
  }, [scene, color]);
  return <primitive object={cloned} />;
}

function ProceduralFallback({ color }: { color: string }) {
  const bloomRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);

  const W = 2.2;
  const H = 2.6;
  const HW = W / 2;
  const PIPE_R = 0.025;

  const colors = useMemo(() => {
    const c = new THREE.Color(color);
    const lighter = new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.3);
    const deeper = new THREE.Color(color).lerp(new THREE.Color("#4a1028"), 0.25);
    const warm = new THREE.Color(color).lerp(new THREE.Color("#f5d0a0"), 0.35);
    return [c, lighter, deeper, warm];
  }, [color]);

  const { bloomData, leafData } = useMemo(() => {
    const rng = seededRandom(99);
    const blooms: { pos: THREE.Vector3; normal: THREE.Vector3; size: number; colorIdx: number; spin: number }[] = [];
    const leaves: { pos: THREE.Vector3; rot: THREE.Euler; scale: number }[] = [];
    const R = 0.06;

    const placeLine = (sx: number, sy: number, ex: number, ey: number, steps: number) => {
      const dx = ex - sx;
      const dy = ey - sy;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const lx = sx + dx * t;
        const ly = sy + dy * t;
        const linePoint = new THREE.Vector3(lx, ly, 0);
        for (let r = 0; r < 3; r++) {
          const angle = (r / 3) * Math.PI * 2 + (i % 2) * 0.5;
          const bloomPos = new THREE.Vector3(
            lx + Math.cos(angle) * R + (rng() - 0.5) * 0.01,
            ly + Math.sin(angle) * R * 0.5 + (rng() - 0.5) * 0.01,
            Math.sin(angle) * R + (rng() - 0.5) * 0.01
          );
          const outward = new THREE.Vector3().subVectors(bloomPos, linePoint).normalize();
          blooms.push({
            pos: bloomPos,
            normal: outward.length() > 0.01 ? outward : new THREE.Vector3(0, 0, 1),
            size: 0.04 + rng() * 0.018, colorIdx: Math.floor(rng() * 4), spin: rng() * Math.PI * 2,
          });
        }
        if (i % 4 === 0) {
          leaves.push({
            pos: new THREE.Vector3(lx + (rng() - 0.5) * 0.12, ly + (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.12),
            rot: new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * 0.5),
            scale: 0.05 + rng() * 0.025,
          });
        }
      }
    };

    placeLine(-HW, 0, -HW, H, 35);
    placeLine(-HW, H, HW, H, 30);
    placeLine(HW, H, HW, 0, 35);

    for (const [cx, cy] of [[-HW, H], [HW, H], [-HW, 0], [HW, 0]] as [number, number][]) {
      const count = cy > 1 ? 8 : 5;
      const spread = cy > 1 ? 0.12 : 0.09;
      const cornerCenter = new THREE.Vector3(cx, cy, 0);
      for (let j = 0; j < count; j++) {
        const bloomPos = new THREE.Vector3(cx + (rng() - 0.5) * spread, cy + (rng() - 0.5) * spread, (rng() - 0.5) * spread);
        const outward = new THREE.Vector3().subVectors(bloomPos, cornerCenter).normalize();
        blooms.push({
          pos: bloomPos,
          normal: outward.length() > 0.01 ? outward : new THREE.Vector3(0, 0, 1),
          size: 0.04 + rng() * 0.02, colorIdx: Math.floor(rng() * 4), spin: rng() * Math.PI * 2,
        });
      }
    }
    return { bloomData: blooms, leafData: leaves };
  }, [color]);

  useEffect(() => {
    const mesh = bloomRef.current;
    if (!mesh) return;
    for (let i = 0; i < bloomData.length; i++) {
      const b = bloomData[i];
      _quat.setFromUnitVectors(_up, b.normal);
      _spinQuat.setFromAxisAngle(b.normal, b.spin);
      _quat.premultiply(_spinQuat);
      _obj.position.copy(b.pos);
      _obj.quaternion.copy(_quat);
      _obj.scale.setScalar(b.size);
      _obj.updateMatrix();
      mesh.setMatrixAt(i, _obj.matrix);
      mesh.setColorAt(i, _color.copy(colors[b.colorIdx]));
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
      <mesh position={[-HW, H / 2, 0]} material={GOLD_FRAME}>
        <cylinderGeometry args={[PIPE_R, PIPE_R, H, 6]} />
      </mesh>
      <mesh position={[HW, H / 2, 0]} material={GOLD_FRAME}>
        <cylinderGeometry args={[PIPE_R, PIPE_R, H, 6]} />
      </mesh>
      <mesh position={[0, H, 0]} rotation={[0, 0, Math.PI / 2]} material={GOLD_FRAME}>
        <cylinderGeometry args={[PIPE_R, PIPE_R, W, 6]} />
      </mesh>
      {[-HW, HW].map((x, i) => (
        <mesh key={i} position={[x, 0.015, 0]} material={GOLD_FRAME} castShadow>
          <boxGeometry args={[0.1, 0.03, 0.1]} />
        </mesh>
      ))}
      <instancedMesh ref={bloomRef} args={[FLOWER_GEO, bloomMat, bloomData.length]} castShadow />
      <instancedMesh ref={leafRef} args={[LEAF_GEO, LEAF_MAT, leafData.length]} castShadow />
    </group>
  );
}

export function SquareArch({ color = "#e8a0bf" }: { color?: string }) {
  const fallback = <ProceduralFallback color={color} />;
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GLBModel color={color} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
