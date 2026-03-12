"use client";
import * as THREE from "three";

const FRAME = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.3,
  metalness: 0.7,
});

export function MirrorPanel() {
  return (
    <group>
      {/* Ornate frame */}
      <mesh position={[0, 1.0, 0]} material={FRAME} castShadow>
        <boxGeometry args={[0.95, 1.6, 0.06]} />
      </mesh>
      {/* Mirror surface */}
      <mesh position={[0, 1.0, 0.035]}>
        <planeGeometry args={[0.8, 1.4]} />
        <meshPhysicalMaterial
          color="#E8E8E8"
          metalness={0.95}
          roughness={0.05}
          reflectivity={1}
        />
      </mesh>
    </group>
  );
}
