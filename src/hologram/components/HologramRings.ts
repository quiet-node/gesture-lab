/**
 * HologramRings
 * Animated rotating holographic rings/arcs
 */

import * as THREE from 'three';
import { createHologramMaterial } from '../materials/HologramMaterial';

export interface HologramRingsConfig {
  innerRadius: number;
  outerRadius: number;
  thetaSegments: number;
  color: THREE.Color;
}

const DEFAULT_CONFIG: HologramRingsConfig = {
  innerRadius: 1.5,
  outerRadius: 1.7,
  thetaSegments: 64,
  color: new THREE.Color(0x00ffff),
};

/**
 * Creates a set of animated holographic rings
 */
export function createHologramRings(
  config: Partial<HologramRingsConfig> = {}
): THREE.Group {
  const { innerRadius, outerRadius, thetaSegments, color } = {
    ...DEFAULT_CONFIG,
    ...config,
  };
  const group = new THREE.Group();

  // Create multiple arc segments at different angles
  const arcCount = 3;
  for (let i = 0; i < arcCount; i++) {
    const arcAngle = Math.PI * 0.6; // 108 degrees arc
    const startAngle = (i * Math.PI * 2) / arcCount;

    const arcGeometry = new THREE.RingGeometry(
      innerRadius + i * 0.3,
      outerRadius + i * 0.3,
      thetaSegments,
      1,
      startAngle,
      arcAngle
    );

    const material = createHologramMaterial({
      color,
      opacity: 0.5 - i * 0.1,
      fresnelPower: 1.5,
      enableScanlines: false,
    });

    const arc = new THREE.Mesh(arcGeometry, material);
    arc.userData.rotationSpeed = 0.3 + i * 0.1;
    arc.userData.rotationAxis = i % 2 === 0 ? 'y' : 'z';
    group.add(arc);
  }

  // Add inner decorative ring
  const innerRingGeometry = new THREE.TorusGeometry(
    innerRadius * 0.8,
    0.02,
    8,
    64
  );
  const innerMaterial = createHologramMaterial({
    color,
    opacity: 0.7,
    enableScanlines: false,
  });
  const innerRing = new THREE.Mesh(innerRingGeometry, innerMaterial);
  innerRing.userData.rotationSpeed = -0.5;
  innerRing.userData.rotationAxis = 'x';
  group.add(innerRing);

  return group;
}

/**
 * Updates ring animations
 */
export function updateHologramRings(
  rings: THREE.Group,
  deltaTime: number,
  time: number
): void {
  rings.children.forEach((child) => {
    if (child.userData.rotationSpeed) {
      const speed = child.userData.rotationSpeed * deltaTime;
      const axis = child.userData.rotationAxis || 'y';

      if (axis === 'y') {
        child.rotation.y += speed;
      } else if (axis === 'z') {
        child.rotation.z += speed;
      } else if (axis === 'x') {
        child.rotation.x += speed;
      }
    }

    // Update shader time uniform
    if (
      child instanceof THREE.Mesh &&
      child.material instanceof THREE.ShaderMaterial
    ) {
      child.material.uniforms.uTime.value = time;
    }
  });
}
