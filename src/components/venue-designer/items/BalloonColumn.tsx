"use client";
import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";

const dummy = new THREE.Object3D();

function seededRandom(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function BalloonColumn({ color }: { color?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const baseColor = useMemo(() => new THREE.Color(color || "#FF6B8A"), [color]);

  const { count, matrices, colors } = useMemo(() => {
    const n = 20;
    const mats: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const variants = [
      baseColor.clone(),
      baseColor.clone().lerp(new THREE.Color("#FFFFFF"), 0.4),
      baseColor.clone().lerp(new THREE.Color("#FFD700"), 0.3),
    ];

    for (let i = 0; i < n; i++) {
      const y = 0.12 + i * 0.12;
      const angle = (i / 5) * Math.PI * 2;
      const r = 0.08 + seededRandom(i + 10) * 0.04;
      dummy.position.set(
        Math.cos(angle) * 0.06,
        y,
        Math.sin(angle) * 0.06
      );
      const s = 0.07 + seededRandom(i) * 0.04;
      dummy.scale.set(s, s * 1.1, s);
      dummy.updateMatrix();
      mats.push(dummy.matrix.clone());
      cols.push(variants[i % variants.length]);
    }
    return { count: n, matrices: mats, colors: cols };
  }, [baseColor]);

  useEffect(() => {
    if (!ref.current) return;
    for (let i = 0; i < count; i++) {
      ref.current.setMatrixAt(i, matrices[i]);
      ref.current.setColorAt(i, colors[i]);
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [count, matrices, colors]);

  return (
    <group>
      {/* Base weight */}
      <mesh position={[0, 0.03, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 0.06, 8]} />
        <meshStandardMaterial color="#888888" roughness={0.4} metalness={0.5} />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial roughness={0.6} metalness={0} />
      </instancedMesh>
    </group>
  );
}
