/**
 * HologramPanels
 * Floating holographic UI panels with technical readouts
 */

import * as THREE from 'three';
import { createHologramMaterial } from '../materials/HologramMaterial';

export interface HologramPanelConfig {
  width: number;
  height: number;
  color: THREE.Color;
}

const DEFAULT_CONFIG: HologramPanelConfig = {
  width: 1.5,
  height: 1.0,
  color: new THREE.Color(0x00ffff),
};

/**
 * Creates a set of floating holographic panels
 */
export function createHologramPanels(
  config: Partial<HologramPanelConfig> = {}
): THREE.Group {
  const { width, height, color } = { ...DEFAULT_CONFIG, ...config };
  const group = new THREE.Group();

  // Create main panel
  const panelGeometry = new THREE.PlaneGeometry(width, height);
  const panelMaterial = createHologramMaterial({
    color,
    opacity: 0.3,
    fresnelPower: 1.2,
    scanlineFrequency: 80,
    enableScanlines: true,
  });

  // Create multiple panels at different positions
  const panelPositions = [
    { x: -2.5, y: 0.5, z: 0, rotY: Math.PI * 0.15 },
    { x: 2.5, y: 0.5, z: 0, rotY: -Math.PI * 0.15 },
    { x: 0, y: 1.8, z: -1, rotY: 0, rotX: -Math.PI * 0.1 },
  ];

  panelPositions.forEach((pos, index) => {
    const panel = new THREE.Mesh(panelGeometry.clone(), panelMaterial.clone());
    panel.position.set(pos.x, pos.y, pos.z);
    panel.rotation.y = pos.rotY;
    if (pos.rotX) panel.rotation.x = pos.rotX;

    // Add border frame
    const borderGeometry = new THREE.EdgesGeometry(panelGeometry);
    const borderMaterial = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    const border = new THREE.LineSegments(borderGeometry, borderMaterial);
    panel.add(border);

    // Add corner brackets
    addCornerBrackets(panel, width, height, color);

    // Store animation data
    panel.userData.floatOffset = index * Math.PI * 0.5;
    panel.userData.baseY = pos.y;

    group.add(panel);
  });

  return group;
}

/**
 * Adds decorative corner brackets to a panel
 */
function addCornerBrackets(
  panel: THREE.Mesh,
  width: number,
  height: number,
  color: THREE.Color
): void {
  const bracketSize = 0.15;
  const bracketMaterial = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
  });

  const corners = [
    { x: -width / 2, y: height / 2, dx: 1, dy: -1 },
    { x: width / 2, y: height / 2, dx: -1, dy: -1 },
    { x: -width / 2, y: -height / 2, dx: 1, dy: 1 },
    { x: width / 2, y: -height / 2, dx: -1, dy: 1 },
  ];

  corners.forEach((corner) => {
    const points = [
      new THREE.Vector3(corner.x, corner.y + corner.dy * bracketSize, 0.01),
      new THREE.Vector3(corner.x, corner.y, 0.01),
      new THREE.Vector3(corner.x + corner.dx * bracketSize, corner.y, 0.01),
    ];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const bracket = new THREE.Line(geometry, bracketMaterial);
    panel.add(bracket);
  });
}

/**
 * Updates panel animations
 */
export function updateHologramPanels(panels: THREE.Group, time: number): void {
  panels.children.forEach((child) => {
    if (child instanceof THREE.Mesh) {
      // Gentle floating animation
      const offset = child.userData.floatOffset || 0;
      const baseY = child.userData.baseY || child.position.y;
      child.position.y = baseY + Math.sin(time * 0.5 + offset) * 0.05;

      // Update shader time
      if (child.material instanceof THREE.ShaderMaterial) {
        child.material.uniforms.uTime.value = time;
      }
    }
  });
}
