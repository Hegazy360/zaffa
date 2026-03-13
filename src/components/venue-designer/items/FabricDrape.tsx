"use client";
import { useMemo } from "react";
import * as THREE from "three";

export function FabricDrape({ color }: { color?: string }) {
  const fabricMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#F5E6D3",
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [color]
  );

  const { drapeGeo1, drapeGeo2, drapeGeo3 } = useMemo(() => {
    const makeCurve = (sag: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const x = (t - 0.5) * 1.2;
        const s = Math.pow(Math.abs(t - 0.5) * 2, 2) * sag;
        pts.push(new THREE.Vector3(x, -s, 0));
      }
      return new THREE.CatmullRomCurve3(pts);
    };
    return {
      drapeGeo1: new THREE.TubeGeometry(makeCurve(0.25), 20, 0.04, 6, false),
      drapeGeo2: new THREE.TubeGeometry(makeCurve(0.35), 20, 0.035, 6, false),
      drapeGeo3: new THREE.TubeGeometry(makeCurve(0.18), 20, 0.03, 6, false),
    };
  }, []);

  return (
    <group>
      {/* Mount points */}
      {[-0.6, 0.6].map((x, i) => (
        <mesh key={i} position={[x, 1.8, 0]} castShadow>
          <sphereGeometry args={[0.025, 6, 6]} />
          <meshStandardMaterial color="#C4A35A" roughness={0.3} metalness={0.5} />
        </mesh>
      ))}
      {/* Draped fabric swags */}
      <mesh geometry={drapeGeo1} position={[0, 1.78, 0]} material={fabricMat} castShadow />
      <mesh geometry={drapeGeo2} position={[0, 1.72, 0.03]} material={fabricMat} castShadow />
      <mesh geometry={drapeGeo3} position={[0, 1.84, -0.02]} material={fabricMat} castShadow />
    </group>
  );
}
