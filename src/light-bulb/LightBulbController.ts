/**
 * @fileoverview LightBulbController - Main controller for the Interactive Light Bulb mode.
 *
 * This module orchestrates the 3D light bulb interaction experience, managing:
 * - Three.js scene composition with camera feed background
 * - GLB model loading and material configuration
 * - Cinematic post-processing with volumetric God Rays and Bloom
 * - Hand tracking integration for gesture-based interaction
 * - Pinch-to-rotate gesture for bulb manipulation
 * - Cord pull detection for light toggle
 * - Physics-based incandescent light transitions
 *
 * @module light-bulb/LightBulbController
 */

import * as THREE from 'three';
import { GLTFLoader, GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import gsap from 'gsap';

import { HandTracker } from '../shared/HandTracker';
import { GestureDetector } from '../shared/GestureDetector';
import { GestureState, GestureType, type PinchGestureData } from '../shared/GestureTypes';
import type { Handedness } from '../shared/HandTypes';
import { HandLandmarkOverlay } from '../shared/HandLandmarkOverlay';

import {
  DEFAULT_LIGHT_BULB_CONFIG,
  LightBulbState,
  InteractionState,
  LightState,
  type LightBulbConfig,
  type LightBulbDebugInfo,
  type CordPullState,
  type RotationState,
} from './types';

import { PostProcessingPipeline } from './components/PostProcessingPipeline';
import { FilamentGlowMesh, COLOR_TEMPERATURES } from './components/FilamentGlowMesh';
import { IncandescentAnimator, type LightAnimationState } from './components/IncandescentAnimator';

/** Path to the light bulb GLB model (served from public directory) */
const LIGHT_BULB_MODEL_PATH = '/models/light-bulb.glb';

/**
 * Main controller for the Interactive Light Bulb mode.
 *
 * Manages the complete lifecycle of the 3D light bulb display including scene setup,
 * model loading, animation loop, hand tracking input, and gesture-based interaction.
 *
 * @example
 * ```typescript
 * const controller = new LightBulbController(handTracker, containerElement);
 * controller.initialize();
 * controller.start();
 * ```
 */
export class LightBulbController {
  private readonly handTracker: HandTracker;
  private readonly container: HTMLElement;
  private readonly config: LightBulbConfig;

  // Three.js core
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  // Cinematic post-processing pipeline (God Rays + Bloom + Vignette)
  private postProcessing: PostProcessingPipeline;

  // Model components
  private lightBulbGroup: THREE.Group | null = null;
  private cordMesh: THREE.Mesh | null = null;
  private filamentMesh: THREE.Mesh | null = null;

  // Volumetric light source for God Rays effect
  private filamentGlow: FilamentGlowMesh;

  // Physics-based incandescent animator
  private incandescentAnimator: IncandescentAnimator;

  // Materials for light state transitions
  private bulbMaterial: THREE.MeshStandardMaterial | null = null;
  private filamentMaterial: THREE.MeshStandardMaterial | null = null;

  // Lights
  private ambientLight: THREE.AmbientLight;
  private pointLight: THREE.PointLight;
  private directionalLight: THREE.DirectionalLight;

  // Gesture detection
  private gestureDetector: GestureDetector;
  private landmarkOverlay: HandLandmarkOverlay | null = null;

  // Pinch detection for responsive interaction
  /** Minimum pinch strength (0-1) to activate interaction */
  private readonly PINCH_STRENGTH_THRESHOLD = 0.5;
  /** Minimum sustained frames before starting an interaction */
  private readonly MIN_SUSTAINED_FRAMES = 1;
  /** Counter for sustained pinch frames */
  private sustainedPinchFrames: number = 0;
  /** Whether pinch is currently held */
  private isPinchHeld: boolean = false;
  /** Smoothing factor for rotation (0-1, higher = smoother but more lag) */
  private readonly ROTATION_SMOOTHING = 0.3;

  // State management
  private state: LightBulbState = LightBulbState.UNINITIALIZED;
  private lightState: LightState = LightState.OFF;
  private interactionState: InteractionState = InteractionState.IDLE;

  // Rotation state
  private rotationState: RotationState = {
    isRotating: false,
    startPosition: { x: 0, y: 0 },
    currentPosition: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    targetRotation: { x: 0, y: 0 },
  };

  // Cord pull state
  private cordPullState: CordPullState = {
    isGrabbing: false,
    grabStartY: 0,
    currentY: 0,
    pullDistance: 0,
    feedbackIntensity: 0,
  };

  // Cord bounding box for collision detection (reserved for enhanced hit detection)

  // Animation loop
  private animationFrameId: number | null = null;
  private lastTimestamp: number = 0;

  // Debug
  private debugEnabled: boolean = false;
  private debugCallback: ((info: LightBulbDebugInfo) => void) | null = null;

  // Performance tracking
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 60;
  private lastHandCount: number = 0;

  // Raycaster for cord collision
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  // Pre-allocated vectors for performance (reserved for future optimizations)

  /**
   * Create a new LightBulbController instance.
   *
   * @param handTracker - Shared hand tracking instance
   * @param container - Parent container element for the renderer
   * @param config - Optional configuration overrides
   */
  constructor(
    handTracker: HandTracker,
    container: HTMLElement,
    config: Partial<LightBulbConfig> = {}
  ) {
    this.handTracker = handTracker;
    this.container = container;
    this.config = { ...DEFAULT_LIGHT_BULB_CONFIG, ...config };

    // Initialize gesture detector
    this.gestureDetector = new GestureDetector();

    // Initialize Three.js core components
    this.scene = new THREE.Scene();

    // Camera setup - positioned to frame the light bulb
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
    this.camera.position.set(0, 0, 5);
    this.camera.lookAt(0, 0, 0);

    // Renderer setup with transparency for camera feed background
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;

    // Lighting setup
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    this.pointLight = new THREE.PointLight(0xfff4e0, 0, 10);
    this.pointLight.position.set(0, 0, 0);
    this.scene.add(this.pointLight);

    this.directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    this.directionalLight.position.set(5, 5, 5);
    this.scene.add(this.directionalLight);

    // Create filament glow mesh for volumetric God Rays effect
    this.filamentGlow = new FilamentGlowMesh({
      radius: 0.03,
      color: COLOR_TEMPERATURES.WARM_WHITE,
      opacity: 0,
    });
    this.scene.add(this.filamentGlow.mesh);

    // Initialize cinematic post-processing pipeline (God Rays + Bloom + Vignette)
    this.postProcessing = new PostProcessingPipeline(this.renderer, this.scene, this.camera, {
      bloomStrength: this.config.bloomStrength,
      bloomThreshold: this.config.bloomThreshold,
      bloomRadius: this.config.bloomRadius,
      enabled: true,
    });

    // Initialize physics-based incandescent animator
    this.incandescentAnimator = new IncandescentAnimator(
      (state: LightAnimationState) => this.applyAnimationState(state),
      {
        warmUpDuration: 0.18,
        coolDownDuration: 0.25,
      }
    );
  }

  /**
   * Applies the animation state to all light-related elements.
   * Called on each frame of the incandescent warm-up/cool-down animation.
   *
   * @param state - Current animation state from IncandescentAnimator
   */
  private applyAnimationState(state: LightAnimationState): void {
    const { intensity, colorTemperature } = state;

    // Update filament glow mesh for God Rays
    this.filamentGlow.setIntensity(intensity);
    this.filamentGlow.updateColorForIntensity(intensity);

    // Update God Rays intensity in post-processing
    this.postProcessing.setGodRaysIntensity(intensity);

    // Calculate the lit color (cold → warm transition during warm-up)
    // Only visible when intensity > 0
    const coldColor = new THREE.Color(COLOR_TEMPERATURES.CANDLE);
    const warmColor = new THREE.Color(this.config.lightOnColor);
    const litColor = coldColor.clone().lerp(warmColor, colorTemperature);

    // Off color (neutral gray) for when light is off
    const offColor = new THREE.Color(this.config.lightOffColor);

    // Apply to bulb material
    if (this.bulbMaterial) {
      const emissiveIntensity =
        this.config.emissiveIntensityOff +
        intensity * (this.config.emissiveIntensityOn - this.config.emissiveIntensityOff);

      this.bulbMaterial.emissiveIntensity = emissiveIntensity;

      // Blend base color from off (gray) to lit color based on intensity
      this.bulbMaterial.color.lerpColors(offColor, litColor, intensity);

      // Emissive only shows when lit - blend from off color to lit color
      this.bulbMaterial.emissive.lerpColors(offColor, litColor, intensity);
    }

    // Apply to filament material with higher intensity
    if (this.filamentMaterial) {
      const targetIntensity = this.config.emissiveIntensityOff + intensity * 6.0;
      this.filamentMaterial.emissiveIntensity = targetIntensity;

      // Filament should show warm color only when lit
      this.filamentMaterial.emissive.lerpColors(offColor, litColor, intensity);
    }

    // Apply to point light with smooth curve for realistic falloff
    this.pointLight.intensity = intensity * 2.5;
    this.pointLight.color.copy(litColor);

    // Dynamic bloom intensity for extra glow when on
    const baseBloom = this.config.bloomStrength;
    const maxBloom = baseBloom * 1.5;
    this.postProcessing.setBloomIntensity(baseBloom + intensity * (maxBloom - baseBloom));
  }

  /**
   * Initialize the Light Bulb mode.
   * Sets up the renderer and prepares for interaction. Model loading happens asynchronously.
   */
  initialize(): void {
    if (this.state !== LightBulbState.UNINITIALIZED) {
      console.warn('[LightBulbController] Already initialized');
      return;
    }

    // Add renderer to DOM
    this.renderer.domElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 10;
      pointer-events: none;
    `;
    this.container.appendChild(this.renderer.domElement);

    // Create landmark overlay for debug visualization
    this.landmarkOverlay = new HandLandmarkOverlay(this.container);
    this.landmarkOverlay.setEnabled(this.debugEnabled);

    // Load the light bulb model asynchronously
    this.loadModel()
      .then(() => {
        console.log('[LightBulbController] Model loaded successfully');
      })
      .catch((error) => {
        console.error('[LightBulbController] Failed to load model:', error);
      });

    // Setup window resize handler
    this.setupResizeHandler();

    this.state = LightBulbState.READY;
    console.log('[LightBulbController] Initialized');
  }

  /**
   * Load the light bulb GLB model and configure materials.
   */
  private async loadModel(): Promise<void> {
    const loader = new GLTFLoader();

    return new Promise((resolve, reject) => {
      loader.load(
        LIGHT_BULB_MODEL_PATH,
        (gltf: GLTF) => {
          this.processLoadedModel(gltf);
          resolve();
        },
        (progress) => {
          const percent = (progress.loaded / progress.total) * 100;
          console.log(`[LightBulbController] Loading model: ${percent.toFixed(0)}%`);
        },
        (error) => {
          console.error('[LightBulbController] Failed to load model:', error);
          reject(error);
        }
      );
    });
  }

  /**
   * Process the loaded GLTF model and setup materials.
   *
   * @param gltf - The loaded GLTF data
   */
  private processLoadedModel(gltf: GLTF): void {
    this.lightBulbGroup = new THREE.Group();

    // Traverse the model to find and configure parts
    gltf.scene.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;

      const mesh = child as THREE.Mesh;
      const name = mesh.name.toLowerCase();

      // Log mesh names for debugging model structure
      console.log(`[LightBulbController] Found mesh: "${mesh.name}"`);

      // Identify and store references to key parts
      // Check for cord/string/chain/rope/pull keywords
      if (
        name.includes('cord') ||
        name.includes('string') ||
        name.includes('chain') ||
        name.includes('rope') ||
        name.includes('pull')
      ) {
        console.log(`[LightBulbController] Identified cord mesh: "${mesh.name}"`);
        this.cordMesh = mesh;
        this.setupCordMaterial(mesh);
      } else if (name.includes('bulb') || name.includes('glass') || name.includes('lamp')) {
        this.setupBulbMaterial(mesh);
      } else if (name.includes('filament') || name.includes('wire') || name.includes('glow')) {
        this.filamentMesh = mesh;
        this.setupFilamentMaterial(mesh);
      }
    });

    // If no cord mesh found, log a warning
    if (!this.cordMesh) {
      console.warn(
        '[LightBulbController] No cord mesh found. Cord pull detection will use fallback spatial region.'
      );
    }

    // Add the entire model to our group
    this.lightBulbGroup.add(gltf.scene);

    // Center and scale the model appropriately
    const box = new THREE.Box3().setFromObject(this.lightBulbGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = 2.5 / maxDim; // Fit within reasonable viewport

    this.lightBulbGroup.scale.setScalar(scale);
    this.lightBulbGroup.position.sub(center.multiplyScalar(scale));

    // Rotate slightly to show the cord at an angle
    this.lightBulbGroup.rotation.y = 5; // Rotate to show cord

    this.scene.add(this.lightBulbGroup);

    // Position filament glow mesh at the bulb center for God Rays
    this.positionFilamentGlow();

    // Setup God Rays post-processing with the filament glow mesh
    this.postProcessing.setup(this.filamentGlow.mesh);

    // Update cord bounding box for collision detection
    this.updateCordBoundingBox();

    // Apply initial light state (OFF)
    this.applyLightState(LightState.OFF, false);

    console.log('[LightBulbController] Model processed successfully');
  }

  /**
   * Position the filament glow mesh at the bulb's filament location.
   * Uses the filament mesh center if found, otherwise defaults to bulb center.
   */
  private positionFilamentGlow(): void {
    if (!this.lightBulbGroup) return;

    let targetPosition = new THREE.Vector3(0, 0.3, 0); // Default position

    if (this.filamentMesh) {
      // Get world position of filament mesh center
      const worldPos = new THREE.Vector3();
      this.filamentMesh.getWorldPosition(worldPos);
      targetPosition = worldPos;
      console.log('[LightBulbController] Filament glow positioned at filament mesh');
    } else {
      // Fallback: estimate position from bulb group bounds
      const box = new THREE.Box3().setFromObject(this.lightBulbGroup);
      const center = box.getCenter(new THREE.Vector3());
      // Filament is typically in upper portion of bulb
      targetPosition.set(center.x, center.y + 0.1, center.z);
      console.log('[LightBulbController] Filament glow positioned at estimated center');
    }

    this.filamentGlow.setPosition(targetPosition);

    // Also position the point light at the same location
    this.pointLight.position.copy(targetPosition);
  }

  /**
   * Setup material for the bulb glass body.
   *
   * @param mesh - The bulb body mesh
   */
  private setupBulbMaterial(mesh: THREE.Mesh): void {
    this.bulbMaterial = new THREE.MeshStandardMaterial({
      color: this.config.lightOffColor,
      emissive: new THREE.Color(this.config.lightOffColor),
      emissiveIntensity: this.config.emissiveIntensityOff,
      transparent: true,
      opacity: 0.85,
      roughness: 0.1,
      metalness: 0.0,
    });
    mesh.material = this.bulbMaterial;
  }

  /**
   * Setup material for the pull cord.
   *
   * @param mesh - The cord mesh
   */
  private setupCordMaterial(mesh: THREE.Mesh): void {
    const cordMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b7355, // Rope/cord brown color
      roughness: 0.8,
      metalness: 0.0,
    });
    mesh.material = cordMaterial;
  }

  /**
   * Setup material for the filament.
   *
   * @param mesh - The filament mesh
   */
  private setupFilamentMaterial(mesh: THREE.Mesh): void {
    this.filamentMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6600,
      emissive: new THREE.Color(0xff6600),
      emissiveIntensity: this.config.emissiveIntensityOff,
      roughness: 0.3,
      metalness: 0.5,
    });
    mesh.material = this.filamentMaterial;
  }

  /**
   * Update the bounding box for the cord mesh (reserved for enhanced collision detection).
   */
  private updateCordBoundingBox(): void {
    // Reserved for future enhanced hit detection using bounding box acceleration
    // Currently using raycaster directly against mesh geometry
  }

  /**
   * Setup window resize handler.
   */
  private setupResizeHandler(): void {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;

      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();

      this.renderer.setSize(width, height);
      this.postProcessing.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);
  }

  /**
   * Enable debug mode with callback for performance metrics.
   *
   * @param callback - Function to receive debug information each frame
   */
  enableDebug(callback: (info: LightBulbDebugInfo) => void): void {
    this.debugEnabled = true;
    this.debugCallback = callback;
    this.landmarkOverlay?.setEnabled(true);
  }

  /**
   * Disable debug mode.
   */
  disableDebug(): void {
    this.debugEnabled = false;
    this.debugCallback = null;
    this.landmarkOverlay?.setEnabled(false);
  }

  /**
   * Start the Light Bulb mode (begin tracking and rendering).
   *
   * @throws Error if called after disposal
   */
  start(): void {
    if (this.state === LightBulbState.DISPOSED) {
      throw new Error('[LightBulbController] Cannot start after disposal');
    }

    if (this.state === LightBulbState.RUNNING) {
      console.warn('[LightBulbController] Already running');
      return;
    }

    if (this.state === LightBulbState.UNINITIALIZED) {
      console.error('[LightBulbController] Must initialize before starting');
      return;
    }

    this.state = LightBulbState.RUNNING;
    this.lastTimestamp = performance.now();
    this.startUpdateLoop();

    console.log('[LightBulbController] Started');
  }

  /**
   * Stop the Light Bulb mode (pause tracking and rendering).
   */
  stop(): void {
    if (this.state !== LightBulbState.RUNNING) {
      return;
    }

    this.stopUpdateLoop();
    this.state = LightBulbState.PAUSED;

    console.log('[LightBulbController] Stopped');
  }

  /**
   * Reset the light bulb to initial state.
   */
  reset(): void {
    // Reset light state to OFF
    this.applyLightState(LightState.OFF, true);

    // Reset rotation to initial viewing angle (shows cord better)
    if (this.lightBulbGroup) {
      gsap.to(this.lightBulbGroup.rotation, {
        x: 0,
        y: 5, // Match initial rotation value from processLoadedModel
        duration: 0.5,
        ease: 'power2.out',
      });
    }

    // Reset rotation state
    this.rotationState = {
      isRotating: false,
      startPosition: { x: 0, y: 0 },
      currentPosition: { x: 0, y: 0 },
      velocity: { x: 0, y: 0 },
      targetRotation: { x: 0, y: 5 },
    };

    // Reset cord pull state
    this.cordPullState = {
      isGrabbing: false,
      grabStartY: 0,
      currentY: 0,
      pullDistance: 0,
      feedbackIntensity: 0,
    };

    this.interactionState = InteractionState.IDLE;

    console.log('[LightBulbController] Reset');
  }

  /**
   * Get the current number of detected hands.
   *
   * @returns Number of hands detected
   */
  getHandCount(): number {
    return this.lastHandCount;
  }

  /**
   * Start the update loop for hand tracking and rendering.
   */
  private startUpdateLoop(): void {
    const update = (timestamp: number): void => {
      if (this.state !== LightBulbState.RUNNING) return;

      // Calculate delta time
      const deltaTime = (timestamp - this.lastTimestamp) / 1000;
      this.lastTimestamp = timestamp;

      // Track FPS
      this.frameCount++;
      if (timestamp - this.lastFpsUpdate >= 1000) {
        this.currentFps = this.frameCount;
        this.frameCount = 0;
        this.lastFpsUpdate = timestamp;
      }

      // Process hand tracking
      this.processHandTracking(timestamp);

      // Update rotation inertia
      this.updateRotationInertia(deltaTime);

      // Render scene through post-processing pipeline (God Rays + Bloom + Vignette)
      this.postProcessing.render(deltaTime);

      // Send debug info
      if (this.debugEnabled && this.debugCallback) {
        this.sendDebugInfo();
      }

      // Schedule next frame
      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  /**
   * Stop the update loop.
   */
  private stopUpdateLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Process hand tracking and gesture detection.
   *
   * @param timestamp - Current animation timestamp
   */
  private processHandTracking(timestamp: number): void {
    const result = this.handTracker.detectHands(timestamp);

    // Update landmark overlay for debug
    if (this.landmarkOverlay && this.debugEnabled) {
      this.landmarkOverlay.update(result);
    }

    if (!result || result.landmarks.length === 0) {
      this.lastHandCount = 0;
      this.handleNoHands();
      return;
    }

    this.lastHandCount = result.landmarks.length;

    // Extract handedness from result
    const handedness: Handedness[] = result.handedness.map((h) => {
      const category = h[0]?.categoryName?.toLowerCase();
      return category === 'left' || category === 'right' ? category : 'unknown';
    });

    // Run gesture detection
    const gestureResult = this.gestureDetector.detect(result.landmarks, handedness, timestamp);

    // Track if we processed a valid pinch this frame
    let validPinchProcessed = false;

    // Process pinch gestures for rotation and cord pulling
    for (const event of gestureResult.events) {
      if (event.type === GestureType.PINCH) {
        const pinchData = event.data as PinchGestureData;

        // Handle ENDED state explicitly
        if (event.state === GestureState.ENDED) {
          this.handleGestureEnded();
          continue;
        }

        this.handlePinchGesture(event.state, pinchData);
        validPinchProcessed = true;
      }
    }

    // Handle gesture ended if no pinch is active or no valid pinch was processed
    if (!gestureResult.pinch || !validPinchProcessed) {
      this.handleGestureEnded();
    }
  }

  /**
   * Handle the case when no hands are detected.
   * Ensures all states are properly reset to prevent stuck interactions.
   */
  private handleNoHands(): void {
    // Reset sustained pinch counter
    this.sustainedPinchFrames = 0;
    this.isPinchHeld = false;

    // Force end any active interactions
    this.forceResetAllInteractions();
  }

  /**
   * Force reset all interaction states.
   * Called when hands are lost or on error recovery.
   */
  private forceResetAllInteractions(): void {
    // Reset cord if it was being pulled
    if (this.interactionState === InteractionState.PULLING_CORD || this.cordPullState.isGrabbing) {
      this.resetCordVisual();
    }

    // Reset rotation state
    if (this.interactionState === InteractionState.ROTATING) {
      this.endRotation();
    }

    // Reset cord pull state
    this.cordPullState = {
      isGrabbing: false,
      grabStartY: 0,
      currentY: 0,
      pullDistance: 0,
      feedbackIntensity: 0,
    };

    this.interactionState = InteractionState.IDLE;
  }

  /**
   * Reset the cord's visual state with smooth animation.
   */
  private resetCordVisual(): void {
    if (this.cordMesh) {
      gsap.to(this.cordMesh.scale, {
        y: 1.0,
        duration: 0.2,
        ease: 'power2.out',
      });
    }
  }

  /**
   * Handle pinch gesture for rotation and cord pulling.
   * Uses stricter thresholds and sustained frame requirements for reliable detection.
   * Once an interaction starts (rotation/cord pull), it continues until pinch is released,
   * regardless of position changes.
   *
   * @param state - Current gesture state
   * @param data - Pinch gesture data
   */
  private handlePinchGesture(state: GestureState, data: PinchGestureData): void {
    const { normalizedPosition, strength } = data;

    // Check if pinch strength meets threshold for reliable detection
    const isStrongPinch = strength >= this.PINCH_STRENGTH_THRESHOLD;

    if (!isStrongPinch) {
      // Pinch not strong enough - treat as if no pinch
      this.sustainedPinchFrames = 0;
      if (this.isPinchHeld) {
        this.isPinchHeld = false;
        this.handleGestureEnded();
      }
      return;
    }

    // Track sustained pinch frames for reliability
    this.sustainedPinchFrames++;

    // If we're already in an active interaction, continue it regardless of position
    if (this.isPinchHeld && this.interactionState !== InteractionState.IDLE) {
      if (this.interactionState === InteractionState.PULLING_CORD) {
        this.updateCordPull(normalizedPosition.y);
      } else if (this.interactionState === InteractionState.ROTATING) {
        this.updateRotation(normalizedPosition.x, normalizedPosition.y);
      }
      return;
    }

    // Starting a new interaction - check cord collision only at start
    if (state === GestureState.STARTED || !this.isPinchHeld) {
      // Only start interaction after sustained frames threshold
      if (this.sustainedPinchFrames >= this.MIN_SUSTAINED_FRAMES) {
        this.isPinchHeld = true;

        // Check if pinch is on the cord only when starting
        const isOnCord = this.checkCordCollision(normalizedPosition.x, normalizedPosition.y);

        if (isOnCord) {
          // Start cord pulling
          this.startCordPull(normalizedPosition.y);
        } else {
          // Start rotation
          this.startRotation(normalizedPosition.x, normalizedPosition.y);
        }
      }
    }
  }

  /**
   * Handle gesture ended (pinch released).
   * Ensures proper cleanup of all interaction states.
   */
  private handleGestureEnded(): void {
    // Reset sustained pinch counter
    this.sustainedPinchFrames = 0;
    this.isPinchHeld = false;

    if (this.interactionState === InteractionState.PULLING_CORD) {
      this.endCordPull();
    } else if (this.interactionState === InteractionState.ROTATING) {
      this.endRotation();
    }
    this.interactionState = InteractionState.IDLE;
  }

  /**
   * Check if the given screen position collides with the cord.
   * Uses raycasting against cord mesh if available, otherwise falls back to
   * a spatial region check based on expected cord location.
   *
   * @param normX - Normalized X position (0-1)
   * @param normY - Normalized Y position (0-1)
   * @returns True if colliding with cord region
   */
  private checkCordCollision(normX: number, normY: number): boolean {
    // If we have a cord mesh, use raycasting
    if (this.cordMesh && this.lightBulbGroup) {
      // Convert normalized coordinates to NDC (-1 to 1)
      // MediaPipe uses mirrored coordinates, so flip X
      const ndcX = -(normX * 2 - 1);
      const ndcY = -(normY * 2 - 1);

      // Set up raycaster
      this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);

      // Check intersection with cord mesh
      const intersects = this.raycaster.intersectObject(this.cordMesh, true);

      if (intersects.length > 0) {
        console.log('[LightBulbController] Cord hit via raycasting');
        return true;
      }
    }

    // Fallback: Use spatial region for cord (bottom center of the screen)
    // The cord typically hangs below the bulb, so check if the pinch is
    // in the lower-center portion of the viewport
    const cordRegion = {
      xMin: 0.35, // Left boundary (normalized)
      xMax: 0.65, // Right boundary (normalized)
      yMin: 0.55, // Top boundary (below center)
      yMax: 0.85, // Bottom boundary
    };

    const isInCordRegion =
      normX >= cordRegion.xMin &&
      normX <= cordRegion.xMax &&
      normY >= cordRegion.yMin &&
      normY <= cordRegion.yMax;

    if (isInCordRegion) {
      console.log('[LightBulbController] Cord hit via spatial region fallback');
    }

    return isInCordRegion;
  }

  /**
   * Start the cord pulling interaction.
   *
   * @param startY - Starting Y position (normalized)
   */
  private startCordPull(startY: number): void {
    this.interactionState = InteractionState.PULLING_CORD;
    this.cordPullState = {
      isGrabbing: true,
      grabStartY: startY,
      currentY: startY,
      pullDistance: 0,
      feedbackIntensity: 0,
    };

    console.log('[LightBulbController] Cord pull started');
  }

  /**
   * Update the cord pulling interaction.
   * Note: We don't physically move the cord mesh as it's a child of the rotatable group,
   * which would cause unwanted visual side effects. Instead, we track pull distance for
   * threshold detection.
   *
   * @param currentY - Current Y position (normalized)
   */
  private updateCordPull(currentY: number): void {
    if (!this.cordPullState.isGrabbing) return;

    this.cordPullState.currentY = currentY;

    // Calculate pull distance in pixels (Y increases downward in MediaPipe)
    const deltaY = currentY - this.cordPullState.grabStartY;
    this.cordPullState.pullDistance = Math.max(0, deltaY * window.innerHeight);

    // Calculate feedback intensity (0-1) based on pull progress
    this.cordPullState.feedbackIntensity = Math.min(
      1,
      this.cordPullState.pullDistance / this.config.cordPullThreshold
    );

    // Visual feedback: subtle scale on cord to indicate grabbing
    // This doesn't affect the bulb's rotation since we're scaling, not translating
    if (this.cordMesh) {
      const baseScale = 1.0;
      const maxScaleIncrease = 0.1;
      const scaleY = baseScale + this.cordPullState.feedbackIntensity * maxScaleIncrease;
      this.cordMesh.scale.setY(scaleY);
    }
  }

  /**
   * End the cord pulling interaction and potentially toggle light.
   */
  private endCordPull(): void {
    if (!this.cordPullState.isGrabbing) return;

    // Check if pull threshold was reached
    if (this.cordPullState.pullDistance >= this.config.cordPullThreshold) {
      this.toggleLight();
    }

    // Reset cord scale with animation
    if (this.cordMesh) {
      gsap.to(this.cordMesh.scale, {
        y: 1.0,
        duration: 0.2,
        ease: 'power2.out',
      });
    }

    // Reset cord pull state
    this.cordPullState = {
      isGrabbing: false,
      grabStartY: 0,
      currentY: 0,
      pullDistance: 0,
      feedbackIntensity: 0,
    };

    console.log('[LightBulbController] Cord pull ended');
  }

  /**
   * Toggle the light state (on/off).
   */
  private toggleLight(): void {
    const newState = this.lightState === LightState.OFF ? LightState.ON : LightState.OFF;
    this.applyLightState(newState, true);
    console.log(`[LightBulbController] Light toggled to: ${newState}`);
  }

  /**
   * Apply the given light state with physics-based incandescent animation.
   * Uses IncandescentAnimator for realistic warm-up/cool-down curves.
   *
   * @param state - Target light state
   * @param animate - Whether to animate the transition
   */
  private applyLightState(state: LightState, animate: boolean): void {
    this.lightState = state;
    const isOn = state === LightState.ON;

    if (animate) {
      // Use physics-based incandescent animation
      if (isOn) {
        this.incandescentAnimator.turnOn();
      } else {
        this.incandescentAnimator.turnOff();
      }
    } else {
      // Instant state change
      this.incandescentAnimator.setImmediate(isOn);
    }
  }

  /**
   * Start the rotation interaction.
   *
   * @param startX - Starting X position (normalized)
   * @param startY - Starting Y position (normalized)
   */
  private startRotation(startX: number, startY: number): void {
    this.interactionState = InteractionState.ROTATING;
    this.rotationState.isRotating = true;
    this.rotationState.startPosition = { x: startX, y: startY };
    this.rotationState.currentPosition = { x: startX, y: startY };
    this.rotationState.velocity = { x: 0, y: 0 };

    if (this.lightBulbGroup) {
      this.rotationState.targetRotation = {
        x: this.lightBulbGroup.rotation.x,
        y: this.lightBulbGroup.rotation.y,
      };
    }
  }

  /**
   * Update the rotation based on hand movement.
   * Uses smoothed delta for responsive yet stable rotation.
   *
   * @param currentX - Current X position (normalized)
   * @param currentY - Current Y position (normalized)
   */
  private updateRotation(currentX: number, currentY: number): void {
    if (!this.rotationState.isRotating || !this.lightBulbGroup) return;

    const prevPosition = this.rotationState.currentPosition;

    // Smooth the input position to reduce jitter
    const smoothedX = prevPosition.x + (currentX - prevPosition.x) * (1 - this.ROTATION_SMOOTHING);
    const smoothedY = prevPosition.y + (currentY - prevPosition.y) * (1 - this.ROTATION_SMOOTHING);

    this.rotationState.currentPosition = { x: smoothedX, y: smoothedY };

    // Calculate delta movement (mirrored for natural feel)
    const deltaX = -(smoothedX - prevPosition.x);
    const deltaY = smoothedY - prevPosition.y;

    // Update rotation with reduced sensitivity for smoother control
    const sensitivity = this.config.rotationSensitivity * 0.6; // Reduce by 40%
    const rotationDeltaY = deltaX * Math.PI * sensitivity;
    const rotationDeltaX = deltaY * Math.PI * sensitivity;

    this.rotationState.targetRotation.y += rotationDeltaY;
    this.rotationState.targetRotation.x += rotationDeltaX;

    // Clamp X rotation to prevent over-rotation
    this.rotationState.targetRotation.x = THREE.MathUtils.clamp(
      this.rotationState.targetRotation.x,
      -Math.PI / 3,
      Math.PI / 3
    );

    // Track velocity for inertia
    this.rotationState.velocity = { x: rotationDeltaX, y: rotationDeltaY };

    // Apply rotation directly (smoothing already applied to input)
    this.lightBulbGroup.rotation.x = this.rotationState.targetRotation.x;
    this.lightBulbGroup.rotation.y = this.rotationState.targetRotation.y;
  }

  /**
   * End the rotation interaction.
   */
  private endRotation(): void {
    this.rotationState.isRotating = false;
  }

  /**
   * Update rotation inertia (continues rotation after release).
   *
   * @param _deltaTime - Time since last frame in seconds (unused, kept for future physics)
   */
  private updateRotationInertia(_deltaTime: number): void {
    if (this.rotationState.isRotating || !this.lightBulbGroup) return;

    // Apply velocity with damping
    const { velocity } = this.rotationState;
    const damping = this.config.rotationDamping;

    if (Math.abs(velocity.x) > 0.0001 || Math.abs(velocity.y) > 0.0001) {
      this.rotationState.targetRotation.x += velocity.x;
      this.rotationState.targetRotation.y += velocity.y;

      // Clamp X rotation
      this.rotationState.targetRotation.x = THREE.MathUtils.clamp(
        this.rotationState.targetRotation.x,
        -Math.PI / 3,
        Math.PI / 3
      );

      // Apply rotation
      this.lightBulbGroup.rotation.x = this.rotationState.targetRotation.x;
      this.lightBulbGroup.rotation.y = this.rotationState.targetRotation.y;

      // Apply damping
      velocity.x *= damping;
      velocity.y *= damping;
    }
  }

  /**
   * Send debug information to the callback.
   */
  private sendDebugInfo(): void {
    if (!this.debugCallback) return;

    const rotationY = this.lightBulbGroup
      ? THREE.MathUtils.radToDeg(this.lightBulbGroup.rotation.y)
      : 0;
    const rotationX = this.lightBulbGroup
      ? THREE.MathUtils.radToDeg(this.lightBulbGroup.rotation.x)
      : 0;

    this.debugCallback({
      fps: this.currentFps,
      handsDetected: this.lastHandCount,
      isLightOn: this.lightState === LightState.ON,
      interactionState: this.interactionState,
      pinchDistance: 0, // Updated from gesture detector
      cordPullDistance: this.cordPullState.pullDistance,
      rotationY,
      rotationX,
    });
  }

  /**
   * Clean up and dispose of all resources.
   */
  dispose(): void {
    if (this.state === LightBulbState.DISPOSED) return;

    this.stopUpdateLoop();

    // Dispose of animator
    this.incandescentAnimator.dispose();

    // Dispose of Three.js resources
    if (this.lightBulbGroup) {
      this.scene.remove(this.lightBulbGroup);
      this.lightBulbGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }

    // Dispose filament glow mesh
    this.scene.remove(this.filamentGlow.mesh);
    this.filamentGlow.dispose();

    // Dispose post-processing pipeline
    this.postProcessing.dispose();
    this.renderer.dispose();

    // Remove renderer from DOM
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    // Dispose landmark overlay
    this.landmarkOverlay?.dispose();

    this.state = LightBulbState.DISPOSED;
    console.log('[LightBulbController] Disposed');
  }
}
