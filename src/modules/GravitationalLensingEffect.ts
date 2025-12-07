/**
 * GravitationalLensingEffect
 * Custom post-processing effect for screen-space distortion
 *
 * Creates a warping effect inspired by Schwarzschild metric (black hole lensing)
 * Activates when hands are very close together (pre-explosion tension)
 *
 * Architecture:
 * - Extends postprocessing library's Effect class
 * - Uses custom fragment shader for GPU-accelerated distortion
 * - Includes chromatic aberration for enhanced realism
 *
 * @see DESIGN-v2.md Phase 2.2
 */

import { Effect, BlendFunction } from 'postprocessing';
import * as THREE from 'three';

// Import shader as raw text
import gravitationalLensFragmentShader from '../shaders/gravitationalLens.frag.glsl?raw';

/**
 * Gravitational lensing configuration
 */
export interface GravitationalLensingConfig {
  /** Center of lensing effect in screen space (0-1) */
  lensCenter: THREE.Vector2;
  /** Distortion intensity (0-1) */
  intensity: number;
  /** Screen resolution for aspect ratio correction */
  resolution: THREE.Vector2;
}

/**
 * GravitationalLensingEffect
 * Screen-space distortion effect for cosmic interaction
 */
export class GravitationalLensingEffect extends Effect {
  /**
   * Creates a GravitationalLensingEffect
   */
  constructor() {
    // Initialize with custom fragment shader and uniforms
    super('GravitationalLensingEffect', gravitationalLensFragmentShader, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uLensCenter', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['uLensIntensity', new THREE.Uniform(0.0)],
        ['uResolution', new THREE.Uniform(new THREE.Vector2(1920, 1080))],
      ]),
    });
  }

  /**
   * Set the center of the lensing effect
   * @param center Screen space coordinates (0-1 range)
   */
  setLensCenter(center: THREE.Vector2): void {
    this.uniforms.get('uLensCenter')!.value.copy(center);
  }

  /**
   * Set the intensity of the lensing distortion
   * @param intensity 0-1 range (0 = no effect, 1 = maximum distortion)
   */
  setIntensity(intensity: number): void {
    const clampedIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
    this.uniforms.get('uLensIntensity')!.value = clampedIntensity;
  }

  /**
   * Update screen resolution (call on window resize)
   * @param width Screen width in pixels
   * @param height Screen height in pixels
   */
  setResolution(width: number, height: number): void {
    this.uniforms.get('uResolution')!.value.set(width, height);
  }

  /**
   * Get current intensity
   */
  getIntensity(): number {
    return this.uniforms.get('uLensIntensity')!.value;
  }
}
