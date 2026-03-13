"use client";
import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";
import { FLOWER_GEO, LEAF_GEO } from "./flowerGeometry";

const dummy = new THREE.Object3D();

function seededRandom(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function HangingFlowers({ color }: { color?: string }) {
  const flowerRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const baseColor = useMemo(() => new THREE.Color(color || "#e8a0bf"), [color]);

  const { flowerCount, leafCount, flowerData, leafData } = useMemo(() => {
    const fc = 15;
    const lc = 20;
    const fd: { mat: THREE.Matrix4; col: THREE.Color }[] = [];
    const ld: { mat: THREE.Matrix4 }[] = [];
    const variants = [
      baseColor.clone(),
      baseColor.clone().lerp(new THREE.Color("#FFFFFF"), 0.3),
      baseColor.clone().lerp(new THREE.Color("#000000"), 0.15),
    ];

    for (let i = 0; i < fc; i++) {
      const x = (seededRandom(i) - 0.5) * 0.4;
      const y = -(seededRandom(i + 50) * 0.5);
      const z = (seededRandom(i + 100) - 0.5) * 0.4;
      dummy.position.set(x, y, z);
      const s = 0.025 + seededRandom(i + 150) * 0.015;
      dummy.scale.set(s, s, s);
      dummy.rotation.set(Math.PI + seededRandom(i + 200) * 0.5, 0, 0);
      dummy.updateMatrix();
      fd.push({ mat: dummy.matrix.clone(), col: variants[i % variants.length] });
    }
    for (let i = 0; i < lc; i++) {
      const x = (seededRandom(i + 300) - 0.5) * 0.45;
      const y = -(seededRandom(i + 350) * 0.55);
      const z = (seededRandom(i + 400) - 0.5) * 0.45;
      dummy.position.set(x, y, z);
      dummy.scale.set(0.04, 0.04, 0.04);
      dummy.rotation.set(Math.PI * 0.7, seededRandom(i + 450) * Math.PI, 0);
      dummy.updateMatrix();
      ld.push({ mat: dummy.matrix.clone() });
    }
    return { flowerCount: fc, leafCount: lc, flowerData: fd, leafData: ld };
  }, [baseColor]);

  useEffect(() => {
    if (!flowerRef.current || !leafRef.current) return;
    for (let i = 0; i < flowerCount; i++) {
      flowerRef.current.setMatrixAt(i, flowerData[i].mat);
      flowerRef.current.setColorAt(i, flowerData[i].col);
    }
    for (let i = 0; i < leafCount; i++) {
      leafRef.current.setMatrixAt(i, leafData[i].mat);
    }
    flowerRef.current.instanceMatrix.needsUpdate = true;
    if (flowerRef.current.instanceColor) flowerRef.current.instanceColor.needsUpdate = true;
    leafRef.current.instanceMatrix.needsUpdate = true;
  }, [flowerCount, leafCount, flowerData, leafData]);

  return (
    <group position={[0, 2.5, 0]}>
      {/* Mount ring */}
      <mesh castShadow>
        <torusGeometry args={[0.08, 0.015, 6, 12]} />
        <meshStandardMaterial color="#C4A35A" roughness={0.3} metalness={0.5} />
      </mesh>
      <instancedMesh ref={flowerRef} args={[FLOWER_GEO, undefined, flowerCount]} castShadow>
        <meshStandardMaterial roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={leafRef} args={[LEAF_GEO, undefined, leafCount]} castShadow>
        <meshStandardMaterial color="#4A7A3D" roughness={0.7} />
      </instancedMesh>
    </group>
  );
}
