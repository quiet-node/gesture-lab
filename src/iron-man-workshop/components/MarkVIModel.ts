/**
 * HologramModel
 * Loads a GLB 3D model and applies holographic shader effects
 *
 * Performance characteristics:
 * - Uses meshopt compression for optimal asset delivery (90% size reduction)
 * - Implements simplified geometry for efficient rendering
 * - Utilizes optimized geometry for selective wireframe rendering
 * - Employs fresnel shaders for performant edge highlighting
 * - Implements O(n) direct iteration for uniform updates
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
// This enables accelerated raycasting for all meshes that have a boundsTree
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// Import optimized GLB model
import modelUrl from '../assets/mark-vi-schematic.glb?url';

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
}

/**
 * Creates a holographic model by loading the GLB file and applying shader effects
 *
 * @param config - Configuration options for the hologram appearance
 * @returns Object containing the group (can be added to scene immediately) and load promise
 */
export function loadMarkVIModel(
  config: Partial<MarkVIModelConfig> = {}
): MarkVIModelResult {
  const { color, scale } = { ...DEFAULT_CONFIG, ...config };
  const group = new THREE.Group();
  group.scale.setScalar(scale);

  const loadPromise = new Promise<void>((resolve, reject) => {
    const loader = new GLTFLoader();
    // Enable meshopt decompression for the compressed GLB
    loader.setMeshoptDecoder(MeshoptDecoder);

    loader.load(
      modelUrl,
      (gltf) => {
        const model = gltf.scene;

        // Create material for wireframe rendering
        const edgeMaterial = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
        });

        // Apply holographic material to all meshes and compute BVH for raycasting
        model.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            // Store original material info for potential restoration
            child.userData.originalMaterial = child.material;

            // Apply holographic shader material for background volume
            child.material = createWorkshopMaterial({
              color,
              opacity: 0.1,
              fresnelPower: 2.5,
              scanlineFrequency: 60,
              enableScanlines: true,
            });

            // Generate wireframe geometry based on edge angle threshold
            // 20° threshold filters for structural edges while ignoring smooth curvature
            const edges = new THREE.EdgesGeometry(child.geometry, 20);
            const wireframe = new THREE.LineSegments(
              edges,
              edgeMaterial.clone()
            );
            child.add(wireframe);

            // Compute BVH for accelerated raycasting (10-100x faster)
            // This is a one-time cost at load time
            child.geometry.computeBoundsTree();
          }
        });

        // Center the model at origin
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);

        // Add the model to our group
        group.add(model);

        // Create invisible hit volume for interaction raycasting
        // Size it to encompass the entire model
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const hitGeometry = new THREE.SphereGeometry(maxDim * 0.6, 8, 8);
        const hitMaterial = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const hitVolume = new THREE.Mesh(hitGeometry, hitMaterial);
        hitVolume.userData = { isHitVolume: true };
        // Store reference for direct access (avoids recursive traversal in raycasting)
        group.userData.hitVolume = hitVolume;
        group.add(hitVolume);

        console.log('[MarkVIModel] GLB model loaded successfully');
        resolve();
      },
      (progress) => {
        // Loading progress callback
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

  return { group, loadPromise };
}

/**
 * Type alias for cached shader meshes
 */
export type ShaderMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

/**
 * Updates hologram model shader uniforms using pre-cached mesh array
 * This avoids expensive traverse() calls every frame
 *
 * @param cachedMeshes - Pre-cached array of shader meshes (from cacheSchematicShaderMeshes)
 * @param time - Current animation time
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
 * @deprecated Use updateHologramModelCached() with pre-cached meshes for better performance
 * Updates hologram model shader uniforms by traversing the scene graph
 * This is kept for backwards compatibility but should be avoided in hot paths
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
