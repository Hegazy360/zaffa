"use client";
import { useMemo, useRef, useEffect } from "react";
import * as THREE from "three";

const dummy = new THREE.Object3D();

function seededRandom(seed: number) {
  const x = Math.sin(seed * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

export function BalloonArch({ color }: { color?: string }) {
  const ref = useRef<THREE.InstancedMesh>(null);

  const baseColor = useMemo(() => new THREE.Color(color || "#FF6B8A"), [color]);

  const { count, matrices, colors } = useMemo(() => {
    const n = 40;
    const mats: THREE.Matrix4[] = [];
    const cols: THREE.Color[] = [];
    const variants = [
      baseColor.clone(),
      baseColor.clone().lerp(new THREE.Color("#FFFFFF"), 0.4),
      baseColor.clone().lerp(new THREE.Color("#FFD700"), 0.3),
      baseColor.clone().lerp(new THREE.Color("#000000"), 0.15),
    ];

    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const angle = Math.PI * t;
      const x = Math.cos(angle) * 1.1;
      const y = Math.sin(angle) * 1.4 + 0.15;
      const r = seededRandom(i);
      const spread = 0.12;
      dummy.position.set(
        x + (seededRandom(i + 100) - 0.5) * spread,
        y + (seededRandom(i + 200) - 0.5) * spread,
        (seededRandom(i + 300) - 0.5) * spread
      );
      const s = 0.08 + r * 0.06;
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
      <instancedMesh ref={ref} args={[undefined, undefined, count]} castShadow>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial roughness={0.6} metalness={0} />
      </instancedMesh>
    </group>
  );
}
