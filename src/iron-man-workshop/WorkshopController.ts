/**
 * WorkshopController
 * Main controller for the Iron Man holographic interface mode
 *
 * Architecture:
 * - Three.js scene with transparent background (webcam visible behind)
 * - Post-processing with UnrealBloomPass for holographic glow
 * - Multiple holographic components (grid, rings, panels, schematic)
 * - Hand tracking integration ready for Phase 2
 */

import * as THREE from 'three';
import {
  EffectComposer,
  RenderPass,
  BloomEffect,
  EffectPass,
} from 'postprocessing';

import { HandTracker } from '../shared/HandTracker';
import {
  WorkshopConfig,
  WorkshopDebugInfo,
  DEFAULT_WORKSHOP_CONFIG,
} from './types';

// Components
import { createWorkshopGrid } from './components/WorkshopGrid';
import {
  createWorkshopRings,
  updateWorkshopRings,
} from './components/WorkshopRings';
import {
  createWorkshopPanels,
  updateWorkshopPanels,
} from './components/WorkshopPanels';
import {
  loadMarkVIModel,
  updateMarkVIModelCached,
} from './components/MarkVIModel';
import { HandLandmarkOverlay } from './components/HandLandmarkOverlay';
import {
  ExplodedViewManager,
  LimbType,
} from './components/ExplodedViewManager';
import { ParticleTrailSystem } from './components/ParticleTrailEmitter';
import { PartInfoPanel } from './components/PartInfoPanel';
import { calculateHandRoll } from '../utils/math';
import gsap from 'gsap';

/**
 * WorkshopController - Main controller for holographic mode
 */
export class WorkshopController {
  private handTracker: HandTracker;
  private container: HTMLElement;
  private config: WorkshopConfig;

  // Three.js core
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;

  // Holographic components
  private grid: THREE.Group | null = null;
  private rings: THREE.Group | null = null;
  private panels: THREE.Group | null = null;
  private schematic: THREE.Group | null = null;
  private partInfoPanel: PartInfoPanel | null = null;

  // Debug overlay for hand tracking visualization
  private handLandmarkOverlay: HandLandmarkOverlay | null = null;

  // Animation
  private animationFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private isRunning: boolean = false;

  // Debug
  private debugCallback: ((info: WorkshopDebugInfo) => void) | null = null;
  private fpsFrames: number = 0;
  private fpsLastTime: number = 0;
  private currentFps: number = 0;

  // Hand tracking state (per hand)
  private handStates: Map<
    number,
    {
      isGrabbing: boolean;
      grabTarget: 'body' | 'limb' | null;
      grabbedLimbType: LimbType | null; // The specific limb being grabbed (exploded mode only)
      grabbedLimbMesh: THREE.Object3D | null; // Reference to the grabbed limb mesh
      grabStartHandPosition: THREE.Vector3 | null;
      grabStartLimbPosition: THREE.Vector3 | null; // Original position of grabbed limb
      grabStartLimbRotation: THREE.Euler | null; // Original rotation of grabbed limb
      grabStartWristRoll: number | null; // Initial wrist roll when grab started
      lastWristRoll: number | null; // Previous frame's wrist roll (for smoothing)
      smoothedWristRoll: number; // Smoothed wrist roll value
      grabStartRotation: THREE.Euler;
      lastHandPosition: THREE.Vector3 | null; // For incremental delta
      // Per-hand raycast throttling state
      lastRaycastTime: number;
      cachedIntersects: THREE.Intersection[];
    }
  > = new Map();
  private schematicTargetRotation: THREE.Euler = new THREE.Euler(
    0,
    -Math.PI / 2, // Start facing camera
    0
  );

  // Hover state for visual feedback
  private isHoveringSchematic: boolean = false;
  private hoverIntensity: number = 0; // 0-1, used for smooth glow transition

  // Per-limb hover state for exploded view
  private hoveredLimbTypes: Set<LimbType> = new Set();
  private limbHoverIntensities: Map<LimbType, number> = new Map();

  // Inertia state
  private rotationVelocity: { x: number; y: number } = { x: 0, y: 0 };

  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  // Performance optimization: Raycaster throttling
  private readonly RAYCAST_INTERVAL_MS: number = 100; // 10Hz raycasting

  // Performance optimization: Cached schematic shader meshes
  private schematicShaderMeshes: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >[] = [];

  // Exploded View Feature
  private explodedViewManager: ExplodedViewManager | null = null;
  private particleTrailSystem: ParticleTrailSystem | null = null;

  // Left-hand gesture detection for exploded view
  // Open palm = explode, Closed fist = assemble
  private lastLeftHandPose: 'open' | 'fist' | 'unknown' = 'unknown';
  private leftHandGestureCooldownMs: number = 800;
  private lastLeftHandGestureTime: number = 0;

  // Left-hand wrist rotation state for twist-to-rotate in exploded view
  // Roll (twist) controls Y-axis, palm Y position controls X-axis
  private leftHandLastRoll: number | null = null;
  private leftHandRollSmoothed: number = 0;
  private leftHandLastPalmY: number | null = null;
  private leftHandPalmYSmoothed: number = 0;

  // Camera animation state
  private baseCameraZ: number = 5;
  private targetCameraZ: number = 5;

  constructor(
    handTracker: HandTracker,
    container: HTMLElement,
    config: Partial<WorkshopConfig> = {}
  ) {
    this.handTracker = handTracker;
    this.container = container;
    this.config = { ...DEFAULT_WORKSHOP_CONFIG, ...config };

    // Initialize Three.js
    this.scene = new THREE.Scene();

    // Camera setup - positioned to see the holographic display
    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 0.5, 5);
    this.camera.lookAt(0, 0, 0);

    // Renderer with transparency
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setClearColor(0x000000, 0); // Transparent background
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    // Post-processing with bloom
    this.composer = new EffectComposer(this.renderer);
    this.setupPostProcessing();

    // Bind resize handler
    this.handleResize = this.handleResize.bind(this);
  }

  /**
   * Initialize the holographic scene
   */
  initialize(): void {
    // Add renderer to container
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

    // Create hand landmark overlay (debug visualization)
    this.handLandmarkOverlay = new HandLandmarkOverlay(this.container);

    // Setup lighting
    this.setupLighting();

    // Create holographic components
    this.createComponents();

    // Listen for resize
    window.addEventListener('resize', this.handleResize);

    // Performance optimization: Throttle hand detection to 30Hz
    // MediaPipe detectForVideo is synchronous and expensive; 30Hz is smooth for interaction
    this.handTracker.setDetectionIntervalMs(33);

    console.log('[WorkshopController] Initialized with 30Hz hand detection');
  }

  /**
   * Setup post-processing effects
   */
  private setupPostProcessing(): void {
    // Render pass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Bloom effect for holographic glow
    const bloomEffect = new BloomEffect({
      intensity: this.config.bloomStrength,
      luminanceThreshold: this.config.bloomThreshold,
      luminanceSmoothing: 0.9,
      mipmapBlur: true,
    });

    const effectPass = new EffectPass(this.camera, bloomEffect);
    this.composer.addPass(effectPass);
  }

  /**
   * Setup scene lighting
   */
  private setupLighting(): void {
    // Ambient light for base visibility
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    this.scene.add(ambientLight);

    // Point light from camera position for highlights
    const pointLight = new THREE.PointLight(0x00ffff, 1, 20);
    pointLight.position.set(0, 2, 5);
    this.scene.add(pointLight);
  }

  /**
   * Create all holographic components
   */
  private createComponents(): void {
    const primaryColor = new THREE.Color(this.config.primaryColor);
    const secondaryColor = new THREE.Color(this.config.secondaryColor);

    // Grid floor
    this.grid = createWorkshopGrid({
      color: primaryColor,
      size: 12,
      divisions: 24,
      opacity: 0.25,
    });
    this.scene.add(this.grid);

    // Rotating rings
    this.rings = createWorkshopRings({
      color: primaryColor,
      innerRadius: 1.8,
      outerRadius: 2.0,
    });
    this.rings.position.y = 0;
    this.scene.add(this.rings);

    // Floating panels
    this.panels = createWorkshopPanels({
      color: primaryColor,
      width: 1.8,
      height: 1.2,
    });
    this.scene.add(this.panels);

    // Central holographic model (GLB)
    const scale = 3.0;
    const { group: modelGroup, loadPromise } = loadMarkVIModel({
      color: secondaryColor,
      scale,
    });
    this.schematic = modelGroup;
    this.schematic.userData.initialScale = scale;
    this.schematic.position.y = 0;
    this.schematic.rotation.y = -Math.PI / 2; // Face camera
    this.scene.add(this.schematic);

    // Cache shader meshes after model loads
    loadPromise
      .then(() => {
        this.cacheSchematicShaderMeshes();
        this.initializeExplodedView();
      })
      .catch((error) => {
        console.error('[WorkshopController] Model load failed:', error);
      });

    // Info Panel (initially hidden)
    this.partInfoPanel = new PartInfoPanel();
    this.scene.add(this.partInfoPanel.getObject());
  }

  /**
   * Initialize the Exploded View system
   * Sets up ExplodedViewManager, ParticleTrailSystem, and callbacks
   */
  private initializeExplodedView(): void {
    if (!this.schematic) return;

    // Create particle trail system
    this.particleTrailSystem = new ParticleTrailSystem();
    this.scene.add(this.particleTrailSystem.getObject3D());

    // Create emitters for each moving limb with spectacular settings
    const limbNames = [
      'head',
      'arm_left',
      'arm_right',
      'leg_left',
      'leg_right',
      'torso',
    ];
    limbNames.forEach((name) => {
      this.particleTrailSystem!.createEmitter(name, {
        maxParticles: 200, // Double density
        lifetime: 1.0, // Longer trails for slower animation
        particleSize: 0.12, // Much bigger for visibility
        coreColor: new THREE.Color(0x00ffff),
        fadeColor: new THREE.Color(0x002244),
      });
    });

    // Create ExplodedViewManager with cinematic callbacks
    this.explodedViewManager = new ExplodedViewManager({
      animationDuration: 1.0,
      enableSound: true,
      enableParticles: true,

      // Called when limb starts moving
      onLimbMoveStart: (limbName, mesh) => {
        // Start particle trail for this limb
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        // Initial direction (will be updated per-frame based on velocity)
        const direction = new THREE.Vector3(0, -1, 0);
        this.particleTrailSystem?.startTrail(limbName, worldPos, direction);

        // Intensify glow on moving limb
        if (
          mesh instanceof THREE.Mesh &&
          mesh.material instanceof THREE.ShaderMaterial
        ) {
          gsap.to(mesh.material.uniforms.uOpacity, {
            value: 0.9, // Brighter during motion
            duration: 0.2,
          });
        }
      },

      // Called every frame during movement - KEY for particle trail following
      onLimbMoveUpdate: (limbName, mesh, velocity) => {
        const worldPos = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        // Update particle trail position AND direction based on velocity
        this.particleTrailSystem?.updateTrailWithVelocity(
          limbName,
          worldPos,
          velocity
        );
      },

      // Called when limb stops moving
      onLimbMoveEnd: (limbName, mesh) => {
        // Stop particle trail
        this.particleTrailSystem?.stopTrail(limbName);

        // Reset glow
        if (
          mesh instanceof THREE.Mesh &&
          mesh.material instanceof THREE.ShaderMaterial
        ) {
          const baseOpacity = mesh.userData.baseOpacity ?? 0.4;
          gsap.to(mesh.material.uniforms.uOpacity, {
            value: baseOpacity,
            duration: 0.15, // Faster fade out
          });
        }
      },

      // Called during anticipation phase - boost hologram intensity
      onAnticipation: () => {
        console.log('[WorkshopController] Anticipation phase - charging');
        // Brief intense glow during anticipation
        for (const mesh of this.schematicShaderMeshes) {
          gsap.to(mesh.material.uniforms.uOpacity, {
            value: 0.7,
            duration: 0.1,
            yoyo: true,
            repeat: 1,
          });
        }
      },

      // Called on state changes
      onStateChange: (newState) => {
        // Camera zoom on state change
        if (newState === 'exploding') {
          this.targetCameraZ = this.baseCameraZ + 3.8; // Zoom out MORE (was 2.5)
          this.intensifyHologramEffect(true);
          this.animateRingsVisibility(false); // Fade out rings during explosion
        } else if (newState === 'assembling') {
          this.targetCameraZ = this.baseCameraZ; // Zoom back
          this.intensifyHologramEffect(false);
        } else if (newState === 'assembled') {
          this.animateRingsVisibility(true); // Fade in rings after reassembly
        }
      },
    });

    // Initialize manager with schematic reference
    this.explodedViewManager.initialize(this.schematic);

    console.log('[WorkshopController] ExplodedView system initialized');
  }

  /**
   * Cache all shader meshes from schematic for fast iteration
   * Called after model loads to avoid repeated traverse() calls
   */
  private cacheSchematicShaderMeshes(): void {
    if (!this.schematic) return;

    this.schematicShaderMeshes = [];
    this.schematic.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.material instanceof THREE.ShaderMaterial
      ) {
        // Store base opacity for hover effects
        child.userData.baseOpacity = child.material.uniforms.uOpacity.value;
        this.schematicShaderMeshes.push(
          child as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>
        );
      }
    });
    console.log(
      `[WorkshopController] Cached ${this.schematicShaderMeshes.length} shader meshes`
    );
  }

  /**
   * Start the animation loop
   */
  start(): void {
    if (this.isRunning) return;

    this.isRunning = true;
    this.lastTimestamp = performance.now();
    this.fpsLastTime = this.lastTimestamp;
    this.animate();

    console.log('[WorkshopController] Started');
  }

  /**
   * Stop the animation loop
   */
  stop(): void {
    this.isRunning = false;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    console.log('[WorkshopController] Stopped');
  }

  /**
   * Main animation loop
   */
  private animate = (): void => {
    if (!this.isRunning) return;

    const timestamp = performance.now();
    const deltaTime = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    // Update FPS counter
    this.updateFps(timestamp);

    // Get time for shaders
    const time = timestamp / 1000;

    // Update components
    this.update(time, deltaTime);

    // Render with post-processing
    this.composer.render();

    // Debug callback
    if (this.debugCallback) {
      this.debugCallback(this.getDebugInfo());
    }

    // Schedule next frame
    this.animationFrameId = requestAnimationFrame(this.animate);
  };

  /**
   * Update all holographic components
   */
  private update(time: number, deltaTime: number): void {
    // Update rings animation
    if (this.rings) {
      updateWorkshopRings(this.rings, deltaTime, time);
    }

    // Update panels animation
    if (this.panels) {
      updateWorkshopPanels(this.panels, time);
    }

    // Update schematic model animation (shader time uniforms)
    // Performance: Use cached meshes to avoid traverse() every frame
    if (this.schematicShaderMeshes.length > 0) {
      updateMarkVIModelCached(this.schematicShaderMeshes, time);
    }

    // Hand tracking for manipulation
    this.updateHandTracking(deltaTime);

    // Check if we need to apply inertia (no hands grabbing)
    let isGrabbing = false;
    for (const [, state] of this.handStates) {
      if (state.isGrabbing) {
        isGrabbing = true;
        break;
      }
    }

    // Smooth interpolation for schematic transformation
    if (this.schematic) {
      if (!isGrabbing) {
        // Apply inertia when not grabbing
        const DAMPING = 0.97; // Velocity decay per frame (higher = less friction)
        const STOP_THRESHOLD = 0.001;

        if (
          Math.abs(this.rotationVelocity.x) > STOP_THRESHOLD ||
          Math.abs(this.rotationVelocity.y) > STOP_THRESHOLD
        ) {
          // Apply velocity
          this.schematicTargetRotation.x += this.rotationVelocity.x * deltaTime;
          this.schematicTargetRotation.y += this.rotationVelocity.y * deltaTime;

          // Apply damping
          this.rotationVelocity.x *= DAMPING;
          this.rotationVelocity.y *= DAMPING;

          // Clamp X rotation to prevent flipping even during inertia
          this.schematicTargetRotation.x = Math.max(
            -Math.PI / 3,
            Math.min(Math.PI / 3, this.schematicTargetRotation.x)
          );
        }
      }

      // Smoothly interpolate rotation
      this.schematic.rotation.x +=
        (this.schematicTargetRotation.x - this.schematic.rotation.x) * 0.1;
      this.schematic.rotation.y +=
        (this.schematicTargetRotation.y - this.schematic.rotation.y) * 0.1;

      // Keep position centered
      this.schematic.position.set(0, 0, 0);
    }

    // Update Info Panel
    if (this.partInfoPanel) {
      this.partInfoPanel.update(time, this.camera);
    }

    // Update particle trail system
    this.particleTrailSystem?.update(deltaTime);

    // Smooth camera zoom animation
    const cameraZDiff = this.targetCameraZ - this.camera.position.z;
    if (Math.abs(cameraZDiff) > 0.01) {
      this.camera.position.z += cameraZDiff * 0.08;
    }

    // Detect left-hand gesture for exploded view toggle
    this.detectLeftHandGesture();

    // Apply left-hand wrist rotation when in exploded state
    this.updateLeftHandWristRotation();
  }

  /**
   * Detect left-hand gesture to trigger explode/assemble
   * Open palm on left hand = explode (fingers extended)
   * Closed fist on left hand = assemble (fingers curled)
   *
   * Uses MediaPipe handedness detection to identify left hand specifically.
   */
  private detectLeftHandGesture(): void {
    const result = this.handTracker.getLastResult();
    if (!result || result.landmarks.length === 0) {
      return;
    }

    // Find the left hand using handedness info
    let leftHandIndex = -1;
    if (result.handedness) {
      for (let i = 0; i < result.handedness.length; i++) {
        // MediaPipe returns actual anatomical handedness: "Left" = user's left hand
        if (result.handedness[i]?.[0]?.categoryName === 'Left') {
          leftHandIndex = i;
          break;
        }
      }
    }

    if (leftHandIndex === -1) {
      // No left hand detected
      return;
    }

    const landmarks = result.landmarks[leftHandIndex];

    // Calculate if hand is open (fingers extended) or closed (fist)
    // We measure the distance from fingertips to palm center
    // For a fist, fingertips are close to palm; for open palm, they're far

    // Key landmarks:
    // 0: wrist, 5: index MCP (palm), 9: middle MCP (palm)
    // 8: index tip, 12: middle tip, 16: ring tip, 20: pinky tip

    const palmCenter = {
      x: (landmarks[5].x + landmarks[9].x + landmarks[0].x) / 3,
      y: (landmarks[5].y + landmarks[9].y + landmarks[0].y) / 3,
    };

    // Calculate average distance from fingertips to palm center
    const fingerTips = [
      landmarks[8],
      landmarks[12],
      landmarks[16],
      landmarks[20],
    ];
    let totalDistance = 0;
    for (const tip of fingerTips) {
      const dx = tip.x - palmCenter.x;
      const dy = tip.y - palmCenter.y;
      totalDistance += Math.sqrt(dx * dx + dy * dy);
    }
    const avgFingerDistance = totalDistance / fingerTips.length;

    // Thresholds (in normalized coordinates)
    // Open palm: fingers far from palm (> 0.15)
    // Closed fist: fingers close to palm (< 0.08)
    const OPEN_THRESHOLD = 0.12;
    const CLOSED_THRESHOLD = 0.08;

    let currentPose: 'open' | 'fist' | 'unknown' = 'unknown';
    if (avgFingerDistance > OPEN_THRESHOLD) {
      currentPose = 'open';
    } else if (avgFingerDistance < CLOSED_THRESHOLD) {
      currentPose = 'fist';
    }

    // Check for state transition
    const now = performance.now();
    if (now - this.lastLeftHandGestureTime < this.leftHandGestureCooldownMs) {
      // Still in cooldown
      return;
    }

    // Trigger based on pose change
    if (currentPose !== this.lastLeftHandPose && currentPose !== 'unknown') {
      if (
        currentPose === 'open' &&
        this.explodedViewManager?.getState() === 'assembled'
      ) {
        console.log('[WorkshopController] Left hand OPEN PALM -> EXPLODE');
        this.lastLeftHandGestureTime = now;
        this.explodedViewManager.explode();
      } else if (
        currentPose === 'fist' &&
        this.explodedViewManager?.getState() === 'exploded'
      ) {
        console.log('[WorkshopController] Left hand CLOSED FIST -> ASSEMBLE');
        this.lastLeftHandGestureTime = now;
        this.explodedViewManager.assemble();

        // Reset rotation to original facing (animated via smooth interpolation in update loop)
        this.schematicTargetRotation.set(0, -Math.PI / 2, 0);
        this.rotationVelocity = { x: 0, y: 0 };
      }
    }

    if (currentPose !== 'unknown') {
      this.lastLeftHandPose = currentPose;
    }
  }

  /**
   * Detect left-hand wrist twist and palm movement, apply rotation to schematic
   *
   * This feature is ONLY active when:
   * 1. The schematic is in 'exploded' state
   * 2. The left hand is detected with an open palm
   *
   * Wrist roll (twist) -> Y-axis rotation (left/right)
   * Palm Y position (up/down movement) -> X-axis rotation (matching right hand)
   */
  private updateLeftHandWristRotation(): void {
    // Only active in exploded state
    if (this.explodedViewManager?.getState() !== 'exploded') {
      this.leftHandLastRoll = null;
      this.leftHandLastPalmY = null;
      return;
    }

    // Only active when left hand palm is open (not a fist)
    if (this.lastLeftHandPose !== 'open') {
      this.leftHandLastRoll = null;
      this.leftHandLastPalmY = null;
      return;
    }

    const result = this.handTracker.getLastResult();
    if (!result || result.landmarks.length === 0) {
      this.leftHandLastRoll = null;
      this.leftHandLastPalmY = null;
      return;
    }

    // Find left hand
    let leftHandIndex = -1;
    if (result.handedness) {
      for (let i = 0; i < result.handedness.length; i++) {
        if (result.handedness[i]?.[0]?.categoryName === 'Left') {
          leftHandIndex = i;
          break;
        }
      }
    }

    if (leftHandIndex === -1) {
      this.leftHandLastRoll = null;
      this.leftHandLastPalmY = null;
      return;
    }

    const landmarks = result.landmarks[leftHandIndex];
    const wrist = landmarks[0]; // Wrist
    const indexMCP = landmarks[5]; // Index finger MCP
    const middleMCP = landmarks[9]; // Middle finger MCP
    const pinkyMCP = landmarks[17]; // Pinky MCP

    // Calculate current roll angle (for Y-axis rotation)
    const currentRoll = calculateHandRoll(indexMCP, pinkyMCP);

    // Calculate palm center Y position (for X-axis rotation, matching right hand)
    // Use average of wrist and middle MCP for stable palm center
    const currentPalmY = (wrist.y + middleMCP.y) / 2;

    // If this is the first frame with valid data, initialize smoothed values
    // This prevents wild deltas when tracking starts (smoothed was 0, actual is ~0.5)
    if (this.leftHandLastRoll === null || this.leftHandLastPalmY === null) {
      this.leftHandRollSmoothed = currentRoll;
      this.leftHandPalmYSmoothed = currentPalmY;
      this.leftHandLastRoll = currentRoll;
      this.leftHandLastPalmY = currentPalmY;
      return;
    }

    // Smoothing for jitter reduction (lower = smoother)
    const SMOOTHING = 0.15;
    this.leftHandRollSmoothed =
      this.leftHandRollSmoothed * (1 - SMOOTHING) + currentRoll * SMOOTHING;
    this.leftHandPalmYSmoothed =
      this.leftHandPalmYSmoothed * (1 - SMOOTHING) + currentPalmY * SMOOTHING;

    // Calculate delta from previous frame
    let rollDelta = this.leftHandRollSmoothed - this.leftHandLastRoll;
    const palmYDelta = this.leftHandPalmYSmoothed - this.leftHandLastPalmY;

    // Handle wrap-around at ±π boundary for roll
    if (rollDelta > Math.PI) rollDelta -= 2 * Math.PI;
    if (rollDelta < -Math.PI) rollDelta += 2 * Math.PI;

    // Dead zone to ignore tiny jittery movements
    const ROLL_DEAD_ZONE = 0.008; // ~0.5 degrees for roll
    const POSITION_DEAD_ZONE = 0.003; // Small threshold for position
    const filteredRollDelta =
      Math.abs(rollDelta) < ROLL_DEAD_ZONE ? 0 : rollDelta;
    const filteredPalmYDelta =
      Math.abs(palmYDelta) < POSITION_DEAD_ZONE ? 0 : palmYDelta;

    // Apply rotation to schematic
    // Roll twist -> Y-axis rotation
    const ROLL_SENSITIVITY = 2.0;
    this.schematicTargetRotation.y += filteredRollDelta * ROLL_SENSITIVITY;

    // Palm Y movement -> X-axis rotation (inverted: moving hand up tilts schematic back)
    // Scale similar to right hand: palmYDelta is in normalized coords [0-1]
    const POSITION_SENSITIVITY = 3.0;
    this.schematicTargetRotation.x += filteredPalmYDelta * POSITION_SENSITIVITY;

    // Clamp X rotation to prevent flipping
    this.schematicTargetRotation.x = Math.max(
      -Math.PI / 3,
      Math.min(Math.PI / 3, this.schematicTargetRotation.x)
    );

    // Update last values for next frame
    this.leftHandLastRoll = this.leftHandRollSmoothed;
    this.leftHandLastPalmY = this.leftHandPalmYSmoothed;
  }

  /**
   * Intensify holographic effects during explosion/assembly animation
   * Increases scanline frequency and fresnel glow for cinematic shimmer
   */
  private intensifyHologramEffect(intensify: boolean): void {
    const targetScanlineMultiplier = intensify ? 1.5 : 1.0;
    const targetFresnelMultiplier = intensify ? 1.3 : 1.0;

    for (const mesh of this.schematicShaderMeshes) {
      // Store base values if not already stored
      if (mesh.userData.baseScanlineFreq === undefined) {
        mesh.userData.baseScanlineFreq =
          mesh.material.uniforms.uScanlineFrequency.value;
      }
      if (mesh.userData.baseFresnelPower === undefined) {
        mesh.userData.baseFresnelPower =
          mesh.material.uniforms.uFresnelPower.value;
      }

      // Animate to intensified/normal values
      gsap.to(mesh.material.uniforms.uScanlineFrequency, {
        value: mesh.userData.baseScanlineFreq * targetScanlineMultiplier,
        duration: 0.4,
        ease: 'power2.out',
      });
      gsap.to(mesh.material.uniforms.uFresnelPower, {
        value: mesh.userData.baseFresnelPower * targetFresnelMultiplier,
        duration: 0.4,
        ease: 'power2.out',
      });
    }
  }

  /**
   * Animate ring visibility during explosion/assembly
   * Fades rings out when exploding, back in when assembled
   */
  private animateRingsVisibility(visible: boolean): void {
    if (!this.rings) return;

    this.rings.children.forEach((child: THREE.Object3D) => {
      if (child instanceof THREE.Mesh && child.material) {
        const material = child.material;

        // Store original opacity on first call
        if (child.userData.originalOpacity === undefined) {
          child.userData.originalOpacity =
            material instanceof THREE.ShaderMaterial
              ? material.uniforms?.uOpacity?.value ?? 0.5
              : (material as THREE.MeshBasicMaterial).opacity ?? 0.5;
        }

        const targetOpacity = visible ? child.userData.originalOpacity : 0;
        const duration = visible ? 0.6 : 0.8;
        const ease = visible ? 'power2.out' : 'power2.inOut';

        // Animate shader uniform or basic material opacity
        if (
          material instanceof THREE.ShaderMaterial &&
          material.uniforms?.uOpacity
        ) {
          gsap.to(material.uniforms.uOpacity, {
            value: targetOpacity,
            duration,
            ease,
          });
        } else if ('opacity' in material) {
          gsap.to(material, {
            opacity: targetOpacity,
            duration,
            ease,
          });
        }
      }
    });
  }

  /**
   * Update hand tracking and manipulate schematic based on gestures
   * Supports multiple hands - each hand can independently grab and rotate
   * Only supports body grabs (rotating the whole schematic) as detailed limb manipulation
   * is not supported by the current GLB model.
   */
  private updateHandTracking(deltaTime: number): void {
    const result = this.handTracker.detectHands(performance.now());

    // Update hand landmark overlay (debug visualization)
    this.handLandmarkOverlay?.update(result);

    // Pinch thresholds with hysteresis to prevent false releases during manipulation
    const PINCH_START_THRESHOLD = 0.04;
    const PINCH_RELEASE_THRESHOLD = 0.065;

    // Reset hover states each frame
    let anyHandHovering = false;
    const currentlyHoveredLimbs = new Set<LimbType>();

    // Keep track of detected hand indices to clean up old states
    const detectedHandIndices = new Set<number>();

    if (!result || result.landmarks.length === 0) {
      // No hands detected - reset all hand states
      this.handStates.clear();
      this.updateHoverState(false, deltaTime);
      return;
    }

    // Process each detected hand
    for (let handIndex = 0; handIndex < result.landmarks.length; handIndex++) {
      detectedHandIndices.add(handIndex);
      const landmarks = result.landmarks[handIndex];

      // Check handedness - only RIGHT hand can pinch-to-rotate
      // Left hand is reserved for fist/palm gesture (explode/assemble)
      let isRightHand = false;
      if (result.handedness && result.handedness[handIndex]) {
        isRightHand =
          result.handedness[handIndex]?.[0]?.categoryName === 'Right';
      }

      // Skip pinch-to-rotate processing for left hand
      if (!isRightHand) {
        continue;
      }

      // Key landmarks for manipulation
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const wrist = landmarks[0];
      const indexBase = landmarks[9];

      // Calculate palm center (approximation)
      const palmX = (wrist.x + indexBase.x) / 2;
      const palmY = (wrist.y + indexBase.y) / 2;

      // Convert normalized coordinates to 3D world space
      const handPosition = new THREE.Vector3(
        (0.5 - palmX) * 6,
        (0.5 - palmY) * 4,
        0
      );

      // Calculate pinch distance
      const pinchDistance = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
          Math.pow(thumbTip.y - indexTip.y, 2) +
          Math.pow(thumbTip.z - indexTip.z, 2)
      );

      // Get or create hand state
      let handState = this.handStates.get(handIndex);
      if (!handState) {
        handState = {
          isGrabbing: false,
          grabTarget: null,
          grabbedLimbType: null,
          grabbedLimbMesh: null,
          grabStartHandPosition: null,
          grabStartLimbPosition: null,
          grabStartLimbRotation: null,
          grabStartWristRoll: null,
          lastWristRoll: null,
          smoothedWristRoll: 0,
          grabStartRotation: new THREE.Euler(),
          lastHandPosition: null, // For incremental delta
          lastRaycastTime: 0,
          cachedIntersects: [],
        };
        this.handStates.set(handIndex, handState);
      }

      // Hysteresis calculation
      const isPinching = handState.isGrabbing
        ? pinchDistance < PINCH_RELEASE_THRESHOLD
        : pinchDistance < PINCH_START_THRESHOLD;

      // === INFO PANEL HOVER LOGIC ===
      // Only for Right Hand, and only if NOT grabbing
      // Check specifically for index finger pointing (not pinching)
      if (isRightHand) {
        if (!handState.isGrabbing && !isPinching) {
          // Calculate index finger extension for stability
          // (Similar to left hand open palm check but just for index)
          // Ensure index is extended and not curled
          // const isIndexExtended = true; // TODO: Add better pose check if needed

          // We use the index tip for the raycast origin
          const ndcX = (1 - indexTip.x) * 2 - 1;
          const ndcY = -(indexTip.y * 2 - 1);

          // Raycast specific to info panel (different interval perhaps?)
          // Reuse the existing raycaster
          this.raycaster.setFromCamera(
            new THREE.Vector2(ndcX, ndcY),
            this.camera
          );

          // Raycast against hit volumes
          if (this.schematic) {
            const hitVolumes = this.schematic.userData.hitVolumes as
              | THREE.Mesh[]
              | undefined;

            if (hitVolumes && hitVolumes.length > 0) {
              const intersects = this.raycaster.intersectObjects(
                hitVolumes,
                false
              );

              if (intersects.length > 0) {
                // Found a part!
                const hitObject = intersects[0].object;
                const partName = hitObject.userData.limbType;

                if (partName && this.partInfoPanel) {
                  // Convert intersection point to world space for the panel anchor
                  // The intersection point is already in world space
                  this.partInfoPanel.show(partName, intersects[0].point);
                  anyHandHovering = true; // Keep schematic glow effect too
                }
              } else {
                // No hit, hide panel
                this.partInfoPanel?.hide();
              }
            }
          }
        } else {
          // If pinching or grabbing, hide the panel immediately
          this.partInfoPanel?.hide();
        }
      }

      if (isPinching) {
        if (!handState.isGrabbing) {
          // === GRAB START ===
          if (this.schematic) {
            // Calculate pinch midpoint
            const pinchMidX = (thumbTip.x + indexTip.x) / 2;
            const pinchMidY = (thumbTip.y + indexTip.y) / 2;

            const ndcX = (1 - pinchMidX) * 2 - 1;
            const ndcY = -(pinchMidY * 2 - 1);

            this.raycaster.setFromCamera(
              new THREE.Vector2(ndcX, ndcY),
              this.camera
            );

            // Performance optimization: Raycast against hit volume only (not full model)
            // This avoids expensive recursive triangle intersection tests on complex GLB
            const hitVolumes = this.schematic.userData.hitVolumes as
              | THREE.Mesh[]
              | undefined;
            const hitVolume = this.schematic.userData.hitVolume as
              | THREE.Mesh
              | undefined;

            // Support both new (array) and legacy (single) hit volume structures
            let targets: THREE.Object3D[] = [];
            if (hitVolumes && hitVolumes.length > 0) {
              targets = hitVolumes;
            } else if (hitVolume) {
              targets = [hitVolume];
            }

            const intersects =
              targets.length > 0
                ? this.raycaster.intersectObjects(targets, false)
                : [];

            // Check what we hit
            let foundTarget = false;

            if (intersects.length > 0) {
              // Get the closest intersection
              const intersection = intersects[0];
              const hitObject = intersection.object;
              const userData = hitObject.userData as
                | { isHitVolume?: boolean; limbType?: string }
                | undefined;

              // Check for valid grab target
              if (userData?.isHitVolume === true) {
                // === GRAB START ===
                handState.isGrabbing = true;
                handState.grabStartHandPosition = handPosition.clone();

                // Check if we're in exploded mode - enables limb grabbing
                const isExploded =
                  this.explodedViewManager?.getState() === 'exploded';

                if (isExploded && userData.limbType) {
                  // === EXPLODED MODE: Grab individual limb ===
                  const limbType = userData.limbType as LimbType;
                  const limbMesh =
                    this.explodedViewManager?.getLimbMesh(limbType);

                  if (limbMesh) {
                    handState.grabTarget = 'limb';
                    handState.grabbedLimbType = limbType;
                    handState.grabbedLimbMesh = limbMesh;
                    handState.grabStartLimbPosition = limbMesh.position.clone();
                    handState.grabStartLimbRotation = limbMesh.rotation.clone();

                    // Capture initial wrist roll for rotation tracking
                    const indexMCP = landmarks[5];
                    const pinkyMCP = landmarks[17];
                    const initialRoll = calculateHandRoll(indexMCP, pinkyMCP);
                    handState.grabStartWristRoll = initialRoll;
                    handState.lastWristRoll = initialRoll;
                    handState.smoothedWristRoll = initialRoll;

                    // Pause levitation animation to prevent conflicts
                    this.explodedViewManager?.pauseLevitationForLimb(limbType);

                    console.log(
                      `[WorkshopController] Hand ${handIndex} grabbed limb: ${limbType}`
                    );
                  } else {
                    // Fallback to body rotation if limb mesh not found
                    handState.grabTarget = 'body';
                    handState.grabbedLimbType = null;
                    handState.grabbedLimbMesh = null;
                    handState.grabStartLimbPosition = null;
                    handState.grabStartRotation.copy(this.schematic.rotation);
                    this.rotationVelocity = { x: 0, y: 0 };
                    console.log(
                      `[WorkshopController] Hand ${handIndex} fallback to body (limb mesh not found)`
                    );
                  }
                } else {
                  // === ASSEMBLED MODE: Rotate whole schematic ===
                  handState.grabTarget = 'body';
                  handState.grabbedLimbType = null;
                  handState.grabbedLimbMesh = null;
                  handState.grabStartLimbPosition = null;
                  handState.grabStartRotation.copy(this.schematic.rotation);
                  this.rotationVelocity = { x: 0, y: 0 };

                  console.log(
                    `[WorkshopController] Hand ${handIndex} grabbed body for rotation`
                  );
                }

                foundTarget = true;
                anyHandHovering = true;
              }
            }

            if (foundTarget) {
              anyHandHovering = true;
            }
          }
        } else {
          // === CONTINUE GRABBING ===
          if (
            handState.grabTarget === 'limb' &&
            handState.grabStartHandPosition
          ) {
            // === LIMB MOVEMENT & ROTATION (Exploded Mode) ===
            if (
              handState.grabbedLimbMesh &&
              handState.grabStartLimbPosition &&
              handState.grabStartLimbRotation &&
              handState.grabStartWristRoll !== null
            ) {
              const deltaX = handPosition.x - handState.grabStartHandPosition.x;
              const deltaY = handPosition.y - handState.grabStartHandPosition.y;

              // Move the limb based on hand movement
              // Scale the movement to feel natural (hand movement maps to limb movement)
              const movementScale = 0.5; // Adjust for sensitivity
              handState.grabbedLimbMesh.position.x =
                handState.grabStartLimbPosition.x + deltaX * movementScale;
              handState.grabbedLimbMesh.position.y =
                handState.grabStartLimbPosition.y + deltaY * movementScale;

              // === WRIST TWIST ROTATION ===
              // Calculate current wrist roll and apply to limb rotation
              const indexMCP = landmarks[5];
              const pinkyMCP = landmarks[17];
              const currentRoll = calculateHandRoll(indexMCP, pinkyMCP);

              // Smooth the roll value to reduce jitter
              const ROLL_SMOOTHING = 0.25;
              handState.smoothedWristRoll =
                handState.smoothedWristRoll * (1 - ROLL_SMOOTHING) +
                currentRoll * ROLL_SMOOTHING;

              // Calculate roll delta from initial grab position
              let rollDelta =
                handState.smoothedWristRoll - handState.grabStartWristRoll;

              // Handle wrap-around at ±π boundary
              if (rollDelta > Math.PI) rollDelta -= 2 * Math.PI;
              if (rollDelta < -Math.PI) rollDelta += 2 * Math.PI;

              // Apply roll to limb Y-axis rotation (twist around vertical axis)
              // Sensitivity: how much wrist twist translates to limb rotation
              const ROTATION_SENSITIVITY = 2.5;
              handState.grabbedLimbMesh.rotation.y =
                handState.grabStartLimbRotation.y +
                rollDelta * ROTATION_SENSITIVITY;

              // Update last roll for next frame
              handState.lastWristRoll = handState.smoothedWristRoll;
            }
          } else if (
            handState.grabTarget === 'body' &&
            handState.grabStartHandPosition
          ) {
            const deltaX = handPosition.x - handState.grabStartHandPosition.x;
            const deltaY = handPosition.y - handState.grabStartHandPosition.y;

            // === BODY ROTATION ===
            // Save previous target to calculate instantaneous velocity
            const prevTargetX = this.schematicTargetRotation.x;
            const prevTargetY = this.schematicTargetRotation.y;

            // Map hand movement to rotation
            this.schematicTargetRotation.y =
              handState.grabStartRotation.y + deltaX * 2;
            this.schematicTargetRotation.x =
              handState.grabStartRotation.x - deltaY * 1.5;

            // Clamp X rotation to prevent flipping
            this.schematicTargetRotation.x = Math.max(
              -Math.PI / 3,
              Math.min(Math.PI / 3, this.schematicTargetRotation.x)
            );

            // Calculate velocity (change in rotation per second)
            if (deltaTime > 0) {
              const currentVelX =
                (this.schematicTargetRotation.x - prevTargetX) / deltaTime;
              const currentVelY =
                (this.schematicTargetRotation.y - prevTargetY) / deltaTime;

              // Smooth velocity slightly
              this.rotationVelocity.x =
                this.rotationVelocity.x * 0.7 + currentVelX * 0.3;
              this.rotationVelocity.y =
                this.rotationVelocity.y * 0.7 + currentVelY * 0.3;
            }
          }
        }
      } else {
        // Not pinching - release grab
        // Resume levitation if we were grabbing a limb
        if (handState.grabTarget === 'limb' && handState.grabbedLimbType) {
          this.explodedViewManager?.resumeLevitation();
        }

        handState.isGrabbing = false;
        handState.grabTarget = null;
        handState.grabbedLimbType = null;
        handState.grabbedLimbMesh = null;
        handState.grabStartHandPosition = null;
        handState.grabStartLimbPosition = null;
        handState.grabStartLimbRotation = null;
        handState.grabStartWristRoll = null;
        handState.lastWristRoll = null;

        // Check for hover
        if (this.schematic) {
          const ndcX = (1 - indexTip.x) * 2 - 1;
          const ndcY = -(indexTip.y * 2 - 1);

          // Simple throttle for hover raycast
          const now = performance.now();
          if (now - handState.lastRaycastTime > this.RAYCAST_INTERVAL_MS) {
            this.raycaster.setFromCamera(
              new THREE.Vector2(ndcX, ndcY),
              this.camera
            );

            // Performance optimization: Raycast against hit volumes
            const hitVolumes = this.schematic.userData.hitVolumes as
              | THREE.Mesh[]
              | undefined;
            const hitVolume = this.schematic.userData.hitVolume as
              | THREE.Mesh
              | undefined;

            let targets: THREE.Object3D[] = [];
            if (hitVolumes && hitVolumes.length > 0) {
              targets = hitVolumes;
            } else if (hitVolume) {
              targets = [hitVolume];
            }

            handState.cachedIntersects =
              targets.length > 0
                ? this.raycaster.intersectObjects(targets, false)
                : [];

            handState.lastRaycastTime = now;
          }

          if (handState.cachedIntersects.length > 0) {
            // Check if any intersection is with a valid hit volume and collect hovered limbs
            for (const intersection of handState.cachedIntersects) {
              const hitObject = intersection.object;
              const userData = hitObject.userData as
                | { isHitVolume?: boolean; limbType?: string }
                | undefined;
              if (userData?.isHitVolume === true) {
                anyHandHovering = true;
                // Track which specific limb is being hovered
                if (userData.limbType) {
                  currentlyHoveredLimbs.add(userData.limbType as LimbType);
                }
              }
            }
          }
        }
      }
    }

    // Clean up states for hands no longer detected
    for (const [handIndex] of this.handStates) {
      if (!detectedHandIndices.has(handIndex)) {
        this.handStates.delete(handIndex);
      }
    }

    // Update tracked hovered limbs
    this.hoveredLimbTypes = currentlyHoveredLimbs;

    // Update hover visual state
    this.updateHoverState(anyHandHovering, deltaTime);
  }

  /**
   * Update hover visual feedback on schematic (Body)
   * Smoothly interpolates glow intensity for premium feel
   *
   * Behavior differs based on exploded state:
   * - Assembled: Scale the entire schematic as one unit
   * - Exploded: Scale only the individually hovered limb(s)
   */
  private updateHoverState(isHovering: boolean, deltaTime: number): void {
    this.isHoveringSchematic = isHovering;

    const transitionSpeed = 8; // Higher = faster transition
    const isExploded = this.explodedViewManager?.getState() === 'exploded';

    // Update per-limb hover intensities
    const allLimbs: LimbType[] = [
      'head',
      'torso',
      'arm_left',
      'arm_right',
      'leg_left',
      'leg_right',
    ];
    for (const limbType of allLimbs) {
      const targetLimbIntensity = this.hoveredLimbTypes.has(limbType) ? 1 : 0;
      const currentIntensity = this.limbHoverIntensities.get(limbType) ?? 0;
      const newIntensity =
        currentIntensity +
        (targetLimbIntensity - currentIntensity) * transitionSpeed * deltaTime;
      this.limbHoverIntensities.set(limbType, newIntensity);
    }

    // Smooth transition for global hover intensity
    const targetIntensity = isHovering ? 1 : 0;
    this.hoverIntensity +=
      (targetIntensity - this.hoverIntensity) * transitionSpeed * deltaTime;

    // Define colors for hover effect
    const BASE_COLOR = new THREE.Color(0x00ff88); // Original Green-cyan
    const HOVER_COLOR = new THREE.Color(0xffbf00); // Amber

    // Apply visual feedback to schematic
    if (this.schematic) {
      const baseScale = this.schematic.userData.initialScale || 15.0; // Default if not set

      if (isExploded) {
        // === EXPLODED STATE: Per-limb scaling ===
        // Keep schematic group at base scale
        this.schematic.scale.setScalar(baseScale);

        // Apply scale to individual limb meshes
        this.schematic.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            allLimbs.includes(child.name as LimbType)
          ) {
            const limbType = child.name as LimbType;
            const limbIntensity = this.limbHoverIntensities.get(limbType) ?? 0;

            // Store original scale if not already stored
            if (child.userData.originalLimbScale === undefined) {
              child.userData.originalLimbScale = child.scale.x;
            }
            const originalScale = child.userData.originalLimbScale as number;

            if (limbIntensity > 0.01) {
              // Scale up the hovered limb
              const hoverScale = 1 + limbIntensity * 0.08;
              child.scale.setScalar(originalScale * hoverScale);
            } else {
              // Reset to original scale
              child.scale.setScalar(originalScale);
            }
          }
        });

        // Update shader opacity and color for hovered limbs
        for (const mesh of this.schematicShaderMeshes) {
          if (
            mesh.material.uniforms.uOpacity &&
            mesh.material.uniforms.uColor
          ) {
            const baseOpacity = mesh.userData.baseOpacity ?? 0.4;
            // Check if this mesh is a hovered limb
            const meshLimbType = mesh.name as LimbType;
            const limbIntensity = allLimbs.includes(meshLimbType)
              ? this.limbHoverIntensities.get(meshLimbType) ?? 0
              : 0;

            mesh.material.uniforms.uOpacity.value =
              baseOpacity + limbIntensity * 0.15;

            // Apply Amber color when hovered (intensity > 0.5 for clear switch)
            if (limbIntensity > 0.1) {
              // Lerp towards amber based on intensity
              mesh.material.uniforms.uColor.value.lerpColors(
                BASE_COLOR,
                HOVER_COLOR,
                limbIntensity
              );
            } else {
              mesh.material.uniforms.uColor.value.copy(BASE_COLOR);
            }
          }
        }
      } else {
        // === ASSEMBLED STATE: Whole schematic scaling ===
        // Reset individual limb scales to original
        this.schematic.traverse((child) => {
          if (
            child instanceof THREE.Mesh &&
            child.userData.originalLimbScale !== undefined
          ) {
            child.scale.setScalar(child.userData.originalLimbScale as number);
          }
        });

        if (this.hoverIntensity > 0.01) {
          // Scale up the whole schematic when hovered
          const hoverScale = 1 + this.hoverIntensity * 0.08;
          this.schematic.scale.setScalar(baseScale * hoverScale);

          // Performance optimization: Use cached meshes instead of traverse()
          for (const mesh of this.schematicShaderMeshes) {
            // Boost opacity for hover feedback
            if (
              mesh.material.uniforms.uOpacity &&
              mesh.material.uniforms.uColor
            ) {
              const baseOpacity = mesh.userData.baseOpacity ?? 0.4;
              mesh.material.uniforms.uOpacity.value =
                baseOpacity + this.hoverIntensity * 0.15;

              // Key change: Check if THIS specific limb is being hovered
              // Even in assembled state, we want ONLY the hovered part to glow Amber
              const meshLimbType = mesh.name as LimbType;
              const limbIntensity = allLimbs.includes(meshLimbType)
                ? this.limbHoverIntensities.get(meshLimbType) ?? 0
                : 0;

              if (limbIntensity > 0.1) {
                mesh.material.uniforms.uColor.value.lerpColors(
                  BASE_COLOR,
                  HOVER_COLOR,
                  limbIntensity
                );
              } else {
                mesh.material.uniforms.uColor.value.copy(BASE_COLOR);
              }
            }
          }
        } else {
          // Check if we fully settled to avoid constant updates
          const scaleDiff = Math.abs(this.schematic.scale.x - baseScale);
          if (scaleDiff > 0.001) {
            // Reset to base state
            this.schematic.scale.setScalar(baseScale);

            // Performance optimization: Use cached meshes instead of traverse()
            for (const mesh of this.schematicShaderMeshes) {
              if (
                mesh.material.uniforms.uOpacity &&
                mesh.material.uniforms.uColor
              ) {
                const baseOpacity = mesh.userData.baseOpacity ?? 0.4;
                mesh.material.uniforms.uOpacity.value = baseOpacity;
                mesh.material.uniforms.uColor.value.copy(BASE_COLOR);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Handle window resize
   */
  private handleResize(): void {
    const width = window.innerWidth;
    const height = window.innerHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  /**
   * Update FPS counter
   */
  private updateFps(timestamp: number): void {
    this.fpsFrames++;
    const elapsed = timestamp - this.fpsLastTime;

    if (elapsed >= 1000) {
      this.currentFps = (this.fpsFrames * 1000) / elapsed;
      this.fpsFrames = 0;
      this.fpsLastTime = timestamp;
    }
  }

  /**
   * Get debug information
   */
  private getDebugInfo(): WorkshopDebugInfo {
    let activeElements = 0;
    if (this.grid) activeElements++;
    if (this.rings) activeElements += this.rings.children.length;
    if (this.panels) activeElements += this.panels.children.length;
    if (this.schematic) activeElements++;

    // Check if any hand is currently grabbing and what it's grabbing
    let anyHandGrabbing = false;
    let grabTargetStr: string | null = null;

    for (const [, state] of this.handStates) {
      if (state.isGrabbing) {
        anyHandGrabbing = true;
        if (state.grabTarget === 'body') {
          grabTargetStr = 'body';
        }
        break;
      }
    }

    return {
      fps: this.currentFps,
      handsDetected: this.getHandCount(),
      activeElements,
      bloomEnabled: true,
      isGrabbing: anyHandGrabbing,
      isHovering: this.isHoveringSchematic,
      grabTarget: grabTargetStr,
    };
  }

  /**
   * Get current hand count
   */
  getHandCount(): number {
    const result = this.handTracker.detectHands(performance.now());
    return result?.landmarks?.length ?? 0;
  }

  /**
   * Enable debug mode
   */
  enableDebug(callback: (info: WorkshopDebugInfo) => void): void {
    this.debugCallback = callback;
    this.handLandmarkOverlay?.setEnabled(true);
  }

  /**
   * Disable debug mode
   */
  disableDebug(): void {
    this.debugCallback = null;
    this.handLandmarkOverlay?.setEnabled(false);
  }

  /**
   * Reset the holographic display to original pose
   * Resets body rotation only
   */
  reset(): void {
    if (this.schematic) {
      // Set body target rotation to original orientation (facing camera)
      this.schematicTargetRotation.set(0, -Math.PI / 2, 0);

      // Stop any inertia so the schematic smoothly decelerates to rest
      this.rotationVelocity = { x: 0, y: 0 };

      // Stop any reset animation
      // this.isResetting = false;

      console.log('[WorkshopController] Animating reset to original pose');
    }
  }

  /**
   * Clean up and dispose resources
   */
  dispose(): void {
    // Dispose exploded view system
    this.explodedViewManager?.dispose();
    this.explodedViewManager = null;

    // Dispose particle trail system
    this.particleTrailSystem?.dispose();
    this.particleTrailSystem = null;

    // Dispose hand landmark overlay
    this.handLandmarkOverlay?.dispose();
    this.handLandmarkOverlay = null;
    this.stop();

    // Remove event listener
    window.removeEventListener('resize', this.handleResize);

    // Dispose Three.js objects
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        if (Array.isArray(object.material)) {
          object.material.forEach((m) => m.dispose());
        } else {
          object.material.dispose();
        }
      }
      if (object instanceof THREE.Line) {
        object.geometry.dispose();
        if (object.material instanceof THREE.Material) {
          object.material.dispose();
        }
      }
    });

    // Dispose composer
    this.composer.dispose();

    // Dispose renderer
    this.renderer.dispose();

    // Remove from DOM
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    console.log('[WorkshopController] Disposed');
  }
}
