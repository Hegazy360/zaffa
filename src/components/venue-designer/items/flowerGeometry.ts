import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

function createFlowerGeometry(): THREE.BufferGeometry {
  // Teardrop petal profile
  const petalShape = new THREE.Shape();
  petalShape.moveTo(0, 0);
  petalShape.bezierCurveTo(0.35, 0.15, 0.38, 0.65, 0, 1.0);
  petalShape.bezierCurveTo(-0.38, 0.65, -0.35, 0.15, 0, 0);

  const basePetal = new THREE.ShapeGeometry(petalShape, 3);

  // Cup the petal by displacing Z based on distance from center line
  const pos = basePetal.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const edgeDist = Math.abs(x);
    const heightFactor = Math.sin(y * Math.PI);
    pos.setZ(i, -(edgeDist * 0.35 + heightFactor * 0.08));
  }
  basePetal.computeVertexNormals();

  const geos: THREE.BufferGeometry[] = [];

  // Outer ring: 5 petals, open
  for (let i = 0; i < 5; i++) {
    const petal = basePetal.clone();
    const angle = (i / 5) * Math.PI * 2;
    petal.translate(0, 0.05, 0);
    petal.scale(0.55, 0.5, 0.55);
    petal.rotateX(-0.7);
    petal.rotateY(angle);
    geos.push(petal);
  }

  // Inner ring: 5 smaller petals, more upright, offset by 36 degrees
  for (let i = 0; i < 5; i++) {
    const petal = basePetal.clone();
    const angle = (i / 5) * Math.PI * 2 + Math.PI / 5;
    petal.translate(0, 0.05, 0);
    petal.scale(0.38, 0.4, 0.38);
    petal.rotateX(-0.35);
    petal.rotateY(angle);
    geos.push(petal);
  }

  // Center bud
  const center = new THREE.SphereGeometry(0.12, 5, 4);
  center.translate(0, 0.08, 0);
  geos.push(center);

  const merged = mergeGeometries(geos);
  if (!merged) return new THREE.SphereGeometry(0.5, 6, 5);

  // Normalize so bounding sphere radius ~1 (matches old SphereGeometry(1) sizing)
  merged.computeBoundingSphere();
  const r = merged.boundingSphere?.radius || 1;
  merged.scale(1 / r, 1 / r, 1 / r);
  merged.computeVertexNormals();

  return merged;
}

export const FLOWER_GEO = createFlowerGeometry();
export const LEAF_GEO = new THREE.PlaneGeometry(1, 0.5);
