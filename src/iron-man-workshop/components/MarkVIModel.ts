/**
 * MarkVIModel
 * Loads the articulated Mark VI GLB model with per-limb references for manipulation
 *
 * Performance characteristics:
 * - Uses meshopt compression for optimal asset delivery
 * - Implements BVH-accelerated raycasting on all meshes and hit volumes
 * - Per-limb spherical hit volumes for O(1) raycasting (vs O(n) triangles)
 * - Object pooling pattern: no allocations in hot paths
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import {
  computeBoundsTree,
  disposeBoundsTree,
  acceleratedRaycast,
} from 'three-mesh-bvh';
import { createWorkshopMaterial } from '../materials/WorkshopMaterial';

// Register BVH extension methods on Three.js prototypes (once at module load)
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Import articulated GLB model with separated limbs
import modelUrl from '../assets/mark-vi-articulated-v2.glb?url';

// =============================================================================
// Types
// =============================================================================

/** Limb names matching mesh object names in the GLB */
export type LimbName = 'arm_left' | 'arm_right' | 'leg_left' | 'leg_right';

/** All valid limb names for iteration */
export const LIMB_NAMES: readonly LimbName[] = [
  'arm_left',
  'arm_right',
  'leg_left',
  'leg_right',
] as const;

/** Reference to a manipulable limb */
export interface LimbReference {
  /** The Object3D (mesh or group) for this limb */
  mesh: THREE.Object3D;
  /** Invisible sphere for fast hit testing */
  hitVolume: THREE.Mesh;
  /** Offset from mesh origin to rotation pivot (shoulder/hip) */
  pivotOffset: THREE.Vector3;
  /** Shader meshes for this limb (for hover effects) */
  shaderMeshes: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[];
}

export interface MarkVIModelConfig {
  /** Primary hologram color */
  color: THREE.Color;
  /** Scale multiplier for the model */
  scale: number;
}

const DEFAULT_CONFIG: MarkVIModelConfig = {
  color: new THREE.Color(0x00ff88),
  scale: 1.0,
};

export interface MarkVIModelResult {
  /** The Three.js group containing the loaded model */
  group: THREE.Group;
  /** Promise that resolves when the model is fully loaded */
  loadPromise: Promise<void>;
  /** Map of limb name → limb reference (populated after load) */
  limbs: Map<LimbName, LimbReference>;
  /** Body hit volume for non-limb grabs */
  bodyHitVolume: THREE.Mesh | null;
}

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Find an object by name (case-insensitive)
 */
function findObjectByNameCI(
  parent: THREE.Object3D,
  name: string
): THREE.Object3D | null {
  let result: THREE.Object3D | null = null;
  parent.traverse((child) => {
    if (child.name.toLowerCase() === name.toLowerCase()) {
      result = child;
    }
  });
  return result;
}

/**
 * Collect all shader meshes from an object and its children
 */
function collectShaderMeshes(
  obj: THREE.Object3D
): THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] {
  const meshes: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[] = [];
  obj.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      child.material instanceof THREE.ShaderMaterial
    ) {
      meshes.push(
        child as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
      );
    }
  });
  return meshes;
}

// =============================================================================
// Main loader function
// =============================================================================

/**
 * Creates and loads the articulated Mark VI model with limb references
 *
 * @param config - Configuration options for the hologram appearance
 * @returns Object containing the group, load promise, and limb references
 */
export function loadMarkVIModel(
  config: Partial<MarkVIModelConfig> = {}
): MarkVIModelResult {
  const { color, scale } = { ...DEFAULT_CONFIG, ...config };
  const group = new THREE.Group();
  group.scale.setScalar(scale);

  // Initialize limbs map (will be populated after load)
  const limbs = new Map<LimbName, LimbReference>();

  // Placeholder for body hit volume
  let bodyHitVolume: THREE.Mesh | null = null;

  const loadPromise = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // Create shared materials
        const edgeMaterial = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
        });

        // Collect shader meshes for each limb
        const limbShaderMeshes = new Map<
          string,
          THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[]
        >();
        LIMB_NAMES.forEach((name) => limbShaderMeshes.set(name, []));

        // Apply holographic material to all meshes and compute BVH
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.userData.originalMaterial = child.material;

            // Apply holographic shader material
            child.material = createWorkshopMaterial({
              color,
              opacity: 0.1,
              fresnelPower: 2.5,
              scanlineFrequency: 60,
              enableScanlines: true,
            });

            // Generate wireframe edges
            const edges = new THREE.EdgesGeometry(child.geometry, 20);
            const wireframe = new THREE.LineSegments(
              edges,
              edgeMaterial.clone()
            );
            child.add(wireframe);

            // Compute BVH for accelerated raycasting
            child.geometry.computeBoundsTree();

            // Categorize shader mesh by limb name
            const meshName = child.name.toLowerCase();
            for (const limbName of LIMB_NAMES) {
              if (meshName === limbName || meshName.includes(limbName)) {
                limbShaderMeshes
                  .get(limbName)
                  ?.push(
                    child as THREE.Mesh<
                      THREE.BufferGeometry,
                      THREE.ShaderMaterial
                    >
                  );
                break;
              }
            }
          }
        });

        // Center the model at origin
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // Force world matrix update so subsequent bounding box calculations are correct
        model.updateMatrixWorld(true);

        group.add(model);

        // Log all mesh names in the model for debugging
        console.log('[MarkVIModel] Mesh names in GLB:');
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            console.log(`  - "${child.name}"`);
          }
        });

        // Extract limb references using case-insensitive matching
        // and collect shader meshes for each limb
        for (const limbName of LIMB_NAMES) {
          // Find limb object by name (case-insensitive) using helper
          const limbObject = findObjectByNameCI(model, limbName);

          if (limbObject) {
            // Collect all shader meshes that are part of this limb
            const limbShaderMeshesArray = collectShaderMeshes(limbObject);

            // Compute bounding sphere for this limb (now in correct world space)
            const limbBox = new THREE.Box3().setFromObject(limbObject);
            const limbWorldCenter = limbBox.getCenter(new THREE.Vector3());
            const limbSize = limbBox.getSize(new THREE.Vector3());
            const radius = Math.max(limbSize.x, limbSize.y, limbSize.z) * 0.55;

            // Create invisible hit volume sphere
            const hitGeometry = new THREE.SphereGeometry(radius, 8, 8);
            hitGeometry.computeBoundsTree();
            const hitMaterial = new THREE.MeshBasicMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0,
              depthWrite: false,
            });
            const hitVolume = new THREE.Mesh(hitGeometry, hitMaterial);
            hitVolume.userData = { isHitVolume: true, limbType: limbName };

            // Position hit volume in group's local space
            // Since group has identity transform, world center = group-local center
            hitVolume.position.copy(limbWorldCenter);

            // Add to group (not limb) - static position but correct for raycasting
            // The schematic rotation applies to the group, which includes hit volumes
            group.add(hitVolume);

            limbs.set(limbName, {
              mesh: limbObject,
              hitVolume,
              pivotOffset: new THREE.Vector3(0, 0, 0), // GLB now has correct origins
              shaderMeshes: limbShaderMeshesArray,
            });

            console.log(
              `[MarkVIModel] Found limb "${limbName}" with ${
                limbShaderMeshesArray.length
              } shader meshes, hitVolume radius: ${radius.toFixed(3)}`
            );
          } else {
            console.warn(`[MarkVIModel] Limb "${limbName}" not found in GLB`);
          }
        }

        // Create body hit volume for non-limb grabs
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const bodyHitGeometry = new THREE.SphereGeometry(maxDim * 0.6, 8, 8);
        bodyHitGeometry.computeBoundsTree();
        const bodyHitMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        bodyHitVolume = new THREE.Mesh(bodyHitGeometry, bodyHitMaterial);
        bodyHitVolume.userData = { isHitVolume: true, isBody: true };
        bodyHitVolume.layers.set(0); // Layer 0 for body
        group.userData.hitVolume = bodyHitVolume;
        group.add(bodyHitVolume);

        console.log(
          `[MarkVIModel] Articulated GLB loaded with ${limbs.size} limbs`
        );
        resolve();
      },
      (progress) => {
        if (progress.lengthComputable) {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`[MarkVIModel] Loading: ${percent.toFixed(1)}%`);
        }
      },
      (error) => {
        console.error('[MarkVIModel] Failed to load GLB model:', error);
        reject(error);
      }
    );
  });

  return { group, loadPromise, limbs, bodyHitVolume };
}

// =============================================================================
// Shader update utilities
// =============================================================================

export type ShaderMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

/**
 * Updates hologram model shader uniforms using pre-cached mesh array
 * Zero allocations - safe for hot path
 */
export function updateMarkVIModelCached(
  cachedMeshes: ShaderMesh[],
  time: number
): void {
  for (const mesh of cachedMeshes) {
    mesh.material.uniforms.uTime.value = time;
  }
}

/**
 * @deprecated Use updateMarkVIModelCached() with pre-cached meshes
 */
export function updateMarkVIModel(model: THREE.Group, time: number): void {
  model.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      child.material instanceof THREE.ShaderMaterial
    ) {
      child.material.uniforms.uTime.value = time;
    }
  });
}
