"use client";
import { useMemo } from "react";
import * as THREE from "three";

const LEG_MAT = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.7,
});

export function LoungeSofa({ color }: { color?: string }) {
  const fabricMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#8B6F8A",
        roughness: 0.92,
        metalness: 0,
      }),
    [color]
  );

  const accentMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color || "#8B6F8A").multiplyScalar(0.8).getStyle(),
        roughness: 0.85,
        metalness: 0,
      }),
    [color]
  );

  return (
    <group>
      {/* Gold tapered legs */}
      {[[-0.42, -0.22], [0.42, -0.22], [-0.42, 0.22], [0.42, 0.22]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.045, z]} material={LEG_MAT} castShadow>
          <cylinderGeometry args={[0.012, 0.018, 0.09, 6]} />
        </mesh>
      ))}
      {/* Base frame */}
      <mesh position={[0, 0.10, 0]} material={fabricMat} castShadow>
        <boxGeometry args={[0.96, 0.02, 0.52]} />
      </mesh>
      {/* Seat cushion - rounded top */}
      <mesh position={[0, 0.19, 0.02]} material={fabricMat} castShadow>
        <boxGeometry args={[0.90, 0.14, 0.48]} />
      </mesh>
      {/* Seat cushion top edge softener */}
      <mesh position={[0, 0.265, 0.02]} material={fabricMat}>
        <boxGeometry args={[0.88, 0.02, 0.46]} />
      </mesh>
      {/* Back cushion */}
      <mesh position={[0, 0.34, -0.20]} material={fabricMat} castShadow>
        <boxGeometry args={[0.90, 0.22, 0.10]} />
      </mesh>
      {/* Back cushion top roll */}
      <mesh position={[0, 0.46, -0.20]} rotation={[0, 0, Math.PI / 2]} material={fabricMat}>
        <cylinderGeometry args={[0.03, 0.03, 0.88, 8]} />
      </mesh>
      {/* Armrests - rounded */}
      {[-0.45, 0.45].map((x, i) => (
        <group key={`arm${i}`}>
          <mesh position={[x, 0.28, 0]} material={fabricMat} castShadow>
            <boxGeometry args={[0.06, 0.22, 0.48]} />
          </mesh>
          {/* Arm top roll */}
          <mesh position={[x, 0.395, 0]} rotation={[Math.PI / 2, 0, 0]} material={fabricMat}>
            <cylinderGeometry args={[0.025, 0.025, 0.46, 8]} />
          </mesh>
        </group>
      ))}
      {/* Throw pillows - different angles */}
      {[
        { x: -0.22, rz: 0.15, ry: -0.2 },
        { x: 0.22, rz: -0.1, ry: 0.15 },
      ].map(({ x, rz, ry }, i) => (
        <mesh
          key={`p${i}`}
          position={[x, 0.34, -0.12]}
          rotation={[0.25, ry, rz]}
          material={accentMat}
          castShadow
        >
          <boxGeometry args={[0.14, 0.12, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}
