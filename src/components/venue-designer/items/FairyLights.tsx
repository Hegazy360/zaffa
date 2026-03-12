"use client";
import { useMemo } from "react";
import * as THREE from "three";

const WIRE_MAT = new THREE.MeshStandardMaterial({
  color: "#2a2a2a",
  roughness: 0.6,
  metalness: 0.3,
});

export function FairyLights({ color = "#fff5e0" }: { color?: string }) {
  const bulbMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 1.5,
        roughness: 0.2,
        metalness: 0,
      }),
    [color]
  );

  const { wireGeo, bulbs } = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const bulbPositions: THREE.Vector3[] = [];
    const segments = 30;
    const width = 2.0;

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = (t - 0.5) * width;
      const sag = Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.3;
      const y = 2.0 - sag;
      const z = Math.sin(t * Math.PI * 3) * 0.05;
      points.push(new THREE.Vector3(x, y, z));

      if (i > 0 && i < segments && i % 3 === 0) {
        bulbPositions.push(new THREE.Vector3(x, y - 0.04, z));
      }
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 48, 0.004, 4, false);
    return { wireGeo: geo, bulbs: bulbPositions };
  }, []);

  return (
    <group>
      {/* Wire */}
      <mesh geometry={wireGeo} material={WIRE_MAT} />

      {/* Bulbs */}
      {bulbs.map((pos, i) => (
        <group key={i} position={[pos.x, pos.y, pos.z]}>
          <mesh material={bulbMat}>
            <sphereGeometry args={[0.015, 6, 6]} />
          </mesh>
          <pointLight
            color={color}
            intensity={0.15}
            distance={0.8}
            decay={2}
          />
        </group>
      ))}
    </group>
  );
}
