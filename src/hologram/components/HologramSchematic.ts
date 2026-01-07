/**
 * HologramSchematic
 * Central holographic 3D schematic (geometric placeholder for Iron Man suit)
 */

import * as THREE from 'three';
import { createHologramMaterial } from '../materials/HologramMaterial';
import type { LimbUserData } from '../types';

export interface HologramSchematicConfig {
  color: THREE.Color;
  scale: number;
}

const DEFAULT_CONFIG: HologramSchematicConfig = {
  color: new THREE.Color(0x00ff88),
  scale: 1.0,
};

/**
 * Creates a central holographic schematic
 * For Phase 1, this is a geometric placeholder that evokes the Iron Man suit
 */
export function createHologramSchematic(
  config: Partial<HologramSchematicConfig> = {}
): THREE.Group {
  const { color, scale } = { ...DEFAULT_CONFIG, ...config };
  const group = new THREE.Group();
  group.scale.setScalar(scale);

  // Create body/torso (box)
  const torsoGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.4);
  const torsoMaterial = createHologramMaterial({
    color,
    opacity: 0.4,
    fresnelPower: 2.0,
    scanlineFrequency: 60,
    enableScanlines: true,
  });
  const torso = new THREE.Mesh(torsoGeometry, torsoMaterial);
  torso.position.y = 0;

  // Add wireframe edges
  const torsoEdges = new THREE.EdgesGeometry(torsoGeometry);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
  });
  const torsoWireframe = new THREE.LineSegments(torsoEdges, edgeMaterial);
  torso.add(torsoWireframe);
  group.add(torso);

  // Create head (sphere)
  const headGeometry = new THREE.SphereGeometry(0.25, 16, 12);
  const headMaterial = createHologramMaterial({
    color,
    opacity: 0.5,
    fresnelPower: 2.5,
    enableScanlines: false,
  });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 0.85;

  const headEdges = new THREE.EdgesGeometry(headGeometry);
  const headWireframe = new THREE.LineSegments(headEdges, edgeMaterial.clone());
  head.add(headWireframe);
  group.add(head);

  // Create arms (cylinders) with pivot groups for independent manipulation
  const armGeometry = new THREE.CylinderGeometry(0.1, 0.12, 0.8, 8);
  const armMaterial = createHologramMaterial({
    color,
    opacity: 0.4,
    fresnelPower: 1.8,
    enableScanlines: true,
    scanlineFrequency: 40,
  });

  // Left arm with pivot at shoulder joint (top corner of torso)
  const leftArmPivot = new THREE.Group();
  leftArmPivot.position.set(-0.4, 0.5, 0); // Shoulder at top-left of torso
  leftArmPivot.userData = {
    isLimbPivot: true,
    limbSide: 'left',
    limbType: 'arm',
  };

  const leftArm = new THREE.Mesh(armGeometry, armMaterial);
  // Arm cylinder is 0.8 tall, center it below the pivot so it hangs down
  // At rest: arm hangs straight down from shoulder
  leftArm.position.set(-0.1, -0.4, 0); // Slightly outward, hanging down
  leftArm.rotation.z = 0; // No initial rotation - arm hangs straight down
  const leftArmData: LimbUserData = {
    limbType: 'arm',
    limbSide: 'left',
    axis: 'vertical',
  };
  leftArm.userData = leftArmData;

  const leftArmEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(armGeometry),
    edgeMaterial.clone()
  );
  leftArm.add(leftArmEdges);
  leftArmPivot.add(leftArm);

  // Invisible hit volume for left arm - larger for reliable raycast
  const leftArmHitGeometry = new THREE.CylinderGeometry(0.25, 0.25, 1.0, 8);
  const armHitMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const leftArmHitVolume = new THREE.Mesh(leftArmHitGeometry, armHitMaterial);
  leftArmHitVolume.position.copy(leftArm.position);
  leftArmHitVolume.userData = { ...leftArmData, isHitVolume: true };
  leftArmPivot.add(leftArmHitVolume);

  group.add(leftArmPivot);

  // Right arm with pivot at shoulder joint (top corner of torso)
  const rightArmPivot = new THREE.Group();
  rightArmPivot.position.set(0.4, 0.5, 0); // Shoulder at top-right of torso
  rightArmPivot.userData = {
    isLimbPivot: true,
    limbSide: 'right',
    limbType: 'arm',
  };

  const rightArm = new THREE.Mesh(armGeometry, armMaterial.clone());
  // Mirror of left arm
  rightArm.position.set(0.1, -0.4, 0); // Slightly outward, hanging down
  rightArm.rotation.z = 0; // No initial rotation - arm hangs straight down
  const rightArmData: LimbUserData = {
    limbType: 'arm',
    limbSide: 'right',
    axis: 'vertical',
  };
  rightArm.userData = rightArmData;

  const rightArmEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(armGeometry),
    edgeMaterial.clone()
  );
  rightArm.add(rightArmEdges);
  rightArmPivot.add(rightArm);

  // Invisible hit volume for right arm - larger for reliable raycast
  const rightArmHitGeometry = new THREE.CylinderGeometry(0.25, 0.25, 1.0, 8);
  const rightArmHitVolume = new THREE.Mesh(
    rightArmHitGeometry,
    armHitMaterial.clone()
  );
  rightArmHitVolume.position.copy(rightArm.position);
  rightArmHitVolume.userData = { ...rightArmData, isHitVolume: true };
  rightArmPivot.add(rightArmHitVolume);

  group.add(rightArmPivot);

  // Create legs (cylinders) with pivot groups for independent manipulation
  const legGeometry = new THREE.CylinderGeometry(0.12, 0.1, 1.0, 8);

  // Left leg with pivot at hip joint
  const leftLegPivot = new THREE.Group();
  leftLegPivot.position.set(-0.25, -0.6, 0); // Hip position
  leftLegPivot.userData = {
    isLimbPivot: true,
    limbSide: 'left',
    limbType: 'leg',
  };

  const leftLeg = new THREE.Mesh(legGeometry, armMaterial.clone());
  leftLeg.position.set(0, -0.5, 0); // Offset down from hip pivot
  const leftLegData: LimbUserData = {
    limbType: 'leg',
    limbSide: 'left',
    axis: 'horizontal',
  };
  leftLeg.userData = leftLegData;

  const leftLegEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(legGeometry),
    edgeMaterial.clone()
  );
  leftLeg.add(leftLegEdges);
  leftLegPivot.add(leftLeg);
  group.add(leftLegPivot);

  // Right leg with pivot at hip joint
  const rightLegPivot = new THREE.Group();
  rightLegPivot.position.set(0.25, -0.6, 0); // Hip position
  rightLegPivot.userData = {
    isLimbPivot: true,
    limbSide: 'right',
    limbType: 'leg',
  };

  const rightLeg = new THREE.Mesh(legGeometry, armMaterial.clone());
  rightLeg.position.set(0, -0.5, 0); // Offset down from hip pivot
  const rightLegData: LimbUserData = {
    limbType: 'leg',
    limbSide: 'right',
    axis: 'horizontal',
  };
  rightLeg.userData = rightLegData;

  const rightLegEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(legGeometry),
    edgeMaterial.clone()
  );
  rightLeg.add(rightLegEdges);
  rightLegPivot.add(rightLeg);
  group.add(rightLegPivot);

  // Add arc reactor (glowing circle on chest)
  const reactorGeometry = new THREE.CircleGeometry(0.12, 16);
  const reactorMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ffff,
    transparent: true,
    opacity: 1.0,
    blending: THREE.AdditiveBlending,
  });
  const reactor = new THREE.Mesh(reactorGeometry, reactorMaterial);
  reactor.position.set(0, 0.2, 0.21);
  group.add(reactor);

  // Add decorative data lines around the schematic
  addDataLines(group, color);

  // Create invisible hit volume for interaction - sized to match schematic body
  // Standard raycaster ignores visible: false, so we use opacity: 0
  // Radius 0.45 matches torso width, length 1.4 covers head to legs
  const hitGeometry = new THREE.CapsuleGeometry(0.45, 1.4, 4, 8);
  const hitMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0,
    depthWrite: false, // Don't write to depth buffer
    side: THREE.DoubleSide,
  });
  const hitVolume = new THREE.Mesh(hitGeometry, hitMaterial);
  hitVolume.userData = { isHitVolume: true };
  group.add(hitVolume);

  return group;
}

/**
 * Adds decorative holographic data lines around the schematic
 */
function addDataLines(group: THREE.Group, color: THREE.Color): void {
  const lineMaterial = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
  });

  // Horizontal scan line
  const scanPoints = [
    new THREE.Vector3(-1.5, 0, 0.5),
    new THREE.Vector3(1.5, 0, 0.5),
  ];
  const scanGeometry = new THREE.BufferGeometry().setFromPoints(scanPoints);
  const scanLine = new THREE.Line(scanGeometry, lineMaterial);
  scanLine.userData.isDataLine = true;
  group.add(scanLine);

  // Vertical measurement lines
  for (let i = -1; i <= 1; i += 2) {
    const measurePoints = [
      new THREE.Vector3(i * 1.2, -1.6, 0.3),
      new THREE.Vector3(i * 1.2, 1.2, 0.3),
    ];
    const measureGeometry = new THREE.BufferGeometry().setFromPoints(
      measurePoints
    );
    const measureLine = new THREE.Line(measureGeometry, lineMaterial.clone());
    measureLine.userData.isDataLine = true;
    group.add(measureLine);
  }
}

/**
 * Updates schematic animations (shader time updates only, no rotation)
 */
export function updateHologramSchematic(
  schematic: THREE.Group,
  time: number,
  _deltaTime: number
): void {
  // Update all shader materials
  schematic.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      child.material instanceof THREE.ShaderMaterial
    ) {
      child.material.uniforms.uTime.value = time;
    }

    // Animate data lines
    if (child instanceof THREE.Line && child.userData.isDataLine) {
      child.position.y = Math.sin(time * 2) * 0.3;
    }
  });
}
