/**
 * @fileoverview FilamentGlowMesh - Creates the volumetric light source mesh.
 *
 * Provides a properly configured mesh for use with GodRaysEffect.
 * The mesh is a small sphere positioned at the filament location with:
 * - MeshBasicMaterial for pure emissive appearance
 * - depthWrite: false (required for GodRaysEffect)
 * - transparent: true
 * - Additive blending for proper light accumulation
 *
 * @module light-bulb/components/FilamentGlowMesh
 */

import * as THREE from 'three';

/**
 * Color temperature presets in Kelvin and corresponding hex colors.
 * Based on black-body radiation color temperature approximations.
 */
export const COLOR_TEMPERATURES = {
  /** Candle flame (~1850K) */
  CANDLE: 0xff6600,
  /** Incandescent warm-up (~2000K) */
  WARM_UP: 0xff8800,
  /** Warm white incandescent (~2700K) */
  WARM_WHITE: 0xffeedd,
  /** Neutral white (~4000K) */
  NEUTRAL: 0xfff4e0,
} as const;

/**
 * Configuration for the filament glow mesh.
 */
export interface FilamentGlowConfig {
  /** Radius of the glow sphere */
  radius: number;

  /** Number of width segments for the sphere geometry */
  widthSegments: number;

  /** Number of height segments for the sphere geometry */
  heightSegments: number;

  /** Initial color of the glow */
  color: number;

  /** Initial opacity (0-1) */
  opacity: number;
}

/** Default configuration for filament glow */
const DEFAULT_CONFIG: FilamentGlowConfig = {
  radius: 0.02,
  widthSegments: 16,
  heightSegments: 8,
  color: COLOR_TEMPERATURES.WARM_WHITE,
  opacity: 0,
};

/**
 * Creates and manages the volumetric light source mesh for God Rays.
 *
 * This mesh is positioned at the filament location and serves as the
 * origin point for volumetric light scattering effects. It does not
 * write to the depth buffer, allowing the God Rays effect to properly
 * accumulate light contribution.
 *
 * @example
 * ```typescript
 * const filamentGlow = new FilamentGlowMesh();
 * scene.add(filamentGlow.mesh);
 * pipeline.setup(filamentGlow.mesh);
 *
 * // During light transition
 * filamentGlow.setIntensity(0.8);
 * filamentGlow.setColorTemperature(2700);
 * ```
 */
export class FilamentGlowMesh {
  /** The Three.js mesh instance */
  public readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;

  private readonly config: FilamentGlowConfig;
  private currentIntensity: number = 0;

  /**
   * Creates a new filament glow mesh.
   *
   * @param config - Optional configuration overrides
   */
  constructor(config: Partial<FilamentGlowConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    const geometry = new THREE.SphereGeometry(
      this.config.radius,
      this.config.widthSegments,
      this.config.heightSegments
    );

    // MeshBasicMaterial is required for GodRaysEffect - it needs pure emissive appearance
    const material = new THREE.MeshBasicMaterial({
      color: this.config.color,
      transparent: true,
      opacity: this.config.opacity,
      depthWrite: false, // Critical for GodRaysEffect
      blending: THREE.AdditiveBlending,
      fog: false, // Unaffected by scene fog
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'FilamentGlowSource';

    // Prevent this mesh from casting/receiving shadows
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;

    // Disable matrix auto-update for performance (we'll manually update position)
    this.mesh.matrixAutoUpdate = false;
  }

  /**
   * Sets the glow intensity for light on/off transitions.
   *
   * @param intensity - Normalized intensity (0-1)
   */
  setIntensity(intensity: number): void {
    this.currentIntensity = THREE.MathUtils.clamp(intensity, 0, 1);

    // Scale opacity with intensity
    // Use an ease-out curve for more realistic warm-up
    const opacity = Math.pow(intensity, 0.7);
    this.mesh.material.opacity = opacity;

    this.mesh.material.needsUpdate = true;
  }

  /**
   * Gets the current intensity value.
   *
   * @returns Current intensity (0-1)
   */
  getIntensity(): number {
    return this.currentIntensity;
  }

  /**
   * Sets the glow color.
   *
   * @param color - Hex color value
   */
  setColor(color: number): void {
    this.mesh.material.color.setHex(color);
    this.mesh.material.needsUpdate = true;
  }

  /**
   * Interpolates color based on intensity for realistic filament warm-up.
   * Cold → Dim orange → Warm white
   *
   * @param intensity - Normalized intensity (0-1)
   */
  updateColorForIntensity(intensity: number): void {
    const coldColor = new THREE.Color(COLOR_TEMPERATURES.CANDLE);
    const warmColor = new THREE.Color(COLOR_TEMPERATURES.WARM_WHITE);

    // Use an S-curve for color transition (fast initial shift, then plateau)
    const colorT = Math.pow(intensity, 0.5);
    const blendedColor = coldColor.clone().lerp(warmColor, colorT);

    this.mesh.material.color.copy(blendedColor);
    this.mesh.material.needsUpdate = true;
  }

  /**
   * Updates the mesh position.
   *
   * @param position - World position for the glow source
   */
  setPosition(position: THREE.Vector3): void {
    this.mesh.position.copy(position);
    this.mesh.updateMatrix();
  }

  /**
   * Updates the mesh position from x, y, z coordinates.
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param z - Z coordinate
   */
  setPositionXYZ(x: number, y: number, z: number): void {
    this.mesh.position.set(x, y, z);
    this.mesh.updateMatrix();
  }

  /**
   * Scales the glow mesh for intensity-based size variation.
   *
   * @param scale - Uniform scale factor
   */
  setScale(scale: number): void {
    this.mesh.scale.setScalar(scale);
    this.mesh.updateMatrix();
  }

  /**
   * Disposes of mesh resources.
   */
  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
