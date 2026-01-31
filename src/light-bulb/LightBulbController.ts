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
  CordState,
  type LightBulbConfig,
  type LightBulbDebugInfo,
  type CordPullState,
  type CordFatigueState,
  type RotationState,
} from './types';

import { PostProcessingPipeline } from './components/PostProcessingPipeline';
import { FilamentGlowMesh, COLOR_TEMPERATURES } from './components/FilamentGlowMesh';
import { IncandescentAnimator, type LightAnimationState } from './components/IncandescentAnimator';
import { CordSimulator } from './physics/CordSimulator';
import { CordMesh } from './components/CordMesh';

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
  // Cord is now handled by CordSimulator/CordMesh, not specific GLB mesh
  // private cordMesh: THREE.Mesh | null = null;
  private filamentMesh: THREE.Mesh | null = null;

  // Physics Cord
  private cordSimulator: CordSimulator | null = null;
  private cordMesh: CordMesh | null = null;
  private cordAnchor: THREE.Object3D | null = null; // Attachment point on the bulb socket

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
    grabStartX: 0,
    currentX: 0,
    grabStartY: 0,
    currentY: 0,
    pullDistance: 0,
    feedbackIntensity: 0,
    hasToggled: false,
  };

  // Cord breaking state
  private cordState: CordState = CordState.ATTACHED;
  private cordFatigue: CordFatigueState = {
    stress: 0,
    lastPullTimestamp: 0,
    pullCount: 0,
    pendingBreak: false,
  };
  private lastPullY: number = 0;
  private lastPullTimestamp: number = 0;

  /** Smoothed target position for cord end to reduce jitter (cached between frames) */
  private smoothedCordTarget: THREE.Vector3 = new THREE.Vector3();
  /** Lerp factor for cord position smoothing (0-1, higher = more responsive but jittery) */
  private readonly CORD_POSITION_SMOOTHING = 0.3;

  // Cord break configuration constants
  /** Minimum pull velocity (normalized units/sec) for "aggressive" pull */
  private readonly AGGRESSIVE_PULL_VELOCITY = 1.2;
  /** Extension threshold (multiplier of natural length) to allow breaking */
  private readonly EXTENSION_BREAK_THRESHOLD = 1.4;
  /** Stress added per aggressive pull */
  private readonly STRESS_PER_PULL = 0.35;
  /** Stress decay rate per second when idle */
  private readonly STRESS_DECAY_RATE = 0.02;
  /** Stress threshold to enable break probability */
  private readonly BREAK_THRESHOLD = 0.7;
  /** Probability of break per aggressive pull above threshold */
  private readonly BREAK_PROBABILITY = 0.75;
  /** Minimum upward velocity (world units/sec) to trigger deferred break on bounce */
  private readonly UPWARD_BOUNCE_BREAK_VELOCITY = 1.5;
  /** Maximum stretch (multiplier of natural length) before instant break */
  private readonly MAX_STRETCH_BEFORE_SNAP = 2.2;

  // Keyboard listener reference for cleanup
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

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

  // Raycaster for cord collision (will cast against cord mesh)
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

    // Setup R-key reset handler
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') {
        this.resetCord();
      }
    };
    window.addEventListener('keydown', this.keydownHandler);

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

  // Placeholder for dynamically found anchor position from the model
  private foundCordAnchorPos: THREE.Vector3 | null = null;

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
        // Calculate the attachment point (top of the cord)
        // We assume the cord hangs down, so the highest point (max Y) of its bounding box
        // in its local space (relative to the bulb) is the attachment point.
        mesh.geometry.computeBoundingBox();
        if (mesh.geometry.boundingBox) {
          const box = mesh.geometry.boundingBox;

          // Find top center in geometry local space
          const topCenter = new THREE.Vector3(
            (box.min.x + box.max.x) / 2,
            box.max.y,
            (box.min.z + box.max.z) / 2
          );

          // transform to parent space (the model root space)
          mesh.updateMatrix();
          topCenter.applyMatrix4(mesh.matrix);

          this.foundCordAnchorPos = topCenter;
          console.log(
            `[LightBulbController] Found Cord Anchor at: ${topCenter.x.toFixed(3)}, ${topCenter.y.toFixed(3)}, ${topCenter.z.toFixed(3)}`
          );
        }

        // Hide the static cord mesh as we replace it with physics cord
        mesh.visible = false;
      } else if (name.includes('bulb') || name.includes('glass') || name.includes('lamp')) {
        this.setupBulbMaterial(mesh);
      } else if (name.includes('filament') || name.includes('wire') || name.includes('glow')) {
        this.filamentMesh = mesh;
        this.setupFilamentMaterial(mesh);
      }
    });

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

    // UX FIX: Move the bulb higher up to give more room for the cord
    this.lightBulbGroup.position.y += 0.6;

    this.scene.add(this.lightBulbGroup);

    // Initialize Cord Physics
    this.initializeCordPhysics(scale);

    // Position filament glow mesh at the bulb center for God Rays
    this.positionFilamentGlow();

    // Setup God Rays post-processing with the filament glow mesh
    this.postProcessing.setup(this.filamentGlow.mesh);

    // Apply initial light state (OFF)
    this.applyLightState(LightState.OFF, false);

    console.log('[LightBulbController] Model processed successfully');
  }

  /**
   * Initialize the physics-based cord simulator and mesh.
   *
   * @param modelScale - Scale factor applied to the model, to match cord dimensions
   */
  private initializeCordPhysics(modelScale: number): void {
    if (!this.lightBulbGroup) return;

    // Create a virtual anchor point attached to the bulb group
    // This allows the cord to move when the bulb rotates
    this.cordAnchor = new THREE.Object3D();

    // Position anchor at the found position or fallback
    if (this.foundCordAnchorPos) {
      // Use the dynamically found position from the GLB
      this.cordAnchor.position.copy(this.foundCordAnchorPos);
      console.log('[LightBulbController] Using dynamic cord anchor position');
    } else {
      // Fallback: estimate based on typical bulb proportions if mesh not found
      console.warn('[LightBulbController] Cord mesh not found, using fallback anchor');
      this.cordAnchor.position.set(0.08, -0.45, 0.08);
    }

    // Add anchor to the rotatable group so it moves with it
    this.lightBulbGroup.add(this.cordAnchor);
    this.cordAnchor.updateWorldMatrix(true, false);

    // Create Simulator
    const worldPos = new THREE.Vector3();
    this.cordAnchor.getWorldPosition(worldPos);

    this.cordSimulator = new CordSimulator(worldPos, {
      totalLength: 0.5 * modelScale, // Scaled length
      segmentCount: 16,
      iterations: 10,
    });

    // Create Mesh (Beaded Chain)
    this.cordMesh = new CordMesh(this.cordSimulator, {
      radius: 0.012 * modelScale, // Bead radius
      color: 0xb8860b, // Dark Golden Rod / Brass
      roughness: 0.3,
      metalness: 1.0,
    });

    this.scene.add(this.cordMesh.getMesh());
    console.log('[LightBulbController] Cord physics initialized');
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

    // Reset cord if needed
    if (this.cordSimulator && this.cordAnchor) {
      // Allow cord to settle naturally
    }

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
      grabStartX: 0,
      currentX: 0,
      grabStartY: 0,
      currentY: 0,
      pullDistance: 0,
      feedbackIntensity: 0,
      hasToggled: false,
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

      // --- Physics Update Step ---
      if (this.cordSimulator && this.cordAnchor) {
        // 1. Update Anchor Position from Bulb Rotation
        // The anchor moves because it's child of lightBulbGroup which rotates
        const anchorPos = new THREE.Vector3();
        this.cordAnchor.getWorldPosition(anchorPos);
        this.cordSimulator.setAnchor(anchorPos);

        // 2. Step Physics
        this.cordSimulator.update(deltaTime);

        // 3. Monitor for pending break on upward bounce
        this.checkPendingBreakOnBounce();

        // 4. Update Visual Mesh
        if (this.cordMesh) {
          this.cordMesh.update();
        }
      }

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
      grabStartX: 0,
      currentX: 0,
      grabStartY: 0,
      currentY: 0,
      pullDistance: 0,
      feedbackIntensity: 0,
      hasToggled: false,
    };

    this.interactionState = InteractionState.IDLE;
  }

  /**
   * Reset the cord's visual state (release grab).
   */
  private resetCordVisual(): void {
    // For physics cord, we must explicitly unpin cleanly
    // to prevent it staying frozen in space if hand is lost
    if (this.cordSimulator) {
      const particles = this.cordSimulator.getParticlePositions();
      const lastIndex = particles.length - 1;
      this.cordSimulator.unpinParticle(lastIndex);
    }
  }

  // -------------------------------------------------------------------------
  // Interaction Logic Refinements
  // -------------------------------------------------------------------------

  /**
   * Handle pinch gesture for rotation and cord pulling.
   * Enforces mutually exclusive interaction zones to prevent accidental triggers.
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
        this.updateCordPull(normalizedPosition.x, normalizedPosition.y);
      } else if (this.interactionState === InteractionState.ROTATING) {
        this.updateRotation(normalizedPosition.x, normalizedPosition.y);
      }
      return;
    }

    // Starting a new interaction - check zones
    if (state === GestureState.STARTED || !this.isPinchHeld) {
      // Only start interaction after sustained frames threshold
      if (this.sustainedPinchFrames >= this.MIN_SUSTAINED_FRAMES) {
        this.isPinchHeld = true;

        // ZONE CHECK: Priority to Cord -> Bulb -> None

        // 1. Check Cord
        if (this.checkCordCollision(normalizedPosition.x, normalizedPosition.y)) {
          this.startCordPull(normalizedPosition.x, normalizedPosition.y);
          return;
        }

        // 2. Check Bulb (Explicit check, prevents accidental background rotation)
        if (this.checkBulbCollision(normalizedPosition.x, normalizedPosition.y)) {
          this.startRotation(normalizedPosition.x, normalizedPosition.y);
          return;
        }

        // If neither hit, do nothing (ignore background pinches)
        console.log('[LightBulbController] Pinch ignored (clicked empty space)');
      }
    }
  }

  /**
   * Check collision with the Bulb body/glass.
   */
  private checkBulbCollision(normX: number, normY: number): boolean {
    if (!this.lightBulbGroup) return false;

    // Convert to NDC
    const ndcX = -(normX * 2 - 1);
    const ndcY = -(normY * 2 - 1);
    const rayOrigin = new THREE.Vector2(ndcX, ndcY);
    this.raycaster.setFromCamera(rayOrigin, this.camera);

    // Raycast against the whole bulb group (excluding the cord which is checked separately)
    // Note: lightBulbGroup contains the cordAnchor, but Raycaster checks meshes.
    // We want to hit the bulb meshes.
    const intersects = this.raycaster.intersectObject(this.lightBulbGroup, true);

    // Filter out utility objects if needed, but usually hitting any part of the bulb model is fine
    // The cord mesh is in the scene, NOT in lightBulbGroup (it's added to scene directly by LightBulbController via CordMesh)
    // Wait, CordMesh adds to which group? "this.scene.add(this.cordMesh.getMesh())".
    // So lightBulbGroup IS safe to raycast against for just the bulb.

    if (intersects.length > 0) {
      // Verify we didn't hit the cord anchor or something invisible
      // Just check if visible
      const hit = intersects.find((i) => i.object.visible);
      if (hit) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if the given screen position collides with the cord.
   */
  private checkCordCollision(normX: number, normY: number): boolean {
    // Check against physics cord mesh
    if (this.cordMesh) {
      // Convert normalized coordinates to NDC (-1 to 1)
      const ndcX = -(normX * 2 - 1);
      const ndcY = -(normY * 2 - 1);

      // Set up raycaster
      const rayOrigin = new THREE.Vector2(ndcX, ndcY);
      this.raycaster.setFromCamera(rayOrigin, this.camera);

      // Raycast against the generated mesh (InstancedMesh group)
      // Use recursive=true to hit the handle as well
      const intersects = this.raycaster.intersectObject(this.cordMesh.getRaycastObject(), true);

      if (intersects.length > 0) {
        console.log('[LightBulbController] Physics cord hit');
        return true;
      }
    }

    // REMOVED Fallback Spatial Region
    // It was causing accidental hits when trying to rotate the bulb near the bottom.
    // relying purely on raycasting for reliable interaction.

    return false;
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
   * Start the cord pulling interaction.
   *
   * @param startX - Starting X position (normalized)
   * @param startY - Starting Y position (normalized)
   */
  private startCordPull(startX: number, startY: number): void {
    this.interactionState = InteractionState.PULLING_CORD;
    this.cordPullState = {
      isGrabbing: true,
      grabStartX: startX,
      currentX: startX,
      grabStartY: startY,
      currentY: startY,
      pullDistance: 0,
      feedbackIntensity: 0,
      hasToggled: false, // Reset toggle state
    };

    // Physics: Pin the last particle to hand control
    if (this.cordSimulator) {
      const particles = this.cordSimulator.getParticlePositions();
      const lastIndex = particles.length - 1;
      this.cordSimulator.pinParticle(lastIndex);

      // Initialize smoothed target to current particle position to prevent snap
      this.smoothedCordTarget.copy(particles[lastIndex]);
    }

    console.log('[LightBulbController] Cord pull started (Pinned)');
  }

  /**
   * Update the cord pulling interaction.
   * Force the last particle to follow hand movement in 2D (mapped to world space).
   *
   * @param currentX - Current X position (normalized)
   * @param currentY - Current Y position (normalized)
   */
  private updateCordPull(currentX: number, currentY: number): void {
    if (!this.cordPullState.isGrabbing || !this.cordSimulator) return;

    this.cordPullState.currentX = currentX;
    this.cordPullState.currentY = currentY;

    // Calculate pull distance in pixels
    const deltaX = currentX - this.cordPullState.grabStartX;
    const deltaY = currentY - this.cordPullState.grabStartY;

    // Vertical pull distance for toggling (clamped)
    this.cordPullState.pullDistance = Math.max(-100, deltaY * window.innerHeight);

    // --- Stress Accumulation for Cord Breaking ---
    const now = performance.now();
    if (this.lastPullTimestamp > 0 && this.cordSimulator) {
      const dt = (now - this.lastPullTimestamp) / 1000;
      if (dt > 0) {
        // Only consider vertical velocity (downward pulls are more stressful)
        // This prevents breaking from rapid horizontal movement
        const verticalVelocity = Math.max(0, currentY - this.lastPullY) / dt;

        // Calculate current extension vs rest length
        const particles = this.cordSimulator.getParticlePositions();
        const first = particles[0];
        const last = particles[particles.length - 1];
        const currentDist = first.distanceTo(last);
        const restLen = 0.5 * (this.lightBulbGroup?.scale.y || 1.0);
        const extensionRatio = currentDist / restLen;

        // Check for aggressive pull: Requires BOTH high velocity AND significant extension
        // This prevents breaking from side-to-side movement or rapid light usage
        if (
          verticalVelocity > this.AGGRESSIVE_PULL_VELOCITY &&
          extensionRatio > this.EXTENSION_BREAK_THRESHOLD &&
          this.cordState === CordState.ATTACHED
        ) {
          this.cordFatigue.stress += this.STRESS_PER_PULL;
          this.cordFatigue.pullCount++;
          this.cordFatigue.lastPullTimestamp = now;

          console.log(
            `[CordFatigue] Aggressive Pull! Stress: ${this.cordFatigue.stress.toFixed(
              2
            )}, Extension: ${extensionRatio.toFixed(2)}x`
          );

          // Mark for deferred break on upward bounce (instead of breaking immediately)
          if (this.cordFatigue.stress >= this.BREAK_THRESHOLD && !this.cordFatigue.pendingBreak) {
            if (Math.random() < this.BREAK_PROBABILITY) {
              this.cordFatigue.pendingBreak = true;
              console.log('[CordFatigue] Break pending - will snap on upward bounce!');
            }
          }
        }
      }
    }
    this.lastPullY = currentY;
    this.lastPullTimestamp = now;

    // --- Stress Decay (when not pulling aggressively) ---
    const timeSinceLastAggressivePull = (now - this.cordFatigue.lastPullTimestamp) / 1000;
    if (timeSinceLastAggressivePull > 0.5 && this.cordFatigue.stress > 0) {
      this.cordFatigue.stress = Math.max(
        0,
        this.cordFatigue.stress - this.STRESS_DECAY_RATE * 0.016
      );
    }

    // Physics Interaction: Map hand position to world space and force the bottom particle
    if (this.cordSimulator) {
      const particles = this.cordSimulator.getParticlePositions();
      const lastIndex = particles.length - 1;

      // Map pixel delta to world delta (approximate at depth 5m)
      const worldHeightVisible = 4.66;
      const worldWidthVisible = worldHeightVisible * (window.innerWidth / window.innerHeight);

      const worldDeltaX = -deltaX * worldWidthVisible;
      const worldDeltaY = deltaY * worldHeightVisible;

      let rawTargetPos: THREE.Vector3;

      if (this.cordState === CordState.ATTACHED && this.cordAnchor) {
        // Attached: move relative to anchor
        const anchorPos = new THREE.Vector3();
        this.cordAnchor.getWorldPosition(anchorPos);

        const cordLen = 0.5 * this.lightBulbGroup!.scale.y;

        const targetX = anchorPos.x + worldDeltaX;
        const targetY = anchorPos.y - cordLen - worldDeltaY;
        const targetZ = anchorPos.z;

        rawTargetPos = new THREE.Vector3(targetX, targetY, targetZ);
      } else if (this.cordState === CordState.DETACHED) {
        // Detached: follow hand freely in world space
        // Use camera-relative positioning
        const worldX = (0.5 - currentX) * worldWidthVisible;
        const worldY = (0.5 - currentY) * worldHeightVisible;
        rawTargetPos = new THREE.Vector3(worldX, worldY, 0);
      } else {
        return; // Safety: no valid state
      }

      // Apply exponential smoothing to reduce jitter from hand tracking noise
      // Lerp: smoothed = smoothed + alpha * (target - smoothed)
      this.smoothedCordTarget.lerp(rawTargetPos, this.CORD_POSITION_SMOOTHING);

      // Apply smoothed position to the grabbed particle
      this.cordSimulator.grabParticle(lastIndex, this.smoothedCordTarget);

      // Check for overstretching (instant break if stretched too far)
      if (this.cordState === CordState.ATTACHED && this.cordAnchor) {
        const anchorPos = new THREE.Vector3();
        this.cordAnchor.getWorldPosition(anchorPos);

        const currentDist = anchorPos.distanceTo(particles[lastIndex]);
        const restLen = 0.5 * (this.lightBulbGroup?.scale.y || 1.0);
        const stretchRatio = currentDist / restLen;

        // Instant break if stretched beyond maximum threshold
        if (stretchRatio > this.MAX_STRETCH_BEFORE_SNAP) {
          console.log(
            `[CordBreak] Overstretched! Ratio: ${stretchRatio.toFixed(2)}x - INSTANT SNAP!`
          );
          // Mark for break on next upward bounce
          this.cordFatigue.pendingBreak = true;
        }
      }
    }

    // UX Logic: Check threshold and toggle immediately if reached (only when attached)
    if (this.cordState === CordState.ATTACHED) {
      const positivePull = Math.max(0, this.cordPullState.pullDistance);

      if (positivePull >= this.config.cordPullThreshold && !this.cordPullState.hasToggled) {
        this.toggleLight();
        this.cordPullState.hasToggled = true;
        console.log('[LightBulbController] Threshold reached - Toggled!');
      } else if (
        positivePull < this.config.cordPullThreshold * 0.4 &&
        this.cordPullState.hasToggled
      ) {
        this.cordPullState.hasToggled = false;
        console.log('[LightBulbController] Toggle reset (Hysteresis)');
      }

      // Calculate feedback intensity (0-1) based on pull progress
      this.cordPullState.feedbackIntensity = Math.min(
        1,
        positivePull / this.config.cordPullThreshold
      );
    }
  }

  /**
   * End the cord pulling interaction.
   * Note: Toggling now happens during the pull, so we just cleanup here.
   */
  private endCordPull(): void {
    if (!this.cordPullState.isGrabbing) return;

    // Physics: Unpin the particle to let it spring back
    if (this.cordSimulator) {
      const particles = this.cordSimulator.getParticlePositions();
      const lastIndex = particles.length - 1;
      this.cordSimulator.unpinParticle(lastIndex);
    }

    // Reset cord pull state
    this.cordPullState = {
      isGrabbing: false,
      grabStartX: 0,
      currentX: 0,
      grabStartY: 0,
      currentY: 0,
      pullDistance: 0,
      feedbackIntensity: 0,
      hasToggled: false,
    };

    console.log('[LightBulbController] Cord pull ended (Unpinned)');
  }

  /**
   * Check if the cord should break during upward bounce after release.
   *
   * Monitors the cord's velocity when a break is pending. When the cord bounces
   * upward with sufficient velocity after being released, triggers the break
   * for a more dramatic visual effect (cord flies up as it snaps).
   */
  private checkPendingBreakOnBounce(): void {
    // Only check when conditions are met:
    // - Cord is still attached
    // - Break is pending from prior stress accumulation
    // - User is not actively grabbing the cord (cord is bouncing freely)
    if (
      this.cordState !== CordState.ATTACHED ||
      !this.cordFatigue.pendingBreak ||
      this.cordPullState.isGrabbing ||
      !this.cordSimulator
    ) {
      return;
    }

    // Get velocity of the bottom particle (the handle/end of cord)
    const particles = this.cordSimulator.getParticlePositions();
    const lastIndex = particles.length - 1;
    const velocity = this.cordSimulator.getVelocity(lastIndex);

    // Check for upward motion (positive Y velocity in world space)
    // The cord snaps when bouncing upward with sufficient velocity
    if (velocity.y > this.UPWARD_BOUNCE_BREAK_VELOCITY) {
      console.log(
        `[CordFatigue] Upward bounce detected! Velocity: ${velocity.y.toFixed(2)} - SNAP!`
      );
      this.breakCord();
      // Clear the pending flag (already consumed)
      this.cordFatigue.pendingBreak = false;
    }
  }

  /**
   * Break the cord, detaching it from the light bulb.
   * Severs the electrical connection, turning off the light.
   */
  private breakCord(): void {
    if (this.cordState === CordState.DETACHED) return;

    this.cordState = CordState.DETACHED;

    // Detach physics anchor
    if (this.cordSimulator) {
      this.cordSimulator.detachAnchor();
    }

    // Turn off the light (electrical connection severed)
    this.applyLightState(LightState.OFF, true);
  }

  /**
   * Reset the cord to its attached state.
   * Called on R-key press.
   */
  private resetCord(): void {
    // Reset state
    this.cordState = CordState.ATTACHED;
    this.cordFatigue = {
      stress: 0,
      lastPullTimestamp: 0,
      pullCount: 0,
      pendingBreak: false,
    };
    this.lastPullY = 0;
    this.lastPullTimestamp = 0;

    // Reset physics
    if (this.cordSimulator && this.cordAnchor) {
      const anchorPos = new THREE.Vector3();
      this.cordAnchor.getWorldPosition(anchorPos);
      this.cordSimulator.reattachAnchor(anchorPos);
    }

    // Reset light to OFF
    this.applyLightState(LightState.OFF, false);

    // Reset interaction states
    this.forceResetAllInteractions();

    console.log('[LightBulbController] Cord and light reset');
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
   * Improved physics feel: Less smoothing, more direct control, constrained axis.
   */
  private updateRotation(currentX: number, currentY: number): void {
    if (!this.rotationState.isRotating || !this.lightBulbGroup) return;

    const prevPosition = this.rotationState.currentPosition;

    // Use lighter smoothing for more responsive feel (0.1 instead of 0.3)
    // 0.0 = no smoothing, 1.0 = infinite smoothing
    const smoothing = 0.15;
    const smoothedX = prevPosition.x + (currentX - prevPosition.x) * (1 - smoothing);
    const smoothedY = prevPosition.y + (currentY - prevPosition.y) * (1 - smoothing);

    this.rotationState.currentPosition = { x: smoothedX, y: smoothedY };

    // Calculate delta movement (mirrored for natural feel)
    const deltaX = -(smoothedX - prevPosition.x);
    const deltaY = smoothedY - prevPosition.y;

    // Sensitivity
    const sensitivity = this.config.rotationSensitivity * 0.8;

    // Main rotation: Y-axis (spinning)
    const rotationDeltaY = deltaX * Math.PI * sensitivity;

    // Secondary rotation: X-axis (tilting/swinging)
    // Reduce X sensitivity significantly to prioritize spinning
    const rotationDeltaX = deltaY * Math.PI * sensitivity * 0.3;

    this.rotationState.targetRotation.y += rotationDeltaY;
    this.rotationState.targetRotation.x += rotationDeltaX;

    // Clamp X rotation tightly - we don't want to flip the bulb
    this.rotationState.targetRotation.x = THREE.MathUtils.clamp(
      this.rotationState.targetRotation.x,
      -Math.PI / 6, // 30 degrees max tilt
      Math.PI / 6
    );

    // Track velocity for inertia
    this.rotationState.velocity = { x: rotationDeltaX, y: rotationDeltaY };

    // Apply rotation
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

    // Remove keydown handler
    if (this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }

    // Dispose landmark overlay
    this.landmarkOverlay?.dispose();

    this.state = LightBulbState.DISPOSED;
    console.log('[LightBulbController] Disposed');
  }
}
