"use client";
import { useMemo } from "react";
import * as THREE from "three";

export function Garland({ color = "#5a7247" }: { color?: string }) {
  const leafMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.7,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    [color]
  );

  const stemMat = useMemo(() => {
    const c = new THREE.Color(color);
    c.lerp(new THREE.Color("#2a1a0a"), 0.3);
    return new THREE.MeshStandardMaterial({
      color: "#" + c.getHexString(),
      roughness: 0.8,
      metalness: 0,
    });
  }, [color]);

  const { tubeGeo, leafPositions } = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const leaves: {
      pos: THREE.Vector3;
      rot: [number, number, number];
      size: [number, number];
    }[] = [];

    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      const x = (t - 0.5) * 2.4;
      const sag = Math.pow(Math.abs(t - 0.5) * 2, 1.5) * 0.25;
      const y = 0.3 - sag;
      const z = Math.sin(t * Math.PI * 2) * 0.03;
      points.push(new THREE.Vector3(x, y, z));

      if (i > 0 && i < 30 && i % 2 === 0) {
        const side = i % 4 === 0 ? 1 : -1;
        const leafSize: [number, number] = [0.04 + Math.random() * 0.02, 0.025 + Math.random() * 0.015];
        leaves.push({
          pos: new THREE.Vector3(x, y, z + side * 0.025),
          rot: [
            side * (0.3 + Math.random() * 0.4),
            t * Math.PI * 0.5,
            side * 0.2,
          ],
          size: leafSize,
        });
      }
    }

    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 40, 0.015, 6, false);
    return { tubeGeo: geo, leafPositions: leaves };
  }, []);

  const flowerBuds = useMemo(() => {
    const buds: { pos: [number, number, number]; color: string }[] = [];
    const budColors = ["#ffffff", "#f0e0d0", "#e8d0e8"];
    for (let i = 0; i < 6; i++) {
      const t = 0.1 + (i / 5) * 0.8;
      const x = (t - 0.5) * 2.4;
      const sag = Math.pow(Math.abs(t - 0.5) * 2, 1.5) * 0.25;
      const y = 0.3 - sag;
      buds.push({
        pos: [x, y + 0.02, (Math.random() - 0.5) * 0.04],
        color: budColors[i % budColors.length],
      });
    }
    return buds;
  }, []);

  return (
    <group>
      {/* Main vine */}
      <mesh geometry={tubeGeo} material={stemMat} castShadow />

      {/* Leaves */}
      {leafPositions.map((leaf, i) => (
        <mesh
          key={i}
          position={[leaf.pos.x, leaf.pos.y, leaf.pos.z]}
          rotation={leaf.rot}
          material={leafMat}
          castShadow
        >
          <planeGeometry args={leaf.size} />
        </mesh>
      ))}

      {/* Small flower buds */}
      {flowerBuds.map((bud, i) => (
        <mesh key={`bud-${i}`} position={bud.pos} castShadow>
          <sphereGeometry args={[0.015, 6, 6]} />
          <meshStandardMaterial color={bud.color} roughness={0.5} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}
