/**
 * VoxelBuilderRenderer — Three.js Scene for 3D Voxel Drawing
 *
 * Manages the WebGL scene, camera, lighting, ground grid, instanced box
 * rendering, edge highlighting, and the ghost-preview cursor. Uses
 * InstancedMesh for efficient batch rendering of up to 1000 cubes.
 *
 * All placed boxes, edges, and the ghost preview live inside a rotatable
 * `buildGroup`. Left-hand pinch rotation controls this group, creating a
 * turntable effect while the camera stays fixed. The controller transforms
 * pinch positions into group-local space so drawing works from any angle.
 */

import * as THREE from 'three';
import { VoxelBuilderConfig, VoxelColorPalette, VOXEL_PALETTES } from './types';
import { VoxelGrid } from './VoxelGrid';

/**
 * Interpolation factor for smooth group rotation animation (0–1).
 * Higher values make the rotation respond faster; lower values
 * produce heavier easing.
 */
const ROTATION_LERP_FACTOR = 0.12;

/**
 * Maximum tilt angle around X-axis in radians.
 * Prevents the view from flipping upside down.
 */
const MAX_TILT = Math.PI / 3;

/** Per-box metadata stored alongside each InstancedMesh instance */
interface BoxRecord {
  gx: number;
  gy: number;
  gz: number;
  /** Corresponding index into the InstancedMesh instance array */
  instanceIndex: number;
}

export class VoxelBuilderRenderer {
  private readonly container: HTMLElement;
  private readonly config: VoxelBuilderConfig;
  private readonly grid: VoxelGrid;

  // Three.js core
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  // Lighting
  private ambientLight!: THREE.AmbientLight;
  private directionalLight!: THREE.DirectionalLight;
  private fillLight!: THREE.DirectionalLight;

  // Ground reference (stays in world space — not rotated)
  private groundMesh!: THREE.Mesh;
  private groundMaterial!: THREE.ShaderMaterial;

  // Build group — rotatable parent for all voxels, edges, and ghost
  private buildGroup!: THREE.Group;

  // Instanced rendering (children of buildGroup)
  private instancedMesh!: THREE.InstancedMesh;
  private boxGeometry!: THREE.BoxGeometry;
  private boxMaterial!: THREE.MeshStandardMaterial;
  private instanceCount = 0;

  // Edge lines — one LineSegments per placed box for clear visual separation
  private edgeGroup!: THREE.Group;
  private edgeMaterial!: THREE.LineBasicMaterial;

  // Ghost preview box (children of buildGroup)
  private ghostMesh!: THREE.Mesh;
  private ghostEdge!: THREE.LineSegments;

  // Build group rotation targets for smooth interpolation
  /** Target Y-axis rotation (horizontal turntable) in radians */
  private targetRotY = 0;
  /** Target X-axis rotation (vertical tilt) in radians */
  private targetRotX = 0;

  // Box records — ordered list mirroring InstancedMesh instance indices
  private boxes: BoxRecord[] = [];

  // Active color palette
  private palette: VoxelColorPalette = VOXEL_PALETTES[0];

  // Erase mode flag (controls ghost color)
  private eraseMode = false;

  // Ghost material references for erase-mode color switching
  private ghostMeshMaterial!: THREE.MeshStandardMaterial;
  private ghostEdgeMaterial!: THREE.LineBasicMaterial;

  // Reusable temporaries to avoid per-frame allocations
  private readonly _matrix = new THREE.Matrix4();
  private readonly _color = new THREE.Color();
  private readonly _inverseQuat = new THREE.Quaternion();

  constructor(container: HTMLElement, config: VoxelBuilderConfig, grid: VoxelGrid) {
    this.container = container;
    this.config = config;
    this.grid = grid;
  }

  /** Bootstrap the entire Three.js scene graph. */
  initialize(): void {
    this.createRenderer();
    this.createScene();
    this.createCamera();
    this.createLights();
    this.createGroundGrid();
    this.createBuildGroup();
    this.createInstancedMesh();
    this.createGhostPreview();
    this.handleResize();

    window.addEventListener('resize', this.onResize);
  }

  // ---------------------------------------------------------------------------
  // Scene construction
  // ---------------------------------------------------------------------------

  private createRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Overlay the Three.js canvas on top of the video feed
    this.renderer.domElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10;
    `;
    this.container.appendChild(this.renderer.domElement);
  }

  private createScene(): void {
    this.scene = new THREE.Scene();
  }

  private createCamera(): void {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.1, 200);

    // Elevated frontal view — gives a good 3/4 perspective of the build area
    this.camera.position.set(0, 3, 8);
    this.camera.lookAt(0, 0, 0);
  }

  private createLights(): void {
    // Soft ambient base
    this.ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(this.ambientLight);

    // Main key light — strong directional from upper-right
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    this.directionalLight.position.set(5, 10, 7);
    this.scene.add(this.directionalLight);

    // Subtle fill light from the opposite side to reduce harsh shadows
    this.fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    this.fillLight.position.set(-4, 3, -5);
    this.scene.add(this.fillLight);
  }

  private createGroundGrid(): void {
    const size = 30; // Large plane for radial fade
    const geometry = new THREE.PlaneGeometry(size, size);

    this.groundMaterial = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      uniforms: {
        uColor: { value: new THREE.Color(0x00aaff) }, // Softer cyan-blue
        uCellSize: { value: this.config.cellSize },
      },
      blending: THREE.NormalBlending,
      depthWrite: false,
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform vec3 uColor;
        uniform float uCellSize;

        float grid(vec2 p, float width) {
          vec2 dg = fwidth(p);
          vec2 g = abs(fract(p - 0.5) - 0.5) / dg;
          return 1.0 - smoothstep(0.0, width, min(g.x, g.y));
        }

        void main() {
          vec2 worldPos = (vUv - 0.5) * 30.0;
          vec2 gridPos = worldPos / uCellSize;
          
          float line = grid(gridPos, 1.2);
          float subLine = grid(gridPos * 5.0, 0.5) * 0.2;
          float visual = max(line, subLine);

          float dist = length(vUv - 0.5);
          float fade = smoothstep(0.5, 0.0, dist);
          
          float floorGlow = (1.0 - smoothstep(0.0, 0.45, dist)) * 0.05;
          float alpha = max(visual * 0.4, floorGlow) * fade;

          gl_FragColor = vec4(uColor, alpha * 0.6);
        }
      `,
    });

    this.groundMesh = new THREE.Mesh(geometry, this.groundMaterial);
    // Lay flat on XZ plane
    this.groundMesh.rotation.x = -Math.PI / 2;
    // Tiny offset below origin to prevent z-fighting with boxes on y=0
    this.groundMesh.position.y = -0.01;
    this.scene.add(this.groundMesh);
  }

  /**
   * Create the rotatable parent group for all voxels.
   * Rotation is applied to this group — the camera and ground grid stay fixed.
   */
  private createBuildGroup(): void {
    this.buildGroup = new THREE.Group();
    this.scene.add(this.buildGroup);
  }

  private createInstancedMesh(): void {
    const cs = this.config.cellSize;
    this.boxGeometry = new THREE.BoxGeometry(cs, cs, cs);
    this.boxMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.4,
      metalness: 0.15,
    });

    this.instancedMesh = new THREE.InstancedMesh(
      this.boxGeometry,
      this.boxMaterial,
      this.config.maxBoxes
    );
    this.instancedMesh.count = 0; // Nothing visible initially
    this.instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    // Attach to build group so rotation affects all boxes
    this.buildGroup.add(this.instancedMesh);

    // Edge line container
    this.edgeGroup = new THREE.Group();
    this.buildGroup.add(this.edgeGroup);

    this.edgeMaterial = new THREE.LineBasicMaterial({
      color: 0x000000,
      opacity: 0.5,
      transparent: true,
    });
  }

  private createGhostPreview(): void {
    const cs = this.config.cellSize;
    const ghostGeo = new THREE.BoxGeometry(cs, cs, cs);

    this.ghostMeshMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      roughness: 0.6,
      depthWrite: false,
    });
    this.ghostMesh = new THREE.Mesh(ghostGeo, this.ghostMeshMaterial);
    this.ghostMesh.visible = false;
    this.buildGroup.add(this.ghostMesh);

    const edgesGeo = new THREE.EdgesGeometry(ghostGeo);
    this.ghostEdgeMaterial = new THREE.LineBasicMaterial({
      color: 0xffffff,
      opacity: 0.6,
      transparent: true,
    });
    this.ghostEdge = new THREE.LineSegments(edgesGeo, this.ghostEdgeMaterial);
    this.ghostEdge.visible = false;
    this.buildGroup.add(this.ghostEdge);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Place a voxel at the given grid coordinates.
   *
   * @param gx - Grid X index
   * @param gy - Grid Y index
   * @param gz - Grid Z index
   */
  addBox(gx: number, gy: number, gz: number): void {
    const pos = this.grid.gridToWorld({ gx, gy, gz });
    const idx = this.instanceCount;

    // Set instance transform (translation only — no rotation or scale)
    this._matrix.makeTranslation(pos.x, pos.y, pos.z);
    this.instancedMesh.setMatrixAt(idx, this._matrix);

    // Assign initial color (will be overridden by updateAllColors)
    this.instancedMesh.setColorAt(idx, this._color.set(0xffffff));

    this.instanceCount++;
    this.instancedMesh.count = this.instanceCount;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    // Create edge highlight for this box
    const edgesGeo = new THREE.EdgesGeometry(this.boxGeometry);
    const edge = new THREE.LineSegments(edgesGeo, this.edgeMaterial);
    edge.position.copy(pos);
    this.edgeGroup.add(edge);

    this.boxes.push({ gx, gy, gz, instanceIndex: idx });

    // Re-color everything so the gradient stays consistent
    this.updateAllColors();
  }

  /**
   * Recompute the color of every placed box using the active palette.
   *
   * Interpolates between `palette.bottomHSL` and `palette.topHSL`
   * based on each box's normalized Y-position within the build.
   */
  updateAllColors(): void {
    const { minY, maxY } = this.grid.getYRange();
    const range = maxY - minY;
    const [bH, bS, bL] = this.palette.bottomHSL;
    const [tH, tS, tL] = this.palette.topHSL;

    for (const box of this.boxes) {
      const t = range === 0 ? 0.5 : (box.gy - minY) / range;

      // Lerp between bottom and top HSL
      const h = bH + (tH - bH) * t;
      const s = bS + (tS - bS) * t;
      const l = bL + (tL - bL) * t;
      this._color.setHSL(h, s, l);

      this.instancedMesh.setColorAt(box.instanceIndex, this._color);
    }

    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  /**
   * Remove the voxel at the given grid coordinates from the scene.
   *
   * Uses swap-with-last compaction: the removed instance is overwritten
   * by the last instance in the array, then `count` is decremented.
   * This avoids shifting the entire InstancedMesh buffer on each delete.
   *
   * @returns `true` if a box was found and removed
   */
  removeBox(gx: number, gy: number, gz: number): boolean {
    const idx = this.boxes.findIndex((b) => b.gx === gx && b.gy === gy && b.gz === gz);
    if (idx === -1) return false;

    const lastIdx = this.instanceCount - 1;
    const removedRecord = this.boxes[idx];

    if (removedRecord.instanceIndex !== lastIdx) {
      // Copy the last instance's transform + color into the removed slot
      const lastRecord = this.boxes.find((b) => b.instanceIndex === lastIdx)!;

      const tempMatrix = new THREE.Matrix4();
      this.instancedMesh.getMatrixAt(lastIdx, tempMatrix);
      this.instancedMesh.setMatrixAt(removedRecord.instanceIndex, tempMatrix);

      if (this.instancedMesh.instanceColor) {
        const tempColor = new THREE.Color();
        this.instancedMesh.getColorAt(lastIdx, tempColor);
        this.instancedMesh.setColorAt(removedRecord.instanceIndex, tempColor);
      }

      lastRecord.instanceIndex = removedRecord.instanceIndex;
    }

    // Remove the box record
    this.boxes.splice(idx, 1);
    this.instanceCount--;
    this.instancedMesh.count = this.instanceCount;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }

    // Remove corresponding edge line segment
    if (idx < this.edgeGroup.children.length) {
      const edgeChild = this.edgeGroup.children[idx];
      if (edgeChild instanceof THREE.LineSegments) {
        edgeChild.geometry.dispose();
      }
      this.edgeGroup.remove(edgeChild);
    }

    // Re-color after removal to adjust gradient
    this.updateAllColors();
    return true;
  }

  /**
   * Toggle erase mode — changes the ghost preview to a red hologram
   * to visually indicate destructive intent.
   */
  setEraseMode(active: boolean): void {
    if (this.eraseMode === active) return;
    this.eraseMode = active;

    if (active) {
      this.ghostMeshMaterial.color.setHex(0xff2233);
      this.ghostMeshMaterial.opacity = 0.35;
      this.ghostMeshMaterial.emissive.setHex(0xff0000);
      this.ghostMeshMaterial.emissiveIntensity = 0.4;
      this.ghostEdgeMaterial.color.setHex(0xff4444);
    } else {
      this.ghostMeshMaterial.color.setHex(0xffffff);
      this.ghostMeshMaterial.opacity = 0.2;
      this.ghostMeshMaterial.emissive.setHex(0x000000);
      this.ghostMeshMaterial.emissiveIntensity = 0;
      this.ghostEdgeMaterial.color.setHex(0xffffff);
    }
  }

  /**
   * Apply a color palette to the scene.
   *
   * Updates the box material properties, edge line color, and
   * re-colors all existing voxels to match the new theme.
   */
  setPalette(palette: VoxelColorPalette): void {
    this.palette = palette;

    // Update material properties
    this.boxMaterial.roughness = palette.roughness;
    this.boxMaterial.metalness = palette.metalness;
    this.boxMaterial.needsUpdate = true;

    // Update edge color
    this.edgeMaterial.color.setHex(palette.edgeColor);

    // Re-color all boxes with the new palette
    this.updateAllColors();
  }

  /**
   * Move the semi-transparent ghost box to show where the next voxel
   * would snap. Hides the ghost when `visible` is `false`.
   */
  updateGhostPreview(worldPos: THREE.Vector3, visible: boolean): void {
    this.ghostMesh.visible = visible;
    this.ghostEdge.visible = visible;

    if (visible) {
      this.ghostMesh.position.copy(worldPos);
      this.ghostEdge.position.copy(worldPos);
    }
  }

  /**
   * Render a single frame with smooth group rotation interpolation.
   *
   * @param _timestamp - Current frame time (unused)
   */
  render(_timestamp: number): void {
    this.updateGroupRotation();
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------------------
  // Build group rotation (turntable)
  // ---------------------------------------------------------------------------

  /**
   * Apply incremental rotation to the build group.
   *
   * @param deltaY - Horizontal rotation in radians (positive = counter-clockwise from above)
   * @param deltaX - Vertical tilt in radians (positive = tilt up)
   */
  applyRotationDelta(deltaY: number, deltaX: number): void {
    this.targetRotY += deltaY;
    this.targetRotX = Math.max(-MAX_TILT, Math.min(MAX_TILT, this.targetRotX + deltaX));
  }

  /** Reset the build group to its default (un-rotated) orientation. */
  resetRotation(): void {
    this.targetRotY = 0;
    this.targetRotX = 0;
  }

  /**
   * Get the inverse of the build group's current world quaternion.
   *
   * Used by the controller to transform pinch world-space positions into
   * the build group's local coordinate space, so drawing works correctly
   * regardless of the current rotation angle.
   *
   * @returns A new quaternion representing the inverse of the group's rotation
   */
  getInverseGroupQuaternion(): THREE.Quaternion {
    this._inverseQuat.copy(this.buildGroup.quaternion).invert();
    return this._inverseQuat;
  }

  /**
   * Smoothly interpolate the build group's rotation toward the target angles.
   * Uses separate lerp on each Euler axis for predictable, gimbal-safe behavior
   * (tilt angle is clamped to prevent flipping).
   */
  private updateGroupRotation(): void {
    this.buildGroup.rotation.y +=
      (this.targetRotY - this.buildGroup.rotation.y) * ROTATION_LERP_FACTOR;
    this.buildGroup.rotation.x +=
      (this.targetRotX - this.buildGroup.rotation.x) * ROTATION_LERP_FACTOR;
  }

  /** Release all GPU resources. */
  dispose(): void {
    window.removeEventListener('resize', this.onResize);

    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material?.dispose();
        }
      }
    });

    this.renderer.dispose();
    this.renderer.domElement.remove();

    this.boxes = [];
    this.instanceCount = 0;
  }

  /** Remove all placed boxes from the scene and reset the instanced mesh. */
  clearBoxes(): void {
    this.instanceCount = 0;
    this.instancedMesh.count = 0;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.boxes = [];

    // Remove all edge line segments
    while (this.edgeGroup.children.length > 0) {
      const child = this.edgeGroup.children[0];
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
      }
      this.edgeGroup.remove(child);
    }
  }

  // ---------------------------------------------------------------------------
  // Responsive handling
  // ---------------------------------------------------------------------------

  private onResize = (): void => {
    this.handleResize();
  };

  private handleResize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
