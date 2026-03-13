"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const FRAME_MAT = new THREE.MeshStandardMaterial({
  color: "#F5F0EB",
  roughness: 0.8,
  metalness: 0,
});

const LEAF_COLOR = new THREE.Color("#4A7A3D");
const COLS = 12;
const ROWS = 10;
const FLOWER_COUNT = COLS * ROWS;
const LEAF_COUNT = Math.floor(FLOWER_COUNT * 0.4);

export function FlowerWall({ color }: { color?: string }) {
  const flowerColor = useMemo(() => new THREE.Color(color || "#e8a0bf"), [color]);

  const flowerRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);

  useEffect(() => {
    const mesh = flowerRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const colorAttr = new Float32Array(FLOWER_COUNT * 3);

    let idx = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = (c / (COLS - 1) - 0.5) * 1.3;
        const y = 0.15 + (r / (ROWS - 1)) * 1.5;
        const z = (Math.random() - 0.5) * 0.06;
        dummy.position.set(x, y, z);
        const s = 0.035 + Math.random() * 0.02;
        dummy.scale.setScalar(s);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
        const variation = 0.85 + Math.random() * 0.3;
        colorAttr[idx * 3] = Math.min(1, flowerColor.r * variation);
        colorAttr[idx * 3 + 1] = Math.min(1, flowerColor.g * variation);
        colorAttr[idx * 3 + 2] = Math.min(1, flowerColor.b * variation);
        idx++;
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colorAttr, 3));
  }, [flowerColor]);

  useEffect(() => {
    const mesh = leafRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const colorAttr = new Float32Array(LEAF_COUNT * 3);

    for (let i = 0; i < LEAF_COUNT; i++) {
      const x = (Math.random() - 0.5) * 1.3;
      const y = 0.15 + Math.random() * 1.5;
      const z = (Math.random() - 0.5) * 0.08 - 0.01;
      dummy.position.set(x, y, z);
      dummy.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
      dummy.scale.setScalar(0.02 + Math.random() * 0.015);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const v = 0.8 + Math.random() * 0.4;
      colorAttr[i * 3] = LEAF_COLOR.r * v;
      colorAttr[i * 3 + 1] = LEAF_COLOR.g * v;
      colorAttr[i * 3 + 2] = LEAF_COLOR.b * v;
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.geometry.setAttribute("color", new THREE.InstancedBufferAttribute(colorAttr, 3));
  }, []);

  const flowerGeo = useMemo(() => new THREE.SphereGeometry(1, 6, 6), []);
  const leafGeo = useMemo(() => new THREE.SphereGeometry(1, 4, 4), []);

  const flowerMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.75,
        metalness: 0,
      }),
    []
  );

  const leafMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.8,
        metalness: 0,
      }),
    []
  );

  return (
    <group>
      {/* Back frame panel */}
      <mesh position={[0, 0.9, -0.04]} material={FRAME_MAT} castShadow>
        <boxGeometry args={[1.5, 1.8, 0.03]} />
      </mesh>
      {/* Flowers */}
      <instancedMesh
        ref={flowerRef}
        args={[flowerGeo, flowerMat, FLOWER_COUNT]}
        castShadow
      />
      {/* Leaves filling gaps */}
      <instancedMesh
        ref={leafRef}
        args={[leafGeo, leafMat, LEAF_COUNT]}
      />
    </group>
  );
}
