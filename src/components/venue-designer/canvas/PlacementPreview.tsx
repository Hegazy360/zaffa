"use client";
import { useRef, useCallback } from "react";
import { useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { ITEM_COMPONENTS } from "../items";

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const intersectPoint = new THREE.Vector3();

export function PlacementPreview() {
  const groupRef = useRef<THREE.Group>(null);
  const placingType = useVenueDesignerStore((s) => s.placingType);
  const addItem = useVenueDesignerStore((s) => s.addItem);
  const { camera, gl } = useThree();

  useFrame(({ pointer }) => {
    if (!placingType || !groupRef.current) return;
    mouse.set(pointer.x, pointer.y);
    raycaster.setFromCamera(mouse, camera);
    if (raycaster.ray.intersectPlane(floorPlane, intersectPoint)) {
      groupRef.current.position.copy(intersectPoint);
      groupRef.current.position.y = 0;
    }
  });

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (!placingType) return;
      e.stopPropagation();
      mouse.set(e.pointer.x, e.pointer.y);
      raycaster.setFromCamera(mouse, camera);
      if (raycaster.ray.intersectPlane(floorPlane, intersectPoint)) {
        addItem(placingType, [intersectPoint.x, 0, intersectPoint.z]);
      }
    },
    [placingType, addItem, camera]
  );

  if (!placingType) return null;
  const Component = ITEM_COMPONENTS[placingType];
  if (!Component) return null;

  return (
    <>
      {/* Invisible click plane covering the floor */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.001, 0]}
        onClick={handleClick}
        visible={false}
      >
        <planeGeometry args={[200, 200]} />
      </mesh>
      {/* Ghost preview */}
      <group ref={groupRef}>
        <group scale={[1, 1, 1]}>
          <Component />
          {/* Semi-transparent overlay */}
          <mesh>
            <sphereGeometry args={[0.01, 4, 4]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
        </group>
      </group>
    </>
  );
}
