"use client";
import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";

const dummy = new THREE.Object3D();
const PETAL_GEO = new THREE.CircleGeometry(0.02, 5);

function seededRandom(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function PetalScatter({ color }: { color?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const baseColor = useMemo(() => new THREE.Color(color || "#e8a0bf"), [color]);

  const { count, data } = useMemo(() => {
    const n = 50;
    const d: { mat: THREE.Matrix4; col: THREE.Color }[] = [];
    const variants = [
      baseColor.clone(),
      baseColor.clone().lerp(new THREE.Color("#FFFFFF"), 0.3),
      baseColor.clone().lerp(new THREE.Color("#FF4477"), 0.2),
    ];

    for (let i = 0; i < n; i++) {
      const x = (seededRandom(i) - 0.5) * 1.0;
      const z = (seededRandom(i + 100) - 0.5) * 1.0;
      dummy.position.set(x, 0.005, z);
      dummy.rotation.set(-Math.PI / 2, 0, seededRandom(i + 200) * Math.PI * 2);
      const s = 0.8 + seededRandom(i + 300) * 0.5;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      d.push({ mat: dummy.matrix.clone(), col: variants[i % variants.length] });
    }
    return { count: n, data: d };
  }, [baseColor]);

  useEffect(() => {
    if (!ref.current) return;
    for (let i = 0; i < count; i++) {
      ref.current.setMatrixAt(i, data[i].mat);
      ref.current.setColorAt(i, data[i].col);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [count, data]);

  return (
    <instancedMesh ref={ref} args={[PETAL_GEO, undefined, count]} receiveShadow>
      <meshStandardMaterial roughness={0.7} metalness={0} side={THREE.DoubleSide} />
    </instancedMesh>
  );
}
