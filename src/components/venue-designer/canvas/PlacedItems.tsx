"use client";
import { useRef, useCallback } from "react";
import { ThreeEvent } from "@react-three/fiber";
import { TransformControls } from "@react-three/drei";
import * as THREE from "three";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";
import { ITEM_COMPONENTS } from "../items";
import type { PlacedItem } from "@/types/venue-designer";

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

  return (
    <>
      {items.map((item) => (
        <PlacedItemMesh key={item.id} item={item} />
      ))}
    </>
  );
}
