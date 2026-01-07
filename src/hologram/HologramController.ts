/**
 * HologramController
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
  HologramConfig,
  HologramDebugInfo,
  DEFAULT_HOLOGRAM_CONFIG,
  LimbAxis,
  LimbSide,
  GrabTarget,
  LimbUserData,
} from './types';

// Components
import { createHologramGrid } from './components/HologramGrid';
import {
  createHologramRings,
  updateHologramRings,
} from './components/HologramRings';
import {
  createHologramPanels,
  updateHologramPanels,
} from './components/HologramPanels';
import {
  createHologramSchematic,
  updateHologramSchematic,
} from './components/HologramSchematic';
import { HandLandmarkOverlay } from './components/HandLandmarkOverlay';

/**
 * HologramController - Main controller for holographic mode
 */
export class HologramController {
  private handTracker: HandTracker;
  private container: HTMLElement;
  private config: HologramConfig;

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

  // Debug overlay for hand tracking visualization
  private handLandmarkOverlay: HandLandmarkOverlay | null = null;

  // Animation
  private animationFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private isRunning: boolean = false;

  // Debug
  private debugCallback: ((info: HologramDebugInfo) => void) | null = null;
  private fpsFrames: number = 0;
  private fpsLastTime: number = 0;
  private currentFps: number = 0;

  // Hand tracking state (per hand)
  private handStates: Map<
    number,
    {
      isGrabbing: boolean;
      grabTarget: GrabTarget | null;
      grabbedLimbPivot: THREE.Group | null;
      limbAxis: LimbAxis | null;
      limbSide: LimbSide | null; // Track which side for direction
      grabStartHandPosition: THREE.Vector3 | null;
      grabStartRotation: THREE.Euler;
      lastHandPosition: THREE.Vector3 | null; // For incremental delta
      // Per-hand raycast throttling state
      lastRaycastTime: number;
      cachedIntersects: THREE.Intersection[];
    }
  > = new Map();
  private schematicTargetRotation: THREE.Euler = new THREE.Euler();

  // Hover state for visual feedback
  private isHoveringSchematic: boolean = false;
  private hoverIntensity: number = 0; // 0-1, used for smooth glow transition

  // Limb hover state (per-limb tracking for multi-hand support)
  private limbHighlightStates: Map<THREE.Mesh, { intensity: number }> =
    new Map();

  // Inertia state
  private rotationVelocity: { x: number; y: number } = { x: 0, y: 0 };

  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  // Reset animation state
  private isResetting: boolean = false;
  private resettingLimbPivots: Map<THREE.Group, THREE.Euler> = new Map(); // Maps pivot to target rotation

  // Performance optimization: Raycaster throttling
  private readonly RAYCAST_INTERVAL_MS: number = 100; // 10Hz raycasting

  // Performance optimization: Cached schematic shader meshes
  private schematicShaderMeshes: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >[] = [];

  constructor(
    handTracker: HandTracker,
    container: HTMLElement,
    config: Partial<HologramConfig> = {}
  ) {
    this.handTracker = handTracker;
    this.container = container;
    this.config = { ...DEFAULT_HOLOGRAM_CONFIG, ...config };

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
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

    console.log('[HologramController] Initialized with 30Hz hand detection');
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
    this.grid = createHologramGrid({
      color: primaryColor,
      size: 12,
      divisions: 24,
      opacity: 0.25,
    });
    this.scene.add(this.grid);

    // Rotating rings
    this.rings = createHologramRings({
      color: primaryColor,
      innerRadius: 1.8,
      outerRadius: 2.0,
    });
    this.rings.position.y = 0;
    this.scene.add(this.rings);

    // Floating panels
    this.panels = createHologramPanels({
      color: primaryColor,
      width: 1.8,
      height: 1.2,
    });
    this.scene.add(this.panels);

    // Central schematic
    this.schematic = createHologramSchematic({
      color: secondaryColor,
      scale: 1.2,
    });
    this.schematic.position.y = 0;
    this.scene.add(this.schematic);

    // Performance optimization: Cache all shader meshes for fast iteration
    // Avoids repeated traverse() calls in render loop
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

    console.log('[HologramController] Started');
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

    console.log('[HologramController] Stopped');
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
      updateHologramRings(this.rings, deltaTime, time);
    }

    // Update panels animation
    if (this.panels) {
      updateHologramPanels(this.panels, time);
    }

    // Update schematic animation
    if (this.schematic) {
      updateHologramSchematic(this.schematic, time, deltaTime);
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

    // Animate limb pivots that are resetting back to rest position
    if (this.isResetting && this.resettingLimbPivots.size > 0) {
      const LIMB_RESET_SPEED = 0.06; // Same smoothing factor as body
      const RESET_THRESHOLD = 0.001;
      const completedPivots: THREE.Group[] = [];

      for (const [pivot, targetRotation] of this.resettingLimbPivots) {
        // Interpolate toward target
        pivot.rotation.x +=
          (targetRotation.x - pivot.rotation.x) * LIMB_RESET_SPEED;
        pivot.rotation.y +=
          (targetRotation.y - pivot.rotation.y) * LIMB_RESET_SPEED;
        pivot.rotation.z +=
          (targetRotation.z - pivot.rotation.z) * LIMB_RESET_SPEED;

        // Check if close enough to target
        const dx = Math.abs(pivot.rotation.x - targetRotation.x);
        const dy = Math.abs(pivot.rotation.y - targetRotation.y);
        const dz = Math.abs(pivot.rotation.z - targetRotation.z);

        if (
          dx < RESET_THRESHOLD &&
          dy < RESET_THRESHOLD &&
          dz < RESET_THRESHOLD
        ) {
          // Snap to exact target and mark as complete
          pivot.rotation.copy(targetRotation);
          completedPivots.push(pivot);
        }
      }

      // Remove completed pivots from tracking
      for (const pivot of completedPivots) {
        this.resettingLimbPivots.delete(pivot);
      }

      // Check if all limbs finished resetting
      if (this.resettingLimbPivots.size === 0) {
        this.isResetting = false;
      }
    }
  }

  /**
   * Update hand tracking and manipulate schematic based on gestures
   * Supports multiple hands - each hand can independently grab and rotate
   * Limb grabs move individual limbs; body grabs rotate the whole schematic
   */
  private updateHandTracking(deltaTime: number): void {
    const result = this.handTracker.detectHands(performance.now());

    // Update hand landmark overlay (debug visualization)
    this.handLandmarkOverlay?.update(result);

    // Pinch thresholds with hysteresis to prevent false releases during manipulation
    // - PINCH_START_THRESHOLD: Distance to START a pinch (strict)
    // - PINCH_RELEASE_THRESHOLD: Distance to END a pinch (lenient, 63% higher)
    // This creates a "buffer zone" where the pinch stays active during natural hand movement
    const PINCH_START_THRESHOLD = 0.04;
    const PINCH_RELEASE_THRESHOLD = 0.065;

    // Leg rotation constraints
    const LEG_ROTATION_MIN = -Math.PI / 4; // -45 degrees
    const LEG_ROTATION_MAX = Math.PI / 4; // +45 degrees

    // Track which hands are currently detected
    const detectedHandIndices = new Set<number>();

    // Reset hover states each frame
    let anyHandHovering = false;
    const currentlyHoveredLimbs = new Set<THREE.Mesh>();
    const currentlyGrabbedLimbMeshes: Set<THREE.Mesh> = new Set();

    if (!result || result.landmarks.length === 0) {
      // No hands detected - reset all hand states
      this.handStates.clear();
      this.updateHoverState(false, deltaTime);
      this.updateLimbHighlights(new Set(), deltaTime);
      return;
    }

    // Process each detected hand
    for (let handIndex = 0; handIndex < result.landmarks.length; handIndex++) {
      detectedHandIndices.add(handIndex);
      const landmarks = result.landmarks[handIndex];

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
          grabbedLimbPivot: null,
          limbAxis: null,
          limbSide: null,
          grabStartHandPosition: null,
          grabStartRotation: new THREE.Euler(),
          lastHandPosition: null,
          lastRaycastTime: 0,
          cachedIntersects: [],
        };
        this.handStates.set(handIndex, handState);
      }

      // Hysteresis: use stricter threshold for starting, lenient for releasing
      // This prevents false releases when finger distance momentarily increases during manipulation
      const isPinching = handState.isGrabbing
        ? pinchDistance < PINCH_RELEASE_THRESHOLD // Already grabbing: use lenient threshold
        : pinchDistance < PINCH_START_THRESHOLD; // Not grabbing: use strict threshold

      if (isPinching) {
        if (!handState.isGrabbing) {
          // === GRAB START: Determine what was hit ===
          if (this.schematic) {
            // Calculate pinch midpoint (between thumb and index tips)
            const pinchMidX = (thumbTip.x + indexTip.x) / 2;
            const pinchMidY = (thumbTip.y + indexTip.y) / 2;

            // Convert normalized screen coordinates (0-1) to NDC (-1 to +1)
            // x is mirrored because webcam is horizontally flipped
            const ndcX = (1 - pinchMidX) * 2 - 1;
            const ndcY = -(pinchMidY * 2 - 1);

            this.raycaster.setFromCamera(
              new THREE.Vector2(ndcX, ndcY),
              this.camera
            );

            // Check intersection with schematic (including all children)
            const intersects = this.raycaster.intersectObject(
              this.schematic,
              true
            );

            if (intersects.length > 0) {
              // Iterate through all intersections to find what was hit
              // Priority: 1) Limb grab, 2) Body grab (explicit body parts only)
              let foundTarget = false;
              for (const intersection of intersects) {
                const hitObject = intersection.object;
                const userData = hitObject.userData as
                  | (LimbUserData & { isHitVolume?: boolean })
                  | undefined;

                // Check if we hit a limb (has limbType in userData)
                if (userData?.limbType && hitObject.parent) {
                  // === LIMB GRAB ===
                  // The parent is the pivot group
                  const limbPivot = hitObject.parent as THREE.Group;

                  handState.isGrabbing = true;
                  handState.grabTarget = 'limb';
                  handState.grabbedLimbPivot = limbPivot;
                  handState.limbAxis = userData.axis;
                  handState.limbSide = userData.limbSide;
                  handState.grabStartHandPosition = handPosition.clone();
                  handState.grabStartRotation.copy(limbPivot.rotation);
                  handState.lastHandPosition = handPosition.clone();

                  // Find and set the visible mesh for hover highlighting during grab
                  limbPivot.traverse((child) => {
                    if (
                      child instanceof THREE.Mesh &&
                      child.material instanceof THREE.ShaderMaterial
                    ) {
                      currentlyGrabbedLimbMeshes.add(child);
                    }
                  });

                  console.log(
                    `[HologramController] Hand ${handIndex} grabbed ${userData.limbSide} ${userData.limbType} (${userData.axis} axis)`
                  );
                  foundTarget = true;
                  break; // Stop searching once we find a limb
                }

                // Check if we hit a body part (main hit volume or body mesh)
                // Body parts: isHitVolume=true without limbType, or direct child meshes (torso, head)
                const isBodyHitVolume =
                  userData?.isHitVolume === true && !userData?.limbType;
                const isBodyMesh =
                  hitObject instanceof THREE.Mesh &&
                  hitObject.parent === this.schematic &&
                  !userData?.limbType;

                if (isBodyHitVolume || isBodyMesh) {
                  // === BODY GRAB (explicit body part hit) ===
                  handState.isGrabbing = true;
                  handState.grabTarget = 'body';
                  handState.grabbedLimbPivot = null;
                  handState.limbAxis = null;
                  handState.grabStartHandPosition = handPosition.clone();
                  handState.grabStartRotation.copy(this.schematic.rotation);
                  // Reset velocity on new grab
                  this.rotationVelocity = { x: 0, y: 0 };

                  console.log(
                    `[HologramController] Hand ${handIndex} grabbed body`
                  );
                  foundTarget = true;
                  anyHandHovering = true;
                  break;
                }
              }

              if (foundTarget) {
                anyHandHovering = true;
              }
            }
          }
        } else {
          // === CONTINUE GRABBING ===
          if (handState.grabStartHandPosition) {
            const deltaX = handPosition.x - handState.grabStartHandPosition.x;
            const deltaY = handPosition.y - handState.grabStartHandPosition.y;

            if (handState.grabTarget === 'limb' && handState.grabbedLimbPivot) {
              // === LIMB MANIPULATION (incremental delta with smoothing) ===
              const lastPos = handState.lastHandPosition ?? handPosition;
              const deltaX = handPosition.x - lastPos.x;
              const deltaY = handPosition.y - lastPos.y;
              handState.lastHandPosition = handPosition.clone();

              const currentRotation = handState.grabbedLimbPivot.rotation.z;
              let targetRotation = currentRotation;

              if (handState.limbAxis === 'vertical') {
                // Arms: up/down movement controls rotation around Z axis
                // Left arm: negative rotation = outward (away from body)
                // Right arm: positive rotation = outward (mirror)
                const ARM_SENSITIVITY = 3.0;
                const directionMultiplier =
                  handState.limbSide === 'right' ? 1 : -1;
                targetRotation =
                  currentRotation +
                  directionMultiplier * deltaY * ARM_SENSITIVITY;

                // Per-arm clamping for symmetric behavior:
                // Left arm: rotates negative to raise outward (-120°), positive to go inward (+30°)
                // Right arm: rotates positive to raise outward (+120°), negative to go inward (-30°)
                const ARM_OUTWARD_MAX = (2 * Math.PI) / 3; // 120 degrees outward
                const ARM_INWARD_MAX = Math.PI / 6; // 30 degrees inward (crossing body)

                if (handState.limbSide === 'left') {
                  // Left arm: outward is negative, inward is positive
                  targetRotation = THREE.MathUtils.clamp(
                    targetRotation,
                    -ARM_OUTWARD_MAX, // -120° (raised outward)
                    ARM_INWARD_MAX // +30° (inward)
                  );
                } else {
                  // Right arm: outward is positive, inward is negative
                  targetRotation = THREE.MathUtils.clamp(
                    targetRotation,
                    -ARM_INWARD_MAX, // -30° (inward)
                    ARM_OUTWARD_MAX // +120° (raised outward)
                  );
                }
              } else if (handState.limbAxis === 'horizontal') {
                // Legs: left/right movement controls rotation around Z axis
                const LEG_SENSITIVITY = 2.5;
                targetRotation = currentRotation + deltaX * LEG_SENSITIVITY;
                targetRotation = THREE.MathUtils.clamp(
                  targetRotation,
                  LEG_ROTATION_MIN,
                  LEG_ROTATION_MAX
                );
              }

              // Apply smoothing for stable, jitter-free rotation
              const LIMB_SMOOTHING = 0.25;
              handState.grabbedLimbPivot.rotation.z +=
                (targetRotation - handState.grabbedLimbPivot.rotation.z) *
                LIMB_SMOOTHING;

              // Keep the limb highlighted while being grabbed
              handState.grabbedLimbPivot.traverse((child) => {
                if (
                  child instanceof THREE.Mesh &&
                  child.material instanceof THREE.ShaderMaterial
                ) {
                  currentlyGrabbedLimbMeshes.add(child);
                }
              });
            } else if (handState.grabTarget === 'body') {
              // === BODY ROTATION (existing logic) ===
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

                // Smooth velocity slightly to reduce jitter
                this.rotationVelocity.x =
                  this.rotationVelocity.x * 0.7 + currentVelX * 0.3;
                this.rotationVelocity.y =
                  this.rotationVelocity.y * 0.7 + currentVelY * 0.3;
              }
            }
          }
        }
      } else {
        // Not pinching - check for hover (pre-pinch visual feedback)
        if (this.schematic) {
          // Use index finger tip for hover detection
          const ndcX = (1 - indexTip.x) * 2 - 1;
          const ndcY = -(indexTip.y * 2 - 1);

          // Performance optimization: Throttle raycasting to 10Hz
          // Raycast results change slowly relative to 60Hz render loop
          const now = performance.now();
          if (now - handState.lastRaycastTime >= this.RAYCAST_INTERVAL_MS) {
            this.raycaster.setFromCamera(
              new THREE.Vector2(ndcX, ndcY),
              this.camera
            );
            handState.cachedIntersects = this.raycaster.intersectObject(
              this.schematic,
              true
            );
            handState.lastRaycastTime = now;
          }

          if (handState.cachedIntersects.length > 0) {
            // Check if we're hovering a limb or body
            for (const intersection of handState.cachedIntersects) {
              const hitObject = intersection.object;
              const userData = hitObject.userData as
                | (LimbUserData & { isHitVolume?: boolean })
                | undefined;

              if (userData?.limbType && hitObject.parent) {
                // Found a limb!
                // Find visible mesh in the pivot group to apply glow
                // The hit object might be the invisible hit volume
                const limbPivot = hitObject.parent as THREE.Group;

                // Look for the mesh with ShaderMaterial (the visible limb)
                limbPivot.traverse((child) => {
                  if (
                    child instanceof THREE.Mesh &&
                    child.material instanceof THREE.ShaderMaterial
                  ) {
                    currentlyHoveredLimbs.add(child);
                  }
                });

                break; // Prioritize limb hover
              }

              // Check if we hit a body part (main hit volume or body mesh)
              const isBodyHitVolume =
                userData?.isHitVolume === true && !userData?.limbType;
              const isBodyMesh =
                hitObject instanceof THREE.Mesh &&
                hitObject.parent === this.schematic &&
                !userData?.limbType;

              if (isBodyHitVolume || isBodyMesh) {
                // Hovering over body - trigger body glow
                anyHandHovering = true;
                break;
              }
            }
          }
        }

        // Reset grab state if was grabbing
        if (handState.isGrabbing) {
          console.log(`[HologramController] Hand ${handIndex} grab released`);
          handState.isGrabbing = false;
          handState.grabTarget = null;
          handState.grabbedLimbPivot = null;
          handState.limbAxis = null;
          handState.limbSide = null;
          handState.grabStartHandPosition = null;
          handState.lastHandPosition = null;
        }
      }
    }

    // Clean up states for hands no longer detected
    for (const [handIndex] of this.handStates) {
      if (!detectedHandIndices.has(handIndex)) {
        this.handStates.delete(handIndex);
      }
    }

    // Update hover visual state
    this.updateHoverState(anyHandHovering, deltaTime);

    // Combine grabbed limbs and hovered limbs for highlighting
    const limbsToHighlight = new Set(currentlyGrabbedLimbMeshes);
    for (const limb of currentlyHoveredLimbs) {
      limbsToHighlight.add(limb);
    }
    this.updateLimbHighlights(limbsToHighlight, deltaTime);
  }

  /**
   * Update hover visual feedback on schematic (Body)
   * Smoothly interpolates glow intensity for premium feel
   */
  private updateHoverState(isHovering: boolean, deltaTime: number): void {
    this.isHoveringSchematic = isHovering;

    // Smooth transition for hover intensity
    const targetIntensity = isHovering ? 1 : 0;
    const transitionSpeed = 8; // Higher = faster transition
    this.hoverIntensity +=
      (targetIntensity - this.hoverIntensity) * transitionSpeed * deltaTime;

    // Apply visual feedback to schematic
    if (this.schematic) {
      if (this.hoverIntensity > 0.01) {
        // Scale up slightly when hovered
        const hoverScale = 1 + this.hoverIntensity * 0.08;
        const baseScale = 1.2;
        this.schematic.scale.setScalar(baseScale * hoverScale);

        // Performance optimization: Use cached meshes instead of traverse()
        for (const mesh of this.schematicShaderMeshes) {
          // Boost opacity for hover feedback
          if (mesh.material.uniforms.uOpacity) {
            const baseOpacity = mesh.userData.baseOpacity ?? 0.4;
            mesh.material.uniforms.uOpacity.value =
              baseOpacity + this.hoverIntensity * 0.15;
          }
        }
      } else {
        // Check if we fully settled to avoid constant updates
        const scaleDiff = Math.abs(this.schematic.scale.x - 1.2);
        if (scaleDiff > 0.001) {
          // Reset to base state
          const baseScale = 1.2;
          this.schematic.scale.setScalar(baseScale);

          // Performance optimization: Use cached meshes instead of traverse()
          for (const mesh of this.schematicShaderMeshes) {
            if (mesh.material.uniforms.uOpacity) {
              const baseOpacity = mesh.userData.baseOpacity ?? 0.4;
              mesh.material.uniforms.uOpacity.value = baseOpacity;
            }
          }
        }
      }
    }
  }

  /**
   * Update hover visual feedback on specific limbs (supports multiple concurrent limbs)
   */
  private updateLimbHighlights(
    limbsToHighlight: Set<THREE.Mesh>,
    deltaTime: number
  ): void {
    const HOVER_COLOR = new THREE.Color(0xffab00); // Amber
    const TRANSITION_SPEED = 10; // Faster than body hover for snappier feedback
    const baseColor = new THREE.Color(this.config.secondaryColor);

    // Update intensity for limbs that SHOULD be highlighted
    for (const limb of limbsToHighlight) {
      if (!(limb.material instanceof THREE.ShaderMaterial)) continue;

      let state = this.limbHighlightStates.get(limb);
      if (!state) {
        state = { intensity: 0 };
        this.limbHighlightStates.set(limb, state);
      }

      // Animate towards full intensity
      state.intensity += (1 - state.intensity) * TRANSITION_SPEED * deltaTime;

      // Apply visual effect
      const baseOpacity = limb.userData.baseOpacity ?? 0.4;
      limb.material.uniforms.uOpacity.value =
        baseOpacity + state.intensity * 0.1;
      const currentColor = baseColor.clone().lerp(HOVER_COLOR, state.intensity);
      limb.material.uniforms.uColor.value.copy(currentColor);
    }

    // Fade out limbs that should NO LONGER be highlighted
    const limbsToRemove: THREE.Mesh[] = [];
    for (const [limb, state] of this.limbHighlightStates) {
      if (limbsToHighlight.has(limb)) continue; // Still active, skip
      if (!(limb.material instanceof THREE.ShaderMaterial)) {
        limbsToRemove.push(limb);
        continue;
      }

      // Animate towards zero intensity
      state.intensity += (0 - state.intensity) * TRANSITION_SPEED * deltaTime;

      if (state.intensity < 0.01) {
        // Fully faded, reset to original and remove from tracking
        const baseOpacity = limb.userData.baseOpacity ?? 0.4;
        limb.material.uniforms.uOpacity.value = baseOpacity;
        limb.material.uniforms.uColor.value.copy(baseColor);
        limbsToRemove.push(limb);
      } else {
        // Still fading, apply intermediate state
        const baseOpacity = limb.userData.baseOpacity ?? 0.4;
        limb.material.uniforms.uOpacity.value =
          baseOpacity + state.intensity * 0.1;
        const currentColor = baseColor
          .clone()
          .lerp(HOVER_COLOR, state.intensity);
        limb.material.uniforms.uColor.value.copy(currentColor);
      }
    }

    // Clean up fully-faded limbs
    for (const limb of limbsToRemove) {
      this.limbHighlightStates.delete(limb);
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
  private getDebugInfo(): HologramDebugInfo {
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
        } else if (
          state.grabTarget === 'limb' &&
          state.limbSide &&
          state.limbAxis
        ) {
          // Determine limb type from axis (vertical = arm, horizontal = leg)
          const limbType = state.limbAxis === 'vertical' ? 'arm' : 'leg';
          grabTargetStr = `${state.limbSide} ${limbType}`;
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
  enableDebug(callback: (info: HologramDebugInfo) => void): void {
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
   * Resets body rotation and all limb positions
   */
  reset(): void {
    if (this.schematic) {
      // Set body target rotation to zero - the update() interpolation will animate it
      this.schematicTargetRotation.set(0, 0, 0);

      // Stop any inertia so the schematic smoothly decelerates to rest
      this.rotationVelocity = { x: 0, y: 0 };

      // Collect all limb pivots for animated reset
      this.resettingLimbPivots.clear();
      this.schematic.traverse((child) => {
        if (child instanceof THREE.Group && child.userData.isLimbPivot) {
          // Store target rotation (rest pose) for each limb pivot
          this.resettingLimbPivots.set(child, new THREE.Euler(0, 0, 0));
        }
      });

      // Start the reset animation
      this.isResetting = true;

      console.log('[HologramController] Animating reset to original pose');
    }
  }

  /**
   * Clean up and dispose resources
   */
  dispose(): void {
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

    console.log('[HologramController] Disposed');
  }
}
