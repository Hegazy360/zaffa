"use client";
import { useMemo } from "react";
import * as THREE from "three";

const GOLD = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.35,
  metalness: 0.65,
});

export function BackdropPanel({ color = "#f5f0eb" }: { color?: string }) {
  const panelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.85,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [color]
  );

  const drapeMat = useMemo(() => {
    const c = new THREE.Color(color);
    c.lerp(new THREE.Color("#E8DDD0"), 0.3);
    return new THREE.MeshStandardMaterial({
      color: "#" + c.getHexString(),
      roughness: 0.9,
      metalness: 0,
      side: THREE.DoubleSide,
    });
  }, [color]);

  const drapeCurves = useMemo(() => {
    const curves: THREE.TubeGeometry[] = [];
    const count = 3;
    for (let d = 0; d < count; d++) {
      const pts: THREE.Vector3[] = [];
      const startX = -0.8 + d * 0.6;
      const endX = startX + 0.8;
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const x = startX + t * (endX - startX);
        const sag = Math.sin(t * Math.PI) * (0.08 + d * 0.03);
        pts.push(new THREE.Vector3(x, 2.25 - sag, 0.03));
      }
      curves.push(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.025, 6, false)
      );
    }
    return curves;
  }, []);

  return (
    <group>
      {/* Frame pillars */}
      {[-1.02, 1.02].map((x, i) => (
        <group key={i}>
          <mesh position={[x, 0.05, 0]} material={GOLD} castShadow>
            <cylinderGeometry args={[0.04, 0.05, 0.1, 10]} />
          </mesh>
          <mesh position={[x, 1.2, 0]} material={GOLD} castShadow>
            <cylinderGeometry args={[0.03, 0.035, 2.2, 10]} />
          </mesh>
          <mesh position={[x, 2.35, 0]} material={GOLD} castShadow>
            <sphereGeometry args={[0.04, 10, 10]} />
          </mesh>
        </group>
      ))}

      {/* Top beam */}
      <mesh position={[0, 2.32, 0]} material={GOLD} castShadow>
        <boxGeometry args={[2.1, 0.04, 0.04]} />
      </mesh>

      {/* Main fabric panel */}
      <mesh position={[0, 1.18, 0]} material={panelMat} castShadow receiveShadow>
        <boxGeometry args={[1.96, 2.22, 0.015]} />
      </mesh>

      {/* Fabric swag drapes across the top */}
      {drapeCurves.map((geo, i) => (
        <mesh key={i} geometry={geo} material={drapeMat} castShadow />
      ))}
    </group>
  );
}
