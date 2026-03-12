"use client";
import { useMemo } from "react";
import * as THREE from "three";

export function AisleRunner({ color = "#F5F0EB" }: { color?: string }) {
  const fabricMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.9,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [color]
  );

  const borderMat = useMemo(() => {
    const c = new THREE.Color(color);
    c.lerp(new THREE.Color("#C4A35A"), 0.4);
    return new THREE.MeshStandardMaterial({
      color: "#" + c.getHexString(),
      roughness: 0.7,
      metalness: 0.15,
    });
  }, [color]);

  return (
    <group>
      {/* Main runner fabric */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} material={fabricMat} receiveShadow>
        <planeGeometry args={[0.8, 4.0]} />
      </mesh>

      {/* Border trim left */}
      <mesh
        position={[-0.41, 0.006, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={borderMat}
        receiveShadow
      >
        <planeGeometry args={[0.03, 4.0]} />
      </mesh>

      {/* Border trim right */}
      <mesh
        position={[0.41, 0.006, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        material={borderMat}
        receiveShadow
      >
        <planeGeometry args={[0.03, 4.0]} />
      </mesh>
    </group>
  );
}
