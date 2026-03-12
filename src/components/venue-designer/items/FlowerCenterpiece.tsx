"use client";
import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import { FLOWER_GEO, LEAF_GEO } from "./flowerGeometry";

const LEAF_MAT = new THREE.MeshStandardMaterial({
  color: "#5a7a47",
  roughness: 0.7,
  metalness: 0,
  side: THREE.DoubleSide,
});

const STEM_MAT = new THREE.MeshStandardMaterial({
  color: "#3d5a2e",
  roughness: 0.8,
  metalness: 0,
});

const dummy = new THREE.Object3D();
const _color = new THREE.Color();

export function FlowerCenterpiece({ color = "#d4899e" }: { color?: string }) {
  const bloomRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);

  const { bloomMat, bloomData, leafData } = useMemo(() => {
    const base = new THREE.Color(color);
    const lighter = base.clone().lerp(new THREE.Color("#ffffff"), 0.35);
    const deeper = base.clone().lerp(new THREE.Color("#4a1028"), 0.25);

    const colors = [base, lighter, deeper];
    const blooms: { pos: [number, number, number]; color: THREE.Color; s: number }[] = [
      { pos: [0, 0.12, 0], color: base, s: 0.08 },
      { pos: [0.1, 0.10, 0.06], color: lighter, s: 0.07 },
      { pos: [-0.08, 0.11, 0.08], color: deeper, s: 0.065 },
      { pos: [0.06, 0.10, -0.1], color: lighter, s: 0.07 },
      { pos: [-0.1, 0.10, -0.06], color: base, s: 0.065 },
      { pos: [0.12, 0.09, -0.04], color: deeper, s: 0.055 },
      { pos: [-0.12, 0.09, 0.02], color: lighter, s: 0.06 },
      { pos: [0, 0.10, 0.12], color: base, s: 0.06 },
      { pos: [0, 0.10, -0.12], color: lighter, s: 0.055 },
      { pos: [0.08, 0.11, 0.1], color: deeper, s: 0.055 },
      { pos: [-0.06, 0.10, -0.11], color: colors[0], s: 0.06 },
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

    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.5,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    return { bloomMat: mat, bloomData: blooms, leafData: leaves };
  }, [color]);

  useEffect(() => {
    if (!bloomRef.current) return;
    for (let i = 0; i < bloomData.length; i++) {
      const b = bloomData[i];
      dummy.position.set(...b.pos);
      dummy.scale.setScalar(b.s);
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.3,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.3
      );
      dummy.updateMatrix();
      bloomRef.current.setMatrixAt(i, dummy.matrix);
      bloomRef.current.setColorAt(i, b.color);
    }
    bloomRef.current.instanceMatrix.needsUpdate = true;
    if (bloomRef.current.instanceColor) bloomRef.current.instanceColor.needsUpdate = true;
  }, [bloomData]);

  useEffect(() => {
    if (!leafRef.current) return;
    for (let i = 0; i < leafData.length; i++) {
      const l = leafData[i];
      dummy.position.set(...l.pos);
      dummy.rotation.set(...l.rot);
      dummy.scale.set(0.06, 0.03, 1);
      dummy.updateMatrix();
      leafRef.current.setMatrixAt(i, dummy.matrix);
    }
    leafRef.current.instanceMatrix.needsUpdate = true;
  }, [leafData]);

  return (
    <group>
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.16, 0.12, 0.06, 12]} />
        <meshStandardMaterial color="#C4A35A" roughness={0.4} metalness={0.5} />
      </mesh>

      <mesh position={[0, 0.07, 0]} material={STEM_MAT} castShadow>
        <sphereGeometry args={[0.14, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
      </mesh>

      <instancedMesh ref={bloomRef} args={[FLOWER_GEO, bloomMat, bloomData.length]} castShadow />
      <instancedMesh ref={leafRef} args={[LEAF_GEO, LEAF_MAT, leafData.length]} castShadow />
    </group>
  );
}
