/**
 * PostProcessingManager Module
 * Manages all post-processing effects using pmndrs/postprocessing library
 *
 * Features:
 * - Bloom effect for glowing particles (HDR-quality)
 * - Chromatic aberration for lens distortion
 * - LUT-based color grading for cosmic atmosphere
 *
 * Architecture:
 * - Single Responsibility: Manages post-processing pipeline only
 * - Dependency Injection: Accepts renderer, scene, camera
 * - Clean disposal pattern for resource management
 *
 * @see https://github.com/pmndrs/postprocessing
 */

import * as THREE from 'three';
import {
  EffectComposer,
  EffectPass,
  RenderPass,
  BloomEffect,
  ChromaticAberrationEffect,
  LUT3DEffect,
  BlendFunction,
  KernelSize,
} from 'postprocessing';
import { GravitationalLensingEffect } from './GravitationalLensingEffect';

/**
 * Post-processing configuration
 */
export interface PostProcessingConfig {
  /** Enable bloom effect (glow) */
  enableBloom: boolean;
  /** Bloom intensity (0-10, default 1.5) */
  bloomIntensity: number;
  /** Bloom luminance threshold (0-1, default 0.4) */
  bloomLuminanceThreshold: number;
  /** Bloom radius (0-1, default 0.8) */
  bloomRadius: number;

  /** Enable chromatic aberration (lens distortion) */
  enableChromaticAberration: boolean;
  /** Chromatic aberration offset (default 0.001) */
  chromaticAberrationOffset: number;

  /** Enable color grading (cosmic palette) */
  enableColorGrading: boolean;
  /** Color grading intensity (0-1, default 0.8) */
  colorGradingIntensity: number;

  /** Enable gravitational lensing effect */
  enableGravitationalLensing: boolean;
}

/**
 * Default configuration optimized for cosmic visuals
 */
export const DEFAULT_POSTPROCESSING_CONFIG: PostProcessingConfig = {
  enableBloom: true,
  bloomIntensity: 1.5,
  bloomLuminanceThreshold: 0.4,
  bloomRadius: 0.8,

  enableChromaticAberration: true,
  chromaticAberrationOffset: 0.001,

  enableColorGrading: true,
  colorGradingIntensity: 0.8,

  enableGravitationalLensing: true,
};

/**
 * PostProcessingManager
 * Encapsulates all post-processing logic following SOLID principles
 */
export class PostProcessingManager {
  private composer: EffectComposer;
  private config: PostProcessingConfig;

  // Effects (store references for dynamic control)
  private bloomEffect: BloomEffect | null = null;
  private chromaticAberrationEffect: ChromaticAberrationEffect | null = null;
  private colorGradingEffect: LUT3DEffect | null = null;
  private gravitationalLensingEffect: GravitationalLensingEffect | null = null;

  // Three.js references (not owned by this manager)
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  /**
   * Creates a PostProcessingManager
   * @param renderer WebGLRenderer instance
   * @param scene Scene to render
   * @param camera Camera for rendering
   * @param config Post-processing configuration
   */
  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    config: Partial<PostProcessingConfig> = {}
  ) {
    this.scene = scene;
    this.camera = camera;
    this.config = { ...DEFAULT_POSTPROCESSING_CONFIG, ...config };

    // Initialize composer with HDR-quality frame buffers
    // HalfFloatType prevents color banding in dark scenes
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
    });

    this.setupPasses();
  }

  /**
   * Setup rendering passes and effects
   * @private
   */
  private setupPasses(): void {
    // Pass 1: Render the scene
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Pass 2: Apply effects
    const effects: any[] = [];

    // Bloom Effect (glowing particles)
    if (this.config.enableBloom) {
      this.bloomEffect = new BloomEffect({
        intensity: this.config.bloomIntensity,
        luminanceThreshold: this.config.bloomLuminanceThreshold,
        luminanceSmoothing: 0.5, // Smooth threshold transition
        radius: this.config.bloomRadius,
        kernelSize: KernelSize.LARGE, // Higher quality
        blendFunction: BlendFunction.SCREEN, // Additive blending for glow
      });
      effects.push(this.bloomEffect);
    }

    // Chromatic Aberration (lens distortion)
    if (this.config.enableChromaticAberration) {
      this.chromaticAberrationEffect = new ChromaticAberrationEffect({
        offset: new THREE.Vector2(
          this.config.chromaticAberrationOffset,
          this.config.chromaticAberrationOffset
        ),
        radialModulation: true, // Stronger at edges
        modulationOffset: 0.2, // Start distortion at 20% from center
      });
      effects.push(this.chromaticAberrationEffect);
    }

    // Color Grading (cosmic palette)
    if (this.config.enableColorGrading) {
      const lut = this.createCosmicLUT();
      this.colorGradingEffect = new LUT3DEffect(lut, {
        blendFunction: BlendFunction.NORMAL,
      });

      // Set intensity via blend mode opacity
      this.colorGradingEffect.blendMode.opacity.value =
        this.config.colorGradingIntensity;

      effects.push(this.colorGradingEffect);
    }

    // Gravitational Lensing (screen-space distortion)
    if (this.config.enableGravitationalLensing) {
      this.gravitationalLensingEffect = new GravitationalLensingEffect();
      effects.push(this.gravitationalLensingEffect);
    }

    // Add all effects to a single pass (more efficient)
    if (effects.length > 0) {
      const effectPass = new EffectPass(this.camera, ...effects);
      this.composer.addPass(effectPass);
    }
  }

  /**
   * Creates a 3D LUT for cosmic color grading
   * Dramatically enhances colors for maximum wow factor:
   * - Saturation boost for vibrant colors
   * - Hue rotation toward cosmic palette (blues, purples, magentas, cyans)
   * - Contrast enhancement with S-curve
   * - Color temperature shift toward cooler tones
   * @private
   * @returns Data3DTexture for color lookup
   */
  private createCosmicLUT(): THREE.Data3DTexture {
    const size = 32; // 32x32x32 = 32,768 color mappings (good balance)
    const data = new Uint8Array(size * size * size * 4);

    // Helper: RGB to HSL conversion
    const rgbToHsl = (
      r: number,
      g: number,
      b: number
    ): [number, number, number] => {
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const delta = max - min;

      // Luminance
      const l = (max + min) / 2;

      // Saturation
      let s = 0;
      if (delta !== 0) {
        s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min);
      }

      // Hue
      let h = 0;
      if (delta !== 0) {
        if (max === r) {
          h = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
        } else if (max === g) {
          h = ((b - r) / delta + 2) / 6;
        } else {
          h = ((r - g) / delta + 4) / 6;
        }
      }

      return [h, s, l];
    };

    // Helper: HSL to RGB conversion
    const hslToRgb = (
      h: number,
      s: number,
      l: number
    ): [number, number, number] => {
      const hue2rgb = (p: number, q: number, t: number): number => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      if (s === 0) {
        return [l, l, l]; // Achromatic
      }

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;

      const r = hue2rgb(p, q, h + 1 / 3);
      const g = hue2rgb(p, q, h);
      const b = hue2rgb(p, q, h - 1 / 3);

      return [r, g, b];
    };

    // Helper: Smooth S-curve for contrast (3x² - 2x³)
    const smoothstep = (x: number): number => {
      const t = Math.max(0, Math.min(1, x));
      return t * t * (3 - 2 * t);
    };

    // Generate LUT with dramatic cosmic color grading
    for (let b = 0; b < size; b++) {
      for (let g = 0; g < size; g++) {
        for (let r = 0; r < size; r++) {
          const index = (b * size * size + g * size + r) * 4;

          // Normalize to [0, 1]
          const rNorm = r / (size - 1);
          const gNorm = g / (size - 1);
          const bNorm = b / (size - 1);

          // Convert to HSL
          let [h, s, l] = rgbToHsl(rNorm, gNorm, bNorm);

          // === COSMIC ENHANCEMENTS ===

          // 1. HUE ROTATION toward cosmic palette
          // Red/Orange (0-60°) → Purple/Magenta (300°)
          // Yellow/Green (60-180°) → Blue/Cyan (210°)
          // Blue/Purple (180-360°) → Keep/enhance
          const hDeg = h * 360;
          if (hDeg < 60) {
            // Reds → shift strongly toward magenta/purple
            h = (hDeg + (300 - hDeg) * 0.5) / 360;
          } else if (hDeg < 180) {
            // Yellows/Greens → shift toward deep blue (reduce greenish)
            h = (hDeg + (210 - hDeg) * 0.6) / 360;
          }
          // Blues/Purples (180-360) already cosmic, keep them

          // 2. SATURATION BOOST (1.8x for vibrant colors)
          s = Math.min(1, s * 1.8);

          // 3. CONTRAST ENHANCEMENT (S-curve on luminance)
          l = smoothstep(l);

          // Convert back to RGB
          let [rOut, gOut, bOut] = hslToRgb(h, s, l);

          // 4. COLOR TEMPERATURE shift (cooler = more blue/purple, less red/green)
          rOut *= 0.75; // Reduce red more
          gOut *= 0.85; // Reduce green to fight greenish tint
          bOut *= 1.3; // Boost blue even more

          // Clamp and convert to byte
          const transformedR = Math.min(255, Math.floor(rOut * 255));
          const transformedG = Math.min(255, Math.floor(gOut * 255));
          const transformedB = Math.min(255, Math.floor(bOut * 255));

          // Store RGBA
          data[index + 0] = transformedR;
          data[index + 1] = transformedG;
          data[index + 2] = transformedB;
          data[index + 3] = 255; // Full alpha
        }
      }
    }

    const texture = new THREE.Data3DTexture(data, size, size, size);
    texture.format = THREE.RGBAFormat;
    texture.type = THREE.UnsignedByteType;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapR = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;

    return texture;
  }

  /**
   * Render the scene with post-processing effects
   * Call this instead of renderer.render()
   * @param deltaTime Optional delta time for time-based effects
   */
  render(deltaTime?: number): void {
    this.composer.render(deltaTime);
  }

  /**
   * Resize the composer (call on window resize)
   * @param width New width in pixels
   * @param height New height in pixels
   */
  resize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  /**
   * Update effect parameters dynamically
   * Note: BloomEffect properties are read-only after construction
   * To change bloom settings, recreate the effect
   */
  setBloomIntensity(_intensity: number): void {
    // BloomEffect doesn't support runtime intensity changes
    // This would require recreating the effect
    console.warn(
      '[PostProcessingManager] Runtime bloom changes not supported. Recreate manager with new config.'
    );
  }

  setChromaticAberrationOffset(offset: number): void {
    if (this.chromaticAberrationEffect) {
      this.chromaticAberrationEffect.offset.set(offset, offset);
    }
  }

  setColorGradingIntensity(intensity: number): void {
    if (this.colorGradingEffect) {
      this.colorGradingEffect.blendMode.opacity.value = intensity;
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<PostProcessingConfig> {
    return { ...this.config };
  }

  /**
   * Get gravitational lensing effect for external control
   */
  getGravitationalLensingEffect(): GravitationalLensingEffect | null {
    return this.gravitationalLensingEffect;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.composer.dispose();

    // Individual effect disposal (if they have dispose methods)
    if (this.bloomEffect && 'dispose' in this.bloomEffect) {
      (this.bloomEffect as any).dispose();
    }
    if (
      this.chromaticAberrationEffect &&
      'dispose' in this.chromaticAberrationEffect
    ) {
      (this.chromaticAberrationEffect as any).dispose();
    }
    if (this.colorGradingEffect && 'dispose' in this.colorGradingEffect) {
      (this.colorGradingEffect as any).dispose();
    }
    if (
      this.gravitationalLensingEffect &&
      'dispose' in this.gravitationalLensingEffect
    ) {
      (this.gravitationalLensingEffect as any).dispose();
    }

    console.log('[PostProcessingManager] Disposed');
  }
}
