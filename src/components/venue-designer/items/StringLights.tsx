"use client";
import { useMemo } from "react";
import * as THREE from "three";

const BULB_SHAPE = (() => {
  const pts = [
    new THREE.Vector2(0, -0.018),
    new THREE.Vector2(0.006, -0.016),
    new THREE.Vector2(0.011, -0.008),
    new THREE.Vector2(0.013, 0.002),
    new THREE.Vector2(0.011, 0.012),
    new THREE.Vector2(0.005, 0.016),
    new THREE.Vector2(0.004, 0.018),
    new THREE.Vector2(0, 0.018),
  ];
  return new THREE.LatheGeometry(pts, 8);
})();

export function StringLights({ color }: { color?: string }) {
  const bulbMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#FFF5E0",
        roughness: 0.3,
        metalness: 0,
        emissive: new THREE.Color(color || "#FFF5E0"),
        emissiveIntensity: 1.0,
      }),
    [color]
  );

  const wireMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: "#222222", roughness: 0.8 }),
    []
  );

  const socketMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({ color: "#444444", roughness: 0.5, metalness: 0.3 }),
    []
  );

  const { wireGeo, bulbPositions } = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const bulbs: [number, number, number][] = [];
    const segments = 30;
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const x = (t - 0.5) * 2.2;
      const sag = Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.25;
      pts.push(new THREE.Vector3(x, -sag, 0));
      if (i > 1 && i < segments - 1 && i % 3 === 0) {
        bulbs.push([x, -sag - 0.025, 0]);
      }
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return {
      wireGeo: new THREE.TubeGeometry(curve, 24, 0.003, 4, false),
      bulbPositions: bulbs,
    };
  }, []);

  return (
    <group position={[0, 2.5, 0]}>
      <mesh geometry={wireGeo} material={wireMat} />
      {bulbPositions.map(([x, y, z], i) => (
        <group key={i} position={[x, y, z]}>
          {/* Socket */}
          <mesh position={[0, 0.016, 0]} material={socketMat}>
            <cylinderGeometry args={[0.005, 0.006, 0.008, 6]} />
          </mesh>
          {/* Pear-shaped bulb */}
          <mesh geometry={BULB_SHAPE} material={bulbMat} castShadow />
        </group>
      ))}
    </group>
  );
}
