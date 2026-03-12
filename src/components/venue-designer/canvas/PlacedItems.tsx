"use client";
import { useRef, useCallback, useEffect, useMemo } from "react";
import { ThreeEvent } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { ITEM_COMPONENTS } from "../items";
import {
  CHAIR_FRAME_GEO,
  CHAIR_CUSHION_GEO,
  CHAIR_FRAME_MAT,
  CHAIR_CUSHION_MAT,
} from "../items/Chair";
import type { PlacedItem } from "@/types/venue-designer";

const dummy = new THREE.Object3D();

function BatchedChairs({ chairs }: { chairs: PlacedItem[] }) {
  const frameRef = useRef<THREE.InstancedMesh>(null);
  const cushionRef = useRef<THREE.InstancedMesh>(null);
  const select = useVenueDesignerStore((s) => s.select);
  const placingType = useVenueDesignerStore((s) => s.placingType);
  const idMap = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    if (!frameRef.current || !cushionRef.current) return;
    idMap.current.clear();

    for (let i = 0; i < chairs.length; i++) {
      const c = chairs[i];
      dummy.position.set(...c.position);
      dummy.rotation.set(...c.rotation);
      dummy.scale.set(...c.scale);
      dummy.updateMatrix();
      frameRef.current.setMatrixAt(i, dummy.matrix);
      cushionRef.current.setMatrixAt(i, dummy.matrix);
      idMap.current.set(i, c.id);
    }
    frameRef.current.instanceMatrix.needsUpdate = true;
    cushionRef.current.instanceMatrix.needsUpdate = true;
    frameRef.current.computeBoundingSphere();
    cushionRef.current.computeBoundingSphere();
  }, [chairs]);

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (placingType) return;
      e.stopPropagation();
      if (e.instanceId !== undefined) {
        const id = idMap.current.get(e.instanceId);
        if (id) select(id);
      }
    },
    [select, placingType]
  );

  if (chairs.length === 0) return null;

  return (
    <>
      <instancedMesh
        ref={frameRef}
        args={[CHAIR_FRAME_GEO, CHAIR_FRAME_MAT, chairs.length]}
        onClick={handleClick}
      />
      <instancedMesh
        ref={cushionRef}
        args={[CHAIR_CUSHION_GEO, CHAIR_CUSHION_MAT, chairs.length]}
        onClick={handleClick}
      />
    </>
  );
}

function PlacedItemMesh({ item }: { item: PlacedItem }) {
  const meshRef = useRef<THREE.Group>(null);
  const selectedId = useVenueDesignerStore((s) => s.selectedId);
  const activeTool = useVenueDesignerStore((s) => s.activeTool);
  const select = useVenueDesignerStore((s) => s.select);
  const updateItem = useVenueDesignerStore((s) => s.updateItem);
  const placingType = useVenueDesignerStore((s) => s.placingType);
  const isSelected = selectedId === item.id;

  const Component = ITEM_COMPONENTS[item.type];
  if (!Component) return null;

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (placingType) return;
      e.stopPropagation();
      select(item.id);
    },
    [item.id, select, placingType]
  );

  const handleTransformChange = useCallback(() => {
    if (!meshRef.current) return;
    const pos = meshRef.current.position;
    const rot = meshRef.current.rotation;
    const scl = meshRef.current.scale;
    updateItem(item.id, {
      position: [pos.x, pos.y, pos.z],
      rotation: [rot.x, rot.y, rot.z],
      scale: [scl.x, scl.y, scl.z],
    });
  }, [item.id, updateItem]);

  const transformMode =
    activeTool === "translate" || activeTool === "rotate" || activeTool === "scale"
      ? activeTool
      : "translate";

  return (
    <>
      <group
        ref={meshRef}
        position={item.position}
        rotation={item.rotation}
        scale={item.scale}
        onClick={handleClick}
      >
        <Component color={item.color} variant={item.variant} />
        {isSelected && (
          <mesh visible={false}>
            <boxGeometry args={[2, 2, 2]} />
          </mesh>
        )}
      </group>
      {isSelected && meshRef.current && (
        <TransformControls
          object={meshRef.current}
          mode={transformMode}
          onMouseUp={handleTransformChange}
          size={0.6}
        />
      )}
    </>
  );
}

export function PlacedItems() {
  const items = useVenueDesignerStore((s) => s.items);
  const selectedId = useVenueDesignerStore((s) => s.selectedId);

  const { chairs, otherItems, selectedChair } = useMemo(() => {
    const c: PlacedItem[] = [];
    const o: PlacedItem[] = [];
    let sc: PlacedItem | null = null;

    for (const item of items) {
      if (item.type === "chair") {
        if (item.id === selectedId) {
          sc = item;
        } else {
          c.push(item);
        }
      } else {
        o.push(item);
      }
    }
    return { chairs: c, otherItems: o, selectedChair: sc };
  }, [items, selectedId]);

  return (
    <>
      <BatchedChairs chairs={chairs} />
      {selectedChair && (
        <PlacedItemMesh key={selectedChair.id} item={selectedChair} />
      )}
      {otherItems.map((item) => (
        <PlacedItemMesh key={item.id} item={item} />
      ))}
    </>
  );
}
