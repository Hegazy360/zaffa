"use client";
import { useRef, useCallback, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { VenueRoom } from "./VenueRoom";
import { SceneLighting } from "./SceneLighting";
import { PlacedItems } from "./PlacedItems";
import { PlacementPreview } from "./PlacementPreview";
import { useVenueDesignerStore } from "@/stores/venue-designer-store";

type CaptureCallback = () => Promise<string | null>;

let _captureWideshot: CaptureCallback | null = null;
export function getCaptureWideshot() {
  return _captureWideshot;
}

function VenueClipping() {
  const { gl } = useThree();
  const venue = useVenueDesignerStore((s) => s.venue);

  useEffect(() => {
    const hw = venue.width / 2;
    const hl = venue.length / 2;
    gl.clippingPlanes = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), hw),
      new THREE.Plane(new THREE.Vector3(1, 0, 0), hw),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), hl),
      new THREE.Plane(new THREE.Vector3(0, 0, 1), hl),
    ];
    gl.localClippingEnabled = true;
    return () => {
      gl.clippingPlanes = [];
    };
  }, [gl, venue.width, venue.length]);

  return null;
}

function CameraCapture() {
  const { camera, gl, scene } = useThree();
  const controlsRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);
  const venue = useVenueDesignerStore((s) => s.venue);

  _captureWideshot = useCallback(async () => {
    const controls = controlsRef.current;
    if (!controls) return null;

    const savedPos = camera.position.clone();
    const savedTarget = (controls as unknown as { target: THREE.Vector3 }).target.clone();

    const span = Math.max(venue.width, venue.length);
    const fovRad = ((camera as THREE.PerspectiveCamera).fov * Math.PI) / 180;
    const dist = (span / 2) / Math.tan(fovRad / 2) + 4;
    camera.position.set(dist * 0.75, dist * 0.45, dist * 0.15);
    (controls as unknown as { target: THREE.Vector3 }).target.set(0, 0, 0);
    (controls as unknown as { update: () => void }).update();
    camera.updateProjectionMatrix();

    gl.render(scene, camera);
    const dataUrl = gl.domElement.toDataURL("image/png");

    camera.position.copy(savedPos);
    (controls as unknown as { target: THREE.Vector3 }).target.copy(savedTarget);
    (controls as unknown as { update: () => void }).update();
    camera.updateProjectionMatrix();

    return dataUrl;
  }, [camera, gl, scene, venue]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan
      enableZoom
      enableRotate
      minPolarAngle={0.1}
      maxPolarAngle={Math.PI / 2 - 0.05}
      minDistance={3}
      maxDistance={60}
    />
  );
}

export function VenueCanvas() {
  const select = useVenueDesignerStore((s) => s.select);
  const placingType = useVenueDesignerStore((s) => s.placingType);
  const cancelPlacing = useVenueDesignerStore((s) => s.cancelPlacing);

  return (
    <Canvas
      shadows
      gl={{ preserveDrawingBuffer: true }}
      scene={{ background: new THREE.Color("#000000") }}
      camera={{ position: [12, 10, 16], fov: 50, near: 0.1, far: 200 }}
      onPointerMissed={() => {
        if (placingType) {
          cancelPlacing();
        } else {
          select(null);
        }
      }}
      style={{ cursor: placingType ? "crosshair" : "default" }}
    >
      <VenueClipping />
      <SceneLighting />
      <VenueRoom />
      <PlacedItems />
      <PlacementPreview />
      <CameraCapture />
    </Canvas>
  );
}
