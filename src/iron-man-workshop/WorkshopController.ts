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
  LimbName,
  LimbReference,
  LIMB_NAMES,
} from './components/MarkVIModel';
import { HandLandmarkOverlay } from './components/HandLandmarkOverlay';

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
      grabTarget: 'body' | LimbName | null;
      grabStartHandPosition: THREE.Vector3 | null;
      grabStartRotation: THREE.Euler;
      lastHandPosition: THREE.Vector3 | null;
      lastRaycastTime: number;
      cachedIntersects: THREE.Intersection[];
    }
  > = new Map();
  private schematicTargetRotation: THREE.Euler = new THREE.Euler(
    0,
    -Math.PI / 2,
    0
  );

  // Hover state for visual feedback
  private isHoveringSchematic: boolean = false;
  private hoverIntensity: number = 0;

  // Limb articulation state
  private limbRefs: Map<LimbName, LimbReference> = new Map();
  private limbHoverIntensities: Map<LimbName, number> = new Map();
  private limbTargetRotations: Map<LimbName, THREE.Euler> = new Map();
  private hoveredLimb: LimbName | null = null;

  // Inertia state
  private rotationVelocity: { x: number; y: number } = { x: 0, y: 0 };

  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  // Performance optimization: Raycaster throttling
  private readonly RAYCAST_INTERVAL_MS: number = 100;

  // Performance optimization: Cached schematic shader meshes
  private schematicShaderMeshes: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >[] = [];

  // Performance optimization: Object pooling (zero allocations in hot paths)
  private readonly _tempVec2 = new THREE.Vector2();
  private readonly _tempVec3 = new THREE.Vector3();

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
    const {
      group: modelGroup,
      loadPromise,
      limbs,
    } = loadMarkVIModel({
      color: secondaryColor,
      scale,
    });
    this.schematic = modelGroup;
    this.schematic.userData.initialScale = scale;
    this.schematic.position.y = 0;
    this.schematic.rotation.y = -Math.PI / 2; // Face camera
    this.scene.add(this.schematic);

    // Enable camera to see limb hit volumes on layer 1
    this.camera.layers.enable(1);

    // Cache shader meshes and limb references after model loads
    loadPromise
      .then(() => {
        this.cacheSchematicShaderMeshes();
        // Copy limb references and initialize state
        for (const [limbName, limbRef] of limbs) {
          this.limbRefs.set(limbName, limbRef);
          this.limbHoverIntensities.set(limbName, 0);
          this.limbTargetRotations.set(limbName, limbRef.mesh.rotation.clone());
        }
        console.log(
          `[WorkshopController] Initialized ${this.limbRefs.size} limbs for articulation`
        );
      })
      .catch((error) => {
        console.error('[WorkshopController] Model load failed:', error);
      });
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

      // Key landmarks for manipulation
      const thumbTip = landmarks[4];
      const indexTip = landmarks[8];
      const wrist = landmarks[0];
      const indexBase = landmarks[9];

      // Calculate palm center (approximation)
      const palmX = (wrist.x + indexBase.x) / 2;
      const palmY = (wrist.y + indexBase.y) / 2;

      // Convert normalized coordinates to 3D world space (use pooled vector)
      this._tempVec3.set((0.5 - palmX) * 6, (0.5 - palmY) * 4, 0);
      const handPosition = this._tempVec3;

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
          grabStartHandPosition: null,
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

      if (isPinching) {
        if (!handState.isGrabbing) {
          // === GRAB START ===
          if (this.schematic) {
            // Calculate pinch midpoint
            const pinchMidX = (thumbTip.x + indexTip.x) / 2;
            const pinchMidY = (thumbTip.y + indexTip.y) / 2;

            const ndcX = (1 - pinchMidX) * 2 - 1;
            const ndcY = -(pinchMidY * 2 - 1);

            // Use pooled Vector2 for raycaster
            this._tempVec2.set(ndcX, ndcY);
            this.raycaster.setFromCamera(this._tempVec2, this.camera);

            // Check limbs FIRST (before body) to ensure precise limb targeting
            // Limbs are smaller hit volumes that should take priority
            let foundTarget = false;

            if (this.limbRefs.size > 0) {
              for (const [limbName, limbRef] of this.limbRefs) {
                const limbIntersects = this.raycaster.intersectObject(
                  limbRef.hitVolume,
                  false
                );
                if (limbIntersects.length > 0) {
                  // === LIMB GRAB ===
                  handState.isGrabbing = true;
                  handState.grabTarget = limbName;
                  handState.grabStartHandPosition = handPosition.clone();
                  handState.grabStartRotation.copy(limbRef.mesh.rotation);
                  console.log(
                    `[WorkshopController] Hand ${handIndex} grabbed limb: ${limbName}`
                  );
                  foundTarget = true;
                  anyHandHovering = true;
                  break;
                }
              }
            }

            // Fall back to body grab if no limb was hit
            if (!foundTarget) {
              const hitVolume = this.schematic.userData.hitVolume as
                | THREE.Mesh
                | undefined;
              const intersects = hitVolume
                ? this.raycaster.intersectObject(hitVolume, false)
                : [];

              if (intersects.length > 0) {
                // === BODY GRAB ===
                handState.isGrabbing = true;
                handState.grabTarget = 'body';
                handState.grabStartHandPosition = handPosition.clone();
                handState.grabStartRotation.copy(this.schematic.rotation);
                this.rotationVelocity = { x: 0, y: 0 };

                console.log(
                  `[WorkshopController] Hand ${handIndex} grabbed body`
                );
                foundTarget = true;
                anyHandHovering = true;
              }
            }
          }
        } else {
          // === CONTINUE GRABBING ===
          if (
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
          } else if (
            handState.grabTarget &&
            handState.grabTarget !== 'body' &&
            handState.grabStartHandPosition
          ) {
            // === LIMB ROTATION ===
            const limbRef = this.limbRefs.get(handState.grabTarget as LimbName);
            if (limbRef) {
              const deltaX = handPosition.x - handState.grabStartHandPosition.x;
              const deltaY = handPosition.y - handState.grabStartHandPosition.y;

              // Update limb target rotation
              let targetRot = this.limbTargetRotations.get(
                handState.grabTarget as LimbName
              );
              if (!targetRot) {
                targetRot = limbRef.mesh.rotation.clone();
                this.limbTargetRotations.set(
                  handState.grabTarget as LimbName,
                  targetRot
                );
              }

              // Map hand movement to limb rotation
              // Hand left/right → limb Y rotation (natural arm swing)
              // Hand up/down → limb X rotation (forward/back tilt)
              // Note: deltaX is inverted because hand X is mirrored from user perspective
              targetRot.y = handState.grabStartRotation.y - deltaX * 1.5;
              targetRot.x = handState.grabStartRotation.x - deltaY * 1.2;

              // Clamp to realistic joint limits
              targetRot.x = Math.max(
                -Math.PI / 3,
                Math.min(Math.PI / 3, targetRot.x)
              );
              targetRot.y = Math.max(
                -Math.PI / 2,
                Math.min(Math.PI / 2, targetRot.y)
              );

              // Apply rotation smoothly
              limbRef.mesh.rotation.x +=
                (targetRot.x - limbRef.mesh.rotation.x) * 0.15;
              limbRef.mesh.rotation.y +=
                (targetRot.y - limbRef.mesh.rotation.y) * 0.15;
            }
          }
        }
      } else {
        // Not pinching - release grab
        handState.isGrabbing = false;
        handState.grabTarget = null;
        handState.grabStartHandPosition = null;

        // Check for hover
        if (this.schematic) {
          const ndcX = (1 - indexTip.x) * 2 - 1;
          const ndcY = -(indexTip.y * 2 - 1);

          // Simple throttle for hover raycast
          const now = performance.now();
          if (now - handState.lastRaycastTime > this.RAYCAST_INTERVAL_MS) {
            // Use pooled Vector2
            this._tempVec2.set(ndcX, ndcY);
            this.raycaster.setFromCamera(this._tempVec2, this.camera);

            // Reset cached intersects
            handState.cachedIntersects = [];

            // Check body hit volume
            const hitVolume = this.schematic.userData.hitVolume as
              | THREE.Mesh
              | undefined;
            if (hitVolume) {
              handState.cachedIntersects = this.raycaster.intersectObject(
                hitVolume,
                false
              );
            }

            // Check limb hit volumes
            for (const [limbName, limbRef] of this.limbRefs) {
              const limbIntersects = this.raycaster.intersectObject(
                limbRef.hitVolume,
                false
              );
              if (limbIntersects.length > 0) {
                // Store limb intersection with limbType metadata
                limbIntersects.forEach((i) => {
                  i.object.userData.limbType = limbName;
                });
                handState.cachedIntersects.push(...limbIntersects);
              }
            }

            handState.lastRaycastTime = now;
          }

          // Determine what's being hovered
          let newHoveredLimb: LimbName | null = null;
          if (handState.cachedIntersects.length > 0) {
            for (const intersection of handState.cachedIntersects) {
              const userData = intersection.object.userData as
                | {
                    isHitVolume?: boolean;
                    limbType?: LimbName;
                    isBody?: boolean;
                  }
                | undefined;

              if (
                userData?.limbType &&
                LIMB_NAMES.includes(userData.limbType)
              ) {
                newHoveredLimb = userData.limbType;
                anyHandHovering = true;
                break; // Prefer first limb found
              } else if (userData?.isBody || userData?.isHitVolume) {
                anyHandHovering = true;
              }
            }
          }
          this.hoveredLimb = newHoveredLimb;
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
  }

  /**
   * Update hover visual feedback on schematic (Body) and limbs
   * Smoothly interpolates glow intensity for premium feel
   */
  private updateHoverState(isHovering: boolean, deltaTime: number): void {
    this.isHoveringSchematic = isHovering;

    // Smooth transition for body hover intensity
    const targetIntensity = isHovering && !this.hoveredLimb ? 1 : 0;
    const transitionSpeed = 8;
    this.hoverIntensity +=
      (targetIntensity - this.hoverIntensity) * transitionSpeed * deltaTime;

    // Update per-limb hover intensities
    for (const [limbName, limbRef] of this.limbRefs) {
      const currentIntensity = this.limbHoverIntensities.get(limbName) ?? 0;
      const limbTargetIntensity = this.hoveredLimb === limbName ? 1 : 0;
      const newIntensity =
        currentIntensity +
        (limbTargetIntensity - currentIntensity) * transitionSpeed * deltaTime;
      this.limbHoverIntensities.set(limbName, newIntensity);

      // Apply amber hover effect to limb shader meshes
      for (const mesh of limbRef.shaderMeshes) {
        if (mesh.material.uniforms.uHoverIntensity) {
          mesh.material.uniforms.uHoverIntensity.value = newIntensity;
        }
      }
    }

    // Apply visual feedback to schematic body
    if (this.schematic) {
      const baseScale = this.schematic.userData.initialScale || 3.0;

      if (this.hoverIntensity > 0.01) {
        const hoverScale = 1 + this.hoverIntensity * 0.08;
        this.schematic.scale.setScalar(baseScale * hoverScale);

        for (const mesh of this.schematicShaderMeshes) {
          if (mesh.material.uniforms.uOpacity) {
            const baseOpacity = mesh.userData.baseOpacity ?? 0.4;
            mesh.material.uniforms.uOpacity.value =
              baseOpacity + this.hoverIntensity * 0.15;
          }
        }
      } else {
        const scaleDiff = Math.abs(this.schematic.scale.x - baseScale);
        if (scaleDiff > 0.001) {
          this.schematic.scale.setScalar(baseScale);

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
        grabTargetStr = state.grabTarget;
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
      hoveredLimb: this.hoveredLimb,
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
