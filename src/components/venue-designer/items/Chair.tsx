"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function createChairFrameGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const legPositions: [number, number][] = [
    [-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14],
  ];
  for (const [x, z] of legPositions) {
    const leg = new THREE.CylinderGeometry(0.012, 0.016, 0.44, 6);
    leg.translate(x, 0.22, z);
    parts.push(leg);
  }

  const crossBar1 = new THREE.BoxGeometry(0.26, 0.015, 0.015);
  crossBar1.translate(0, 0.12, 0.14);
  parts.push(crossBar1);

  const crossBar2 = new THREE.BoxGeometry(0.015, 0.015, 0.26);
  crossBar2.translate(-0.14, 0.12, 0);
  parts.push(crossBar2);

  const crossBar3 = new THREE.BoxGeometry(0.015, 0.015, 0.26);
  crossBar3.translate(0.14, 0.12, 0);
  parts.push(crossBar3);

  const seatFrame = new THREE.BoxGeometry(0.34, 0.025, 0.34);
  seatFrame.translate(0, 0.44, 0);
  parts.push(seatFrame);

  const topRail = new THREE.BoxGeometry(0.30, 0.025, 0.02);
  topRail.translate(0, 0.88, -0.14);
  parts.push(topRail);

  for (let i = 0; i < 3; i++) {
    const t = (i / 2) * 2 - 1;
    const x = t * 0.12;
    const h = 0.38 - Math.abs(t) * 0.06;
    const slat = new THREE.CylinderGeometry(0.008, 0.01, h, 4);
    slat.translate(x, 0.44 + h / 2 + 0.025, -0.14);
    parts.push(slat);
  }

  const backLeg1 = new THREE.CylinderGeometry(0.012, 0.014, 0.44, 6);
  backLeg1.translate(-0.14, 0.66, -0.14);
  parts.push(backLeg1);

  const backLeg2 = new THREE.CylinderGeometry(0.012, 0.014, 0.44, 6);
  backLeg2.translate(0.14, 0.66, -0.14);
  parts.push(backLeg2);

  const merged = mergeGeometries(parts);
  if (!merged) return new THREE.BoxGeometry(0.3, 0.9, 0.3);
  merged.computeVertexNormals();
  return merged;
}

export const CHAIR_FRAME_GEO = createChairFrameGeo();

export const CHAIR_CUSHION_GEO = new THREE.BoxGeometry(0.30, 0.025, 0.30);
CHAIR_CUSHION_GEO.translate(0, 0.465, 0);

export const CHAIR_FRAME_MAT = new THREE.MeshStandardMaterial({
  color: "#C4A35A",
  roughness: 0.4,
  metalness: 0.35,
});

export const CHAIR_CUSHION_MAT = new THREE.MeshStandardMaterial({
  color: "#F5F0EB",
  roughness: 0.85,
  metalness: 0,
});

const FRAME_MAT = CHAIR_FRAME_MAT;

export function Chair({ color }: { color?: string }) {
  const cushionMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: color || "#F5F0EB",
        roughness: 0.85,
        metalness: 0,
      }),
    [color]
  );

  return (
    <group>
      <mesh geometry={CHAIR_FRAME_GEO} material={FRAME_MAT} castShadow />
      <mesh position={[0, 0.465, 0]} material={cushionMat} castShadow>
        <boxGeometry args={[0.30, 0.025, 0.30]} />
      </mesh>
    </group>
  );
}
