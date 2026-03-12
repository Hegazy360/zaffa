"use client";
import { useMemo } from "react";
import * as THREE from "three";

const GOLD = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.7,
});
const PLATFORM_MAT = new THREE.MeshStandardMaterial({
  color: "#F5F0EB",
  roughness: 0.6,
  metalness: 0.1,
});
const CUSHION_MAT = new THREE.MeshStandardMaterial({
  color: "#8B1A4A",
  roughness: 0.85,
  metalness: 0,
});

export function Stage() {
  const fabricMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#F5E6D3",
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    []
  );

  const drapeCurve = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const x = (t - 0.5) * 2.5;
      const sag = Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.15;
      pts.push(new THREE.Vector3(x, 2.55 - sag, -0.87));
    }
    return new THREE.CatmullRomCurve3(pts);
  }, []);

  const drapeGeo = useMemo(
    () => new THREE.TubeGeometry(drapeCurve, 24, 0.04, 6, false),
    [drapeCurve]
  );

  return (
    <group>
      {/* Main platform - stepped */}
      <mesh position={[0, 0.05, 0]} material={PLATFORM_MAT} castShadow receiveShadow>
        <boxGeometry args={[3.0, 0.1, 2.2]} />
      </mesh>
      <mesh position={[0, 0.15, -0.05]} material={PLATFORM_MAT} castShadow receiveShadow>
        <boxGeometry args={[2.7, 0.1, 2.0]} />
      </mesh>

      {/* Gold trim around platform */}
      <mesh position={[0, 0.21, -0.05]} material={GOLD} castShadow>
        <boxGeometry args={[2.75, 0.02, 2.05]} />
      </mesh>

      {/* Back pillars */}
      {[-1.2, 1.2].map((x, i) => (
        <group key={i}>
          {/* Pillar base */}
          <mesh position={[x, 0.28, -0.9]} material={GOLD} castShadow>
            <cylinderGeometry args={[0.06, 0.08, 0.12, 12]} />
          </mesh>
          {/* Pillar shaft */}
          <mesh position={[x, 1.35, -0.9]} material={GOLD} castShadow>
            <cylinderGeometry args={[0.04, 0.05, 2.0, 12]} />
          </mesh>
          {/* Pillar capital */}
          <mesh position={[x, 2.38, -0.9]} material={GOLD} castShadow>
            <cylinderGeometry args={[0.07, 0.04, 0.08, 12]} />
          </mesh>
        </group>
      ))}

      {/* Top beam */}
      <mesh position={[0, 2.45, -0.9]} material={GOLD} castShadow>
        <boxGeometry args={[2.5, 0.06, 0.08]} />
      </mesh>

      {/* Fabric drape across top */}
      <mesh geometry={drapeGeo} material={fabricMat} castShadow />

      {/* Side fabric panels */}
      {[-1.15, 1.15].map((x, i) => (
        <mesh key={i} position={[x, 1.5, -0.88]} material={fabricMat} castShadow>
          <boxGeometry args={[0.3, 1.8, 0.01]} />
        </mesh>
      ))}

      {/* Sofa/seating area */}
      {/* Sofa base */}
      <mesh position={[0, 0.38, -0.45]} material={CUSHION_MAT} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.2, 0.7]} />
      </mesh>
      {/* Sofa back */}
      <mesh position={[0, 0.6, -0.76]} material={CUSHION_MAT} castShadow>
        <boxGeometry args={[1.6, 0.3, 0.1]} />
      </mesh>
      {/* Sofa arms */}
      {[-0.75, 0.75].map((x, i) => (
        <mesh key={i} position={[x, 0.5, -0.45]} material={CUSHION_MAT} castShadow>
          <boxGeometry args={[0.1, 0.15, 0.5]} />
        </mesh>
      ))}

      {/* Decorative cushions */}
      {[-0.35, 0, 0.35].map((x, i) => (
        <mesh key={i} position={[x, 0.52, -0.60]} rotation={[0.2, i * 0.15, 0]} castShadow>
          <boxGeometry args={[0.2, 0.18, 0.08]} />
          <meshStandardMaterial
            color={i === 1 ? "#D4AF37" : "#6B1D3A"}
            roughness={0.8}
            metalness={i === 1 ? 0.3 : 0}
          />
        </mesh>
      ))}

      {/* Small accent lights on pillars */}
      <pointLight position={[-1.2, 2.3, -0.85]} color="#FFD700" intensity={0.3} distance={2.5} decay={2} />
      <pointLight position={[1.2, 2.3, -0.85]} color="#FFD700" intensity={0.3} distance={2.5} decay={2} />
    </group>
  );
}
