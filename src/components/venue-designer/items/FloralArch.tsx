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

const MODEL_PATH = "/models/floral-arch.glb";

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

  const colors = useMemo(() => {
    const c = new THREE.Color(color);
    const lighter = new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.3);
    const deeper = new THREE.Color(color).lerp(new THREE.Color("#4a1028"), 0.25);
    const warm = new THREE.Color(color).lerp(new THREE.Color("#f5d0a0"), 0.35);
    return [c, lighter, deeper, warm];
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
    () => new THREE.TubeGeometry(archCurve, 40, 0.03, 6, false),
    [archCurve]
  );

  const { bloomData, leafData } = useMemo(() => {
    const rng = seededRandom(42);
    const blooms: { pos: THREE.Vector3; normal: THREE.Vector3; size: number; colorIdx: number; spin: number }[] = [];
    const leaves: { pos: THREE.Vector3; rot: THREE.Euler; scale: number }[] = [];

    const steps = 50;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const pt = archCurve.getPoint(t);
      for (let r = 0; r < 3; r++) {
        const angle = (r / 3) * Math.PI * 2 + (i % 2) * 0.5;
        const R = 0.07;
        const bloomPos = new THREE.Vector3(
          pt.x + Math.cos(angle) * R + (rng() - 0.5) * 0.01,
          pt.y + Math.sin(angle) * R * 0.5 + (rng() - 0.5) * 0.01,
          Math.sin(angle) * R + (rng() - 0.5) * 0.01
        );
        const outward = new THREE.Vector3().subVectors(bloomPos, pt).normalize();
        blooms.push({ pos: bloomPos, normal: outward, size: 0.04 + rng() * 0.02, colorIdx: Math.floor(rng() * 4), spin: rng() * Math.PI * 2 });
      }
      if (i % 4 === 0) {
        leaves.push({
          pos: new THREE.Vector3(pt.x + (rng() - 0.5) * 0.15, pt.y + (rng() - 0.5) * 0.1, (rng() - 0.5) * 0.15),
          rot: new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * 0.5),
          scale: 0.05 + rng() * 0.03,
        });
      }
    }

    for (const s of [-1, 1]) {
      const basePt = archCurve.getPoint(s === -1 ? 0 : 1);
      for (let j = 0; j < 10; j++) {
        const bloomPos = new THREE.Vector3(basePt.x + (rng() - 0.5) * 0.18, basePt.y + rng() * 0.2, (rng() - 0.5) * 0.15);
        const outward = new THREE.Vector3().subVectors(bloomPos, basePt).normalize();
        blooms.push({
          pos: bloomPos,
          normal: outward.length() > 0.01 ? outward : new THREE.Vector3(s, 0.5, 0).normalize(),
          size: 0.04 + rng() * 0.025, colorIdx: Math.floor(rng() * 4), spin: rng() * Math.PI * 2,
        });
      }
    }
    return { bloomData: blooms, leafData: leaves };
  }, [archCurve]);

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
      <mesh geometry={archFrameGeo} material={GOLD_FRAME} castShadow />
      {[-1.1, 1.1].map((x, i) => (
        <mesh key={i} position={[x, 0.04, 0]} material={GOLD_FRAME} castShadow>
          <cylinderGeometry args={[0.05, 0.07, 0.08, 8]} />
        </mesh>
      ))}
      <instancedMesh ref={bloomRef} args={[FLOWER_GEO, bloomMat, bloomData.length]} castShadow />
      <instancedMesh ref={leafRef} args={[LEAF_GEO, LEAF_MAT, leafData.length]} castShadow />
    </group>
  );
}

export function FloralArch({ color = "#e8a0bf" }: { color?: string }) {
  const fallback = <ProceduralFallback color={color} />;
  return (
    <ModelErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GLBModel color={color} />
      </Suspense>
    </ModelErrorBoundary>
  );
}
