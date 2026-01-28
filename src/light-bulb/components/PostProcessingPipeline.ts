/**
 * @fileoverview PostProcessingPipeline - Manages the cinematic post-processing stack.
 *
 * Implements a high-fidelity rendering pipeline including:
 * - Volumetric God Rays (crepuscular rays) from the light source
 * - Physically-based Bloom with mipmap blur for soft glow
 * - Vignette for cinematic focus
 *
 * The God Rays effect uses the GPU Gems 3 volumetric light scattering algorithm,
 * casting screen-space rays from each pixel toward the light source with exponential decay.
 *
 * @see https://developer.nvidia.com/gpugems/GPUGems3/gpugems3_ch13.html
 * @module light-bulb/components/PostProcessingPipeline
 */

import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  GodRaysEffect,
  BloomEffect,
  VignetteEffect,
  BlendFunction,
  KernelSize,
  Effect,
} from 'postprocessing';

/**
 * Configuration for the post-processing pipeline.
 */
export interface PostProcessingConfig {
  /** Bloom effect intensity multiplier (0-5) */
  bloomStrength: number;

  /** Luminance threshold for bloom activation (0-1) */
  bloomThreshold: number;

  /** Bloom blur radius (0-1) */
  bloomRadius: number;

  /** Whether post-processing is enabled */
  enabled: boolean;
}

/**
 * Configuration for the God Rays effect.
 */
export interface GodRaysConfig {
  /** Number of samples per pixel for ray marching (32-128, higher = better quality) */
  samples: number;

  /** Controls ray density contribution per sample (0.9-1.0) */
  density: number;

  /** Exponential decay rate for ray intensity falloff (0.9-0.96) */
  decay: number;

  /** Intensity weight per sample (0.1-0.5) */
  weight: number;

  /** Final brightness multiplier (0.3-0.8) */
  exposure: number;

  /** Maximum clamp value to prevent overbrightness */
  clampMax: number;

  /** Whether to apply blur pass to reduce artifacts */
  blur: boolean;

  /** Blur kernel size */
  kernelSize: KernelSize;
}

/** Default God Rays configuration optimized for cinematic light bulb effect */
const DEFAULT_GOD_RAYS_CONFIG: GodRaysConfig = {
  samples: 60,
  density: 0.96,
  decay: 0.93,
  weight: 0.4,
  exposure: 0.55,
  clampMax: 1.0,
  blur: true,
  kernelSize: KernelSize.SMALL,
};

/**
 * Manages the post-processing effect chain for cinematic light rendering.
 *
 * The pipeline consists of:
 * 1. RenderPass: Standard scene rendering
 * 2. EffectPass: Combined God Rays, Bloom, and Vignette effects
 *
 * @example
 * ```typescript
 * const pipeline = new PostProcessingPipeline(renderer, scene, camera, config);
 * pipeline.setup(filamentMesh);
 * pipeline.render(deltaTime);
 * ```
 */
export class PostProcessingPipeline {
  private composer: EffectComposer;
  private godRaysEffect: GodRaysEffect | null = null;
  private bloomEffect: BloomEffect | null = null;
  private vignetteEffect: VignetteEffect | null = null;
  private effectPass: EffectPass | null = null;

  private readonly camera: THREE.Camera;
  private readonly config: PostProcessingConfig;

  private isSetup: boolean = false;

  /**
   * Creates a new post-processing pipeline.
   *
   * @param renderer - The WebGL renderer
   * @param scene - The Three.js scene
   * @param camera - The camera for rendering
   * @param config - Pipeline configuration
   */
  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    config: PostProcessingConfig
  ) {
    this.camera = camera;
    this.config = config;

    // Initialize composer with HalfFloatType for HDR precision
    this.composer = new EffectComposer(renderer, {
      frameBufferType: THREE.HalfFloatType,
    });

    // Add initial render pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);

    // Pre-initialize bloom and vignette effects
    this.initializeBaseEffects();
  }

  /**
   * Initializes bloom and vignette effects with optimal settings.
   */
  private initializeBaseEffects(): void {
    // Bloom: Use mipmapBlur for higher quality soft glow
    this.bloomEffect = new BloomEffect({
      blendFunction: BlendFunction.ADD,
      kernelSize: KernelSize.LARGE,
      luminanceThreshold: this.config.bloomThreshold,
      luminanceSmoothing: 0.15,
      intensity: this.config.bloomStrength,
      mipmapBlur: true,
    });

    // Vignette: Subtle darkening at edges for cinematic focus
    this.vignetteEffect = new VignetteEffect({
      eskil: false,
      offset: 0.15,
      darkness: 0.35,
    });
  }

  /**
   * Sets up the God Rays effect with the specified light source mesh.
   *
   * The light source mesh must:
   * - Use a material with depthWrite: false
   * - Be marked as transparent
   * - Ideally use MeshBasicMaterial for pure emissive appearance
   *
   * @param lightSourceMesh - The mesh representing the light source (typically the filament)
   * @param godRaysConfig - Optional configuration overrides for God Rays
   */
  setup(lightSourceMesh: THREE.Mesh, godRaysConfig: Partial<GodRaysConfig> = {}): void {
    const config = { ...DEFAULT_GOD_RAYS_CONFIG, ...godRaysConfig };

    // Remove existing effect pass if present
    if (this.effectPass) {
      this.composer.removePass(this.effectPass);
      this.effectPass = null;
    }

    // Create God Rays effect targeting the light source mesh
    this.godRaysEffect = new GodRaysEffect(this.camera, lightSourceMesh, {
      blendFunction: BlendFunction.SCREEN,
      samples: config.samples,
      density: config.density,
      decay: config.decay,
      weight: config.weight,
      exposure: config.exposure,
      clampMax: config.clampMax,
      blur: config.blur,
      kernelSize: config.kernelSize,
      resolutionScale: 0.5, // Half resolution for performance
    });

    // Combine all effects into a single pass for optimal performance
    const effects: Effect[] = [];

    if (this.godRaysEffect) effects.push(this.godRaysEffect);
    if (this.bloomEffect) effects.push(this.bloomEffect);
    if (this.vignetteEffect) effects.push(this.vignetteEffect);

    this.effectPass = new EffectPass(this.camera, ...effects);
    this.composer.addPass(this.effectPass);

    this.isSetup = true;
  }

  /**
   * Updates the God Rays intensity dynamically.
   * Used for animating light on/off transitions.
   *
   * @param intensity - Normalized intensity value (0-1)
   */
  setGodRaysIntensity(intensity: number): void {
    if (this.godRaysEffect) {
      // Scale weight and exposure based on intensity for smooth transitions
      this.godRaysEffect.godRaysMaterial.weight = DEFAULT_GOD_RAYS_CONFIG.weight * intensity;
      this.godRaysEffect.godRaysMaterial.exposure = DEFAULT_GOD_RAYS_CONFIG.exposure * intensity;
    }
  }

  /**
   * Updates bloom effect intensity.
   *
   * @param intensity - Bloom intensity multiplier
   */
  setBloomIntensity(intensity: number): void {
    if (this.bloomEffect) {
      this.bloomEffect.intensity = intensity;
    }
  }

  /**
   * Updates bloom threshold.
   *
   * @param threshold - Luminance threshold (0-1)
   */
  setBloomThreshold(threshold: number): void {
    if (this.bloomEffect) {
      this.bloomEffect.luminanceMaterial.threshold = threshold;
    }
  }

  /**
   * Renders the post-processing pipeline.
   *
   * @param deltaTime - Time since last frame in seconds
   */
  render(deltaTime: number): void {
    this.composer.render(deltaTime);
  }

  /**
   * Handles viewport resize.
   *
   * @param width - New viewport width
   * @param height - New viewport height
   */
  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  /**
   * Checks if the pipeline has been set up with a light source.
   *
   * @returns True if setup() has been called
   */
  get ready(): boolean {
    return this.isSetup;
  }

  /**
   * Disposes of all post-processing resources.
   */
  dispose(): void {
    this.composer.dispose();
    this.godRaysEffect = null;
    this.bloomEffect = null;
    this.vignetteEffect = null;
    this.effectPass = null;
    this.isSetup = false;
  }
}
