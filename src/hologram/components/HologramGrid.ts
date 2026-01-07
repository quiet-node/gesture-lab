/**
 * HologramGrid
 * Creates a holographic floor grid with glowing lines
 */

import * as THREE from 'three';
import { createWireframeMaterial } from '../materials/HologramMaterial';

export interface HologramGridConfig {
  size: number;
  divisions: number;
  color: THREE.Color;
  opacity: number;
}

const DEFAULT_CONFIG: HologramGridConfig = {
  size: 10,
  divisions: 20,
  color: new THREE.Color(0x00ffff),
  opacity: 0.3,
};

/**
 * Creates a holographic grid floor
 */
export function createHologramGrid(
  config: Partial<HologramGridConfig> = {}
): THREE.Group {
  const { size, divisions, color, opacity } = { ...DEFAULT_CONFIG, ...config };
  const group = new THREE.Group();

  // Create grid lines
  const gridHelper = new THREE.GridHelper(size, divisions, color, color);
  gridHelper.material = createWireframeMaterial(color, opacity);
  gridHelper.position.y = -2;
  group.add(gridHelper);

  // Add outer ring
  const ringGeometry = new THREE.RingGeometry(size / 2 - 0.1, size / 2, 64);
  const ringMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: opacity * 1.5,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(ringGeometry, ringMaterial);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -1.99;
  group.add(ring);

  return group;
}
