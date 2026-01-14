/**
 * @fileoverview WorkshopController - Main controller for the Iron Man holographic interface mode.
 *
 * This module orchestrates the holographic workshop experience, managing:
 * - Three.js scene composition with transparent background overlay
 * - Post-processing pipeline with bloom effects for holographic aesthetics
 * - Hand tracking integration for gesture-based interaction
 * - Component lifecycle (grid, rings, panels, Mark VI schematic)
 * - Exploded view animation system with particle effects
 *
 * @module iron-man-workshop/WorkshopController
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
import { LoadingOverlay } from './components/LoadingOverlay';
import { calculateHandRoll } from '../utils/math';
import {
  Vector3OneEuroFilter,
  RotationOneEuroFilter,
} from '../utils/smoothing';
import gsap from 'gsap';
import { WorkshopAudioManager } from './audio/WorkshopAudioManager';

/**
 * Main controller for the Iron Man holographic workshop interface.
 *
 * Manages the complete lifecycle of the holographic display including scene setup,
 * animation loop, hand tracking input, and component orchestration. Implements
 * gesture-based manipulation of the Mark VI schematic with exploded view support.
 *
 * @example
 * ```typescript
 * const controller = new WorkshopController(handTracker, containerElement);
 * controller.initialize();
 * controller.start();
 * ```
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
  private loadingOverlay: LoadingOverlay | null = null;

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
      // One Euro Filters for stabilizing limb grab (reduce hand tremor jitter)
      limbPositionFilter: Vector3OneEuroFilter | null;
      limbRotationFilter: RotationOneEuroFilter | null;
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

  // Performance optimization: Pre-allocated temp objects to avoid per-frame GC pressure
  private readonly _tempWorldPos: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempDirection: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempHandPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempRawTargetPosition: THREE.Vector3 = new THREE.Vector3();
  private readonly _tempNdc: THREE.Vector2 = new THREE.Vector2();
  private readonly _hoverBaseColor: THREE.Color = new THREE.Color(0x00ff88);
  private readonly _hoverHighlightColor: THREE.Color = new THREE.Color(
    0xffbf00
  );

  // Performance optimization: Info panel raycast throttling
  private lastInfoPanelRaycastTime: number = 0;
  private cachedInfoPanelIntersects: THREE.Intersection[] = [];
  private lastHoveredPart: string | null = null;

  // Performance optimization: Cached schematic shader meshes
  private schematicShaderMeshes: THREE.Mesh<
    THREE.BufferGeometry,
    THREE.ShaderMaterial
  >[] = [];

  // Exploded View Feature
  private explodedViewManager: ExplodedViewManager | null = null;
  private particleTrailSystem: ParticleTrailSystem | null = null;

  // Audio system
  private audioManager: WorkshopAudioManager;

  // Left-hand gesture detection for exploded view
  // Open palm = explode, Closed fist = assemble
  private lastLeftHandPose: 'open' | 'fist' | 'unknown' = 'unknown';
  private leftHandGestureCooldownMs: number = 800;
  private lastLeftHandGestureTime: number = 0;

  // Stability Buffer State
  // We require N consecutive frames of the same pose to confirm it
  // This prevents fleeting glitches (e.g. hand leaving frame) from causing triggers
  private currentStablePose: 'open' | 'fist' | 'unknown' = 'unknown';
  private potentialPose: 'open' | 'fist' | 'unknown' = 'unknown';
  private poseConsistencyCounter: number = 0;
  private readonly POSE_STABILITY_THRESHOLD: number = 8; // ~250ms at 30Hz

  // Left-hand wrist rotation state for twist-to-rotate in exploded view
  // Roll (twist) controls Y-axis, palm Y position controls X-axis
  private leftHandLastRoll: number | null = null;
  private leftHandRollSmoothed: number = 0;
  private leftHandLastPalmY: number | null = null;
  private leftHandPalmYSmoothed: number = 0;
  private leftHandRotateAudioPlaying: boolean = false;

  // Camera animation state
  // Camera animation state
  private baseCameraZ: number = 5;
  private targetCameraZ: number = 10; // Start zoomed out
  private isStartupSequence: boolean = false;

  // Rotation audio state
  private lastRotationSoundTime: number = 0;
  private previousSchematicRotationY: number = -Math.PI / 2;

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
    this.camera.position.set(0, 0.5, 10); // Start zoomed out
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

    // Initialize audio system
    this.audioManager = new WorkshopAudioManager(this.camera);

    // Bind resize handler
    this.handleResize = this.handleResize.bind(this);
  }

  /**
   * Initializes the holographic scene and all subsystems.
   *
   * Sets up the Three.js renderer, hand tracking overlay, lighting,
   * holographic components, and event listeners. Must be called before start().
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
   * Configures the post-processing pipeline with bloom effects.
   *
   * Creates render pass and bloom effect pass using pmndrs/postprocessing
   * library for efficient single-pass effect merging.
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
   * Configures scene lighting for holographic aesthetics.
   *
   * Adds ambient light for base visibility and a cyan-tinted point light
   * positioned to create highlights on the schematic model.
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
   * Creates and adds all holographic components to the scene.
   *
   * Instantiates the grid floor, rotating rings, floating panels,
   * Mark VI schematic model, and info panel. Initiates async model
   * loading with callback for exploded view initialization.
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

    // Initial State: Hidden
    this.schematic.visible = false;
    if (this.rings) this.rings.visible = false;
    if (this.panels) this.panels.visible = false;

    // Cache shader meshes after model loads
    loadPromise
      .then(() => {
        this.cacheSchematicShaderMeshes();
        this.initializeExplodedView();
        // Start cinematic sequence
        this.playStartupSequence();
      })
      .catch((error) => {
        console.error('[WorkshopController] Model load failed:', error);
      });

    // Info Panel (initially hidden)
    this.partInfoPanel = new PartInfoPanel();
    this.scene.add(this.partInfoPanel.getObject());

    // Loading Overlay (DOM)
    this.loadingOverlay = new LoadingOverlay(this.container);
  }

  /**
   * Orchestrates the opening cinematic sequence.
   *
   * Sequence:
   * 1. Loading HUD (Premium initialization)
   * 2. Schematic parts fly in (Assembly animation)
   * 3. Vertical laser scan validation
   * 4. Environment reveal (Rings, Panels)
   */
  private async playStartupSequence(): Promise<void> {
    if (!this.schematic || !this.explodedViewManager) return;

    // 1. Setup Initial State (Exploded to off-screen)
    // Multiplier 100 puts them completely outside the viewport/frustum
    this.explodedViewManager.forceExplodedState(100.0);

    // Ensure schematic is visible but parts are exploded off-screen
    this.schematic.visible = true;

    console.log('[WorkshopController] Starting cinematic sequence...');
    this.isStartupSequence = true;

    // Step 1: Loading Sequence (0.5 - 1s) - AWAIT this before starting timeline
    // Play boot sequence sound
    this.audioManager.play('bootSequence');

    // Start loading sound loop
    this.audioManager.play('loadingLoop');

    if (this.loadingOverlay) {
      await this.loadingOverlay.startLoading(1500); // 1.5 second load
    }

    // Stop loading sound loop
    this.audioManager.stop('loadingLoop');

    // Step 2: Begin Cinematic Timeline (Assembly -> Scan -> Reveal)
    const timeline = gsap.timeline();

    timeline.call(() => {
      console.log('[WorkshopController] Triggering assembly...');
      // Play servo sound during assembly
      this.audioManager.play('flybyIn');
      // Zoom back in to normal distance during assembly
      this.targetCameraZ = this.baseCameraZ;
      this.explodedViewManager?.assemble();
    });

    // Wait for assembly to finish (ExplodedViewManager duration is 1.0s)
    // Reducing wait to 1.5s to start scan IMMEDIATELY after assembly
    timeline.to({}, { duration: 1.5 });

    // Step 3: Vertical Scan Trigger
    timeline.call(() => {
      console.log('[WorkshopController] Triggering scan...');
      // Stop servo sound, play metal click for assembly complete
      // Play scan beam sound
      this.audioManager.play('scanBeam', this.schematic!);
      this.triggerScanEffect();
    });

    // Wait for scan (1.5s) + Surge (~1.0s) to finish before revealing environment
    timeline.to({}, { duration: 2.3 });

    // Step 4: Reveal Environment
    timeline.call(() => {
      console.log('[WorkshopController] Revealing environment...');
      this.isStartupSequence = false;

      const animateFadeIn = (group: THREE.Group) => {
        group.visible = true;
        group.traverse((child) => {
          if (
            child instanceof THREE.Mesh ||
            child instanceof THREE.Line ||
            child instanceof THREE.LineSegments
          ) {
            const material = child.material as
              | THREE.Material
              | THREE.ShaderMaterial;

            if (
              material instanceof THREE.ShaderMaterial &&
              material.uniforms?.uOpacity
            ) {
              // For ShaderMaterial, animate uniform
              const targetOpacity = 0.6;
              material.uniforms.uOpacity.value = 0;
              gsap.to(material.uniforms.uOpacity, {
                value: targetOpacity,
                duration: 1.5,
                ease: 'power2.out',
              });
            } else {
              // For standard materials (LineBasicMaterial)
              const targetOpacity = material.opacity;
              material.opacity = 0;
              gsap.to(material, {
                opacity: targetOpacity,
                duration: 1.5,
                ease: 'power2.out',
              });
            }
          }
        });
      };

      if (this.rings) animateFadeIn(this.rings);
      if (this.panels) animateFadeIn(this.panels);

      // Start ambient background hum
      this.audioManager.startAmbient();
    });
  }

  /**
   * Triggers the vertical validation scan effect on the schematic.
   */
  /**
   * Triggers the vertical validation scan effect on the schematic.
   */
  private triggerScanEffect(): void {
    // Animate the uScanY uniform from bottom (-2) to top (2)
    // and uScanIntensity

    const startY = -3.0;
    const endY = 3.0;
    const scanDuration = 1.5; // Faster scan (was 2.0)

    const scanObj = { y: startY, intensity: 0 };

    // Initialize uniforms
    for (const mesh of this.schematicShaderMeshes) {
      mesh.material.uniforms.uScanY.value = startY;
      mesh.material.uniforms.uScanIntensity.value = 1.0;
    }

    gsap.to(scanObj, {
      y: endY,
      duration: scanDuration,
      ease: 'power1.inOut', // Snappier easing (was power2)
      onUpdate: () => {
        for (const mesh of this.schematicShaderMeshes) {
          mesh.material.uniforms.uScanY.value = scanObj.y;
        }
      },
      onComplete: () => {
        // TRIGGER SURGE IMMEDIATELY (Simultaneous with fade)
        this.triggerEnergySurge();

        // Fade out scan beam
        gsap.to(scanObj, {
          intensity: 0,
          duration: 0.2, // Faster fade
          onUpdate: () => {
            for (const mesh of this.schematicShaderMeshes) {
              mesh.material.uniforms.uScanIntensity.value = scanObj.intensity;
            }
          },
          onComplete: () => {
            // Turn off scan beam uniform logic completely to save perf/prevent artifacts
            for (const mesh of this.schematicShaderMeshes) {
              mesh.material.uniforms.uScanIntensity.value = 0;
            }
          },
        });
      },
    });
  }

  /**
   * Triggers a "power up" energy surge effect on the schematic.
   *
   * Rapidly boosts opacity and fresnel glow to simulate system readiness/charging.
   */
  private triggerEnergySurge(): void {
    const surgeAttack = 0.1;
    const surgeDecay = 0.8;

    console.log('[WorkshopController] Triggering energy surge...');

    // Play energy surge sound
    this.audioManager.play('energySurge', this.schematic!);

    for (const mesh of this.schematicShaderMeshes) {
      // Get base values (or default)
      const baseOpacity = mesh.userData.baseOpacity ?? 0.6;
      const baseFresnel = mesh.userData.baseFresnelPower ?? 2.5;

      // Kill existing tweens on these properties to avoid conflicts
      gsap.killTweensOf(mesh.material.uniforms.uOpacity);
      gsap.killTweensOf(mesh.material.uniforms.uFresnelPower);

      // Sequence: Flash UP -> Fade DOWN
      const timeline = gsap.timeline();

      // 1. Opacity Surge (Brighten)
      timeline
        .to(mesh.material.uniforms.uOpacity, {
          value: 1.0, // Max opacity
          duration: surgeAttack,
          ease: 'power2.out',
        })
        .to(mesh.material.uniforms.uOpacity, {
          value: baseOpacity,
          duration: surgeDecay,
          ease: 'power2.out',
        });

      // 2. Fresnel Surge (Widen glow by reducing power)
      // Parallel animation for fresnel
      gsap.to(mesh.material.uniforms.uFresnelPower, {
        value: 1.0, // Wider, more intense glow
        duration: surgeAttack,
        ease: 'power2.out',
        onComplete: () => {
          gsap.to(mesh.material.uniforms.uFresnelPower, {
            value: baseFresnel,
            duration: surgeDecay,
            ease: 'power2.out',
          });
        },
      });
    }
  }

  /**
   * Initializes the exploded view animation system.
   *
   * Creates the particle trail system with emitters for each limb,
   * configures the ExplodedViewManager with animation callbacks for
   * particle effects, glow intensification, and camera zoom.
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
    // Note: enableSound is false - audio is handled centrally by WorkshopAudioManager
    this.explodedViewManager = new ExplodedViewManager({
      animationDuration: 1.0,
      enableSound: false, // Handled by WorkshopAudioManager
      enableParticles: true,

      // Called when limb starts moving
      onLimbMoveStart: (limbName, mesh) => {
        // Start particle trail for this limb (using pre-allocated temps)
        mesh.getWorldPosition(this._tempWorldPos);
        // Initial direction (will be updated per-frame based on velocity)
        this._tempDirection.set(0, -1, 0);
        this.particleTrailSystem?.startTrail(
          limbName,
          this._tempWorldPos,
          this._tempDirection
        );

        // Intensify glow on moving limb
        if (
          mesh instanceof THREE.Mesh &&
          mesh.material instanceof THREE.ShaderMaterial
        ) {
          gsap.to(mesh.material.uniforms.uOpacity, {
            value: 0.9, // Brighter during motion
            duration: 0.2,
            overwrite: true,
          });
        }
      },

      // Called every frame during movement - KEY for particle trail following
      onLimbMoveUpdate: (limbName, mesh, velocity) => {
        mesh.getWorldPosition(this._tempWorldPos);
        // Update particle trail position AND direction based on velocity
        this.particleTrailSystem?.updateTrailWithVelocity(
          limbName,
          this._tempWorldPos,
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
          // Reset glow
          const baseOpacity = mesh.userData.baseOpacity ?? 0.4;
          gsap.to(mesh.material.uniforms.uOpacity, {
            value: baseOpacity,
            duration: 0.15, // Faster fade out
            overwrite: true,
          });
        }
      },

      // Called when an individual limb snaps into place during assembly
      onLimbAssemblyComplete: (_limbName) => {
        if (!this.isStartupSequence) {
          // Play impact sound for each limb arrival
          this.audioManager.play('plasmaShot', this.schematic!);
        }
      },

      // Called during anticipation phase - boost hologram intensity
      onAnticipation: () => {
        console.log('[WorkshopController] Anticipation phase - charging');
        // Play power up sound for anticipation
        this.audioManager.play('energySurge', this.schematic!);
        // Brief intense glow during anticipation
        for (const mesh of this.schematicShaderMeshes) {
          gsap.to(mesh.material.uniforms.uOpacity, {
            value: 0.7,
            duration: 0.1,
            yoyo: true,
            repeat: 1,
            overwrite: true,
          });
        }
      },

      // Called on state changes
      onStateChange: (newState) => {
        // Audio feedback for state changes
        if (newState === 'exploding') {
          // Start servo sound for movement
          this.audioManager.play('disassemble');
        } else if (newState === 'assembling') {
          // Start servo sound for movement
          if (!this.isStartupSequence) {
            this.audioManager.play('assemble');
          }
        } else if (newState === 'exploded') {
          // Stop servo, play metal click for lock-in
        } else if (newState === 'assembled') {
          // Stop servo, play metal click for lock-in
        }

        // Camera zoom on state change
        if (newState === 'exploding') {
          this.targetCameraZ = this.baseCameraZ + 3.8; // Zoom out MORE (was 2.5)
          this.intensifyHologramEffect(true);
          this.animateRingsVisibility(false); // Fade out rings during explosion
          this.animatePanelsVisibility(false); // Fade out panels during explosion
        } else if (newState === 'assembling') {
          this.targetCameraZ = this.baseCameraZ; // Zoom back
          this.intensifyHologramEffect(false);
        } else if (newState === 'assembled') {
          this.animateRingsVisibility(true); // Fade in rings after reassembly
          this.animatePanelsVisibility(true); // Fade in panels after reassembly
        }
      },
    });

    // Initialize manager with schematic reference
    this.explodedViewManager.initialize(this.schematic);

    console.log('[WorkshopController] ExplodedView system initialized');
  }

  /**
   * Caches references to schematic shader meshes for efficient per-frame updates.
   *
   * Traverses the schematic model once and stores references to all meshes using
   * the holographic shader material. This eliminates the need for expensive
   * `Object3D.traverse()` calls during the animation loop.
   *
   * Cached meshes are used by:
   * - `updateMarkVIModelCached()` for time-based shader uniform updates
   * - `updateHoverState()` for per-limb opacity and color transitions
   * - `intensifyHologramEffect()` for explosion/assembly visual effects
   *
   * @remarks
   * Must be called after the schematic model is loaded but before the animation loop starts.
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
   * Starts the main animation loop.
   *
   * Initializes timing state for delta time calculation and FPS monitoring,
   * then begins the recursive `requestAnimationFrame` loop. The loop continues
   * until {@link stop} is called.
   *
   * @remarks
   * Calling `start()` when already running has no effect (early return guard).
   * This method is idempotent.
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
   * Stops the animation loop.
   *
   * Cancels the pending animation frame request and resets the running state.
   * Safe to call multiple times; subsequent calls have no effect.
   *
   * @remarks
   * Does not dispose resources. Call {@link dispose} for full cleanup.
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
   * Main animation loop callback.
   *
   * Executes each frame via `requestAnimationFrame`. Responsibilities include:
   * 1. Delta time calculation with 50ms cap to prevent physics explosions
   * 2. FPS counter updates for debug display
   * 3. Component updates via {@link update}
   * 4. Post-processing render pass
   * 5. Debug callback invocation when enabled
   *
   * @remarks
   * The delta time cap (0.05s = 20fps minimum) ensures smooth recovery when
   * the browser tab is backgrounded and resumed. Without capping, large delta
   * values would cause physics/animation discontinuities.
   */
  private animate = (): void => {
    if (!this.isRunning) return;

    const timestamp = performance.now();
    // Cap deltaTime to prevent physics explosions when tab is backgrounded/resumed
    // Max 50ms (20fps minimum) prevents large jumps in animation/physics
    const deltaTime = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
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
   * Updates all holographic components each frame.
   *
   * Orchestrates per-frame updates for all subsystems:
   * - Ring rotation animations
   * - Panel hover animations
   * - Shader time uniforms on cached meshes
   * - Hand tracking and gesture detection
   * - Schematic rotation interpolation with inertia
   * - Info panel camera-facing updates
   * - Particle trail emission
   * - Camera zoom animation
   *
   * @param time - Elapsed time in seconds (for shader animations)
   * @param deltaTime - Time since last frame in seconds (for physics/interpolation)
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
   * Detects left-hand gestures to trigger explode/assemble animations.
   *
   * Gesture mapping:
   * - Open palm (fingers extended) → Trigger explosion if currently assembled
   * - Closed fist (fingers curled) → Trigger assembly if currently exploded
   *
   * The detection pipeline implements input stability buffering:
   * 1. Hand existence check with immediate reset on signal loss
   * 2. Left hand identification via MediaPipe handedness with confidence threshold
   * 3. Pose classification based on fingertip-to-palm distance
   * 4. Stability buffer requiring consecutive consistent frames before triggering
   * 5. Cooldown enforcement to prevent rapid toggling
   *
   * @remarks
   * Uses hysteresis thresholds (OPEN_THRESHOLD=0.12, CLOSED_THRESHOLD=0.08)
   * to create a dead zone preventing oscillation between states.
   */
  private detectLeftHandGesture(): void {
    const result = this.handTracker.getLastResult();

    // 1. Hand Existence Check
    // If no results at all, RESET everything immediately.
    // This is critical: if the hand leaves the frame, we must not hold onto stale state.
    if (!result || result.landmarks.length === 0) {
      this.resetLeftHandState();
      return;
    }

    // 2. Find the SPECIFIC left hand
    let leftHandIndex = -1;
    if (result.handedness) {
      for (let i = 0; i < result.handedness.length; i++) {
        // MediaPipe returns actual anatomical handedness: "Left" = user's left hand
        // Confidence check is usually good practice too
        const hand = result.handedness[i]?.[0];
        if (hand?.categoryName === 'Left' && (hand.score ?? 0) > 0.8) {
          leftHandIndex = i;
          break;
        }
      }
    }

    // If existing results do NOT contain a Left hand using strict checking
    if (leftHandIndex === -1) {
      this.resetLeftHandState();
      return;
    }

    const landmarks = result.landmarks[leftHandIndex];

    // 3. Pose Classification
    // Calculate if hand is open (fingers extended) or closed (fist)
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

    const OPEN_THRESHOLD = 0.12;
    const CLOSED_THRESHOLD = 0.08;

    let instantaneousPose: 'open' | 'fist' | 'unknown' = 'unknown';
    if (avgFingerDistance > OPEN_THRESHOLD) {
      instantaneousPose = 'open';
    } else if (avgFingerDistance < CLOSED_THRESHOLD) {
      instantaneousPose = 'fist';
    }

    // 4. Stability Buffer Implementation
    if (instantaneousPose === this.potentialPose) {
      // Pose matches our candidate, increment counter
      this.poseConsistencyCounter++;
    } else {
      // Pose changed, reset counter and start tracking new candidate
      this.potentialPose = instantaneousPose;
      this.poseConsistencyCounter = 1;
    }

    // 5. Trigger Logic (only if stable)
    if (this.poseConsistencyCounter >= this.POSE_STABILITY_THRESHOLD) {
      const newStablePose = this.potentialPose;

      // Only trigger if the STABLE pose has changed
      if (
        newStablePose !== 'unknown' &&
        newStablePose !== this.currentStablePose
      ) {
        // Prepare for action
        const now = performance.now();
        if (
          now - this.lastLeftHandGestureTime >=
          this.leftHandGestureCooldownMs
        ) {
          // Perform Action
          if (
            newStablePose === 'open' &&
            this.explodedViewManager?.getState() === 'assembled'
          ) {
            console.log(
              '[WorkshopController] Left hand STABLE OPEN -> EXPLODE'
            );
            this.lastLeftHandGestureTime = now;
            this.explodedViewManager.explode();
          } else if (
            newStablePose === 'fist' &&
            this.explodedViewManager?.getState() === 'exploded'
          ) {
            console.log(
              '[WorkshopController] Left hand STABLE FIST -> ASSEMBLE'
            );
            this.lastLeftHandGestureTime = now;
            this.explodedViewManager.assemble();

            // Reset rotation
            this.schematicTargetRotation.set(0, -Math.PI / 2, 0);
            this.rotationVelocity = { x: 0, y: 0 };
          }
        }

        // Update our known stable state
        this.currentStablePose = newStablePose;
      }
    }

    // Always update lastLeftHandPose for other consumers if needed (like wrist rotation)
    // Though wrist rotation should ideally use stable pose too, keeping this for now
    this.lastLeftHandPose = instantaneousPose;
  }

  /**
   * Resets all left-hand gesture tracking state.
   *
   * Called when the left hand is lost from tracking or detection confidence drops.
   * Clears the stability buffer and pose classification to ensure clean state
   * when tracking resumes.
   */
  private resetLeftHandState(): void {
    // If we had a valid pose, log that we lost it
    if (this.currentStablePose !== 'unknown') {
      // console.log('[WorkshopController] Left hand signal lost - resetting state');
    }
    this.currentStablePose = 'unknown';
    this.potentialPose = 'unknown';
    this.poseConsistencyCounter = 0;
    this.lastLeftHandPose = 'unknown';
  }

  /**
   * Applies left-hand wrist rotation to the schematic in exploded state.
   *
   * This secondary control scheme is only active when:
   * - The schematic is in 'exploded' state
   * - The left hand is detected with an open palm pose
   *
   * Control mapping:
   * - Wrist roll (twist) → Y-axis rotation (left/right viewing angle)
   * - Palm Y position (up/down) → X-axis rotation (tilt angle)
   *
   * Implements smoothing (SMOOTHING=0.15) and dead zones to reduce jitter
   * from hand tracking noise. First-frame initialization prevents wild deltas
   * when tracking begins.
   */
  private updateLeftHandWristRotation(): void {
    // Helper to stop rotation audio if playing
    const stopRotationAudio = () => {
      if (this.leftHandRotateAudioPlaying) {
        this.audioManager.stop('leftHandRotate');
        this.leftHandRotateAudioPlaying = false;
      }
    };

    // Only active in exploded state
    if (this.explodedViewManager?.getState() !== 'exploded') {
      this.leftHandLastRoll = null;
      this.leftHandLastPalmY = null;
      stopRotationAudio();
      return;
    }

    // Only active when left hand palm is open (not a fist)
    if (this.lastLeftHandPose !== 'open') {
      this.leftHandLastRoll = null;
      this.leftHandLastPalmY = null;
      stopRotationAudio();
      return;
    }

    const result = this.handTracker.getLastResult();
    if (!result || result.landmarks.length === 0) {
      this.leftHandLastRoll = null;
      this.leftHandLastPalmY = null;
      stopRotationAudio();
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
      stopRotationAudio();
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
      // Start rotation audio loop when rotation becomes active
      if (!this.leftHandRotateAudioPlaying) {
        this.audioManager.play('leftHandRotate');
        this.leftHandRotateAudioPlaying = true;
      }
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

    // === ROTATION SOUND (Left Hand / Exploded Mode) ===
    // Use same logic as right hand: threshold + cooldown
    const rotationDelta = Math.abs(
      this.schematicTargetRotation.y - this.previousSchematicRotationY
    );
    const now = performance.now();
    const ROTATION_SOUND_COOLDOWN_MS = 400;
    const ROTATION_THRESHOLD = 0.15; // ~8.6 degrees

    // Only play if we have rotated enough AND cooldown has passed
    if (
      rotationDelta > ROTATION_THRESHOLD &&
      now - this.lastRotationSoundTime > ROTATION_SOUND_COOLDOWN_MS
    ) {
      this.audioManager.play('rotateSchematic');
      this.lastRotationSoundTime = now;
      this.previousSchematicRotationY = this.schematicTargetRotation.y;
    }

    // Update last values for next frame
    this.leftHandLastRoll = this.leftHandRollSmoothed;
    this.leftHandLastPalmY = this.leftHandPalmYSmoothed;
  }

  /**
   * Modulates holographic shader effects during state transitions.
   *
   * Creates cinematic visual feedback during explosion/assembly animations
   * by temporarily boosting scanline frequency and fresnel glow intensity.
   *
   * @param intensify - When `true`, increases effect intensity (1.5x scanlines, 1.3x fresnel);
   *                    when `false`, returns to base values.
   *
   * @remarks
   * Uses GSAP with `overwrite: true` to prevent animation conflicts when rapidly
   * toggling between states.
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
        overwrite: true,
      });
      gsap.to(mesh.material.uniforms.uFresnelPower, {
        value: mesh.userData.baseFresnelPower * targetFresnelMultiplier,
        duration: 0.4,
        ease: 'power2.out',
        overwrite: true,
      });
    }
  }

  /**
   * Animates decorative ring visibility during state transitions.
   *
   * Fades holographic rings out when entering exploded view to reduce visual
   * clutter and emphasize the schematic parts, then fades them back in when
   * returning to assembled state.
   *
   * @param visible - Target visibility state (`true` = fade in, `false` = fade out)
   *
   * @remarks
   * Stores original opacity on first call to preserve material-specific values.
   * Uses GSAP with `overwrite: true` to prevent animation stacking.
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
            overwrite: true,
          });
        } else if ('opacity' in material) {
          gsap.to(material, {
            opacity: targetOpacity,
            duration,
            ease,
            overwrite: true,
          });
        }
      }
    });
  }

  /**
   * Animates the visibility of the background panels (fade in/out).
   *
   * Handles both ShaderMaterial (uOpacity uniform) and LineBasicMaterial
   * (opacity property) for panel meshes and their border/bracket decorations.
   *
   * @param visible - Target visibility state (`true` = fade in, `false` = fade out)
   *
   * @remarks
   * Stores original opacity on first call to preserve material-specific values.
   * Uses GSAP with `overwrite: true` to prevent animation stacking.
   */
  private animatePanelsVisibility(visible: boolean): void {
    if (!this.panels) return;

    const duration = visible ? 0.6 : 0.8;
    const ease = visible ? 'power2.out' : 'power2.inOut';

    this.panels.traverse((child: THREE.Object3D) => {
      // Handle Mesh materials (panel faces with ShaderMaterial)
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

        if (
          material instanceof THREE.ShaderMaterial &&
          material.uniforms?.uOpacity
        ) {
          gsap.to(material.uniforms.uOpacity, {
            value: targetOpacity,
            duration,
            ease,
            overwrite: true,
          });
        } else if ('opacity' in material) {
          gsap.to(material, {
            opacity: targetOpacity,
            duration,
            ease,
            overwrite: true,
          });
        }
      }

      // Handle Line/LineSegments materials (borders and brackets)
      if (
        (child instanceof THREE.Line || child instanceof THREE.LineSegments) &&
        child.material
      ) {
        const material = child.material as THREE.LineBasicMaterial;

        // Store original opacity on first call
        if (child.userData.originalOpacity === undefined) {
          child.userData.originalOpacity = material.opacity ?? 1.0;
        }

        const targetOpacity = visible ? child.userData.originalOpacity : 0;

        gsap.to(material, {
          opacity: targetOpacity,
          duration,
          ease,
          overwrite: true,
        });
      }
    });
  }

  /**
   * Processes hand tracking data to manipulate the schematic.
   *
   * Supports multi-hand interaction where each hand maintains independent state.
   * Processing flow per hand:
   * 1. Handedness check (only right hand can pinch-to-rotate)
   * 2. Pinch detection with hysteresis thresholds
   * 3. Grab target determination via throttled raycasting
   * 4. Continuous manipulation (position/rotation updates)
   * 5. Hover state updates for visual feedback
   *
   * Manipulation modes:
   * - **Assembled state**: Pinch anywhere to rotate the whole schematic
   * - **Exploded state**: Pinch a specific part to manipulate that limb
   *
   * @param deltaTime - Time since last frame in seconds (for velocity calculation)
   *
   * @remarks
   * Uses One Euro Filters for limb manipulation to reduce jitter while maintaining
   * responsiveness. Raycasting is throttled to RAYCAST_INTERVAL_MS for performance.
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

      // Convert normalized coordinates to 3D world space (using pre-allocated temp)
      this._tempHandPosition.set((0.5 - palmX) * 6, (0.5 - palmY) * 4, 0);
      const handPosition = this._tempHandPosition;

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
          // Filters created on grab start, reset on release
          limbPositionFilter: null,
          limbRotationFilter: null,
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
          // We use the index tip for the raycast origin
          const ndcX = (1 - indexTip.x) * 2 - 1;
          const ndcY = -(indexTip.y * 2 - 1);

          // Raycast against hit volumes (throttled for performance)
          if (this.schematic) {
            const hitVolumes = this.schematic.userData.hitVolumes as
              | THREE.Mesh[]
              | undefined;

            if (hitVolumes && hitVolumes.length > 0) {
              // Throttle info panel raycasting to RAYCAST_INTERVAL_MS
              const now = performance.now();
              if (
                now - this.lastInfoPanelRaycastTime >
                this.RAYCAST_INTERVAL_MS
              ) {
                this._tempNdc.set(ndcX, ndcY);
                this.raycaster.setFromCamera(this._tempNdc, this.camera);
                this.cachedInfoPanelIntersects =
                  this.raycaster.intersectObjects(hitVolumes, false);
                this.lastInfoPanelRaycastTime = now;
              }

              // Use cached intersects
              if (this.cachedInfoPanelIntersects.length > 0) {
                // Found a part!
                const hitObject = this.cachedInfoPanelIntersects[0].object;
                const partName = hitObject.userData.limbType;

                if (partName && this.partInfoPanel) {
                  // Play hover sound if we just entered this part
                  if (partName !== this.lastHoveredPart) {
                    this.audioManager.play('hoverDetails');
                    this.lastHoveredPart = partName;
                  }

                  // Convert intersection point to world space for the panel anchor
                  // The intersection point is already in world space
                  this.partInfoPanel.show(
                    partName,
                    this.cachedInfoPanelIntersects[0].point
                  );
                  anyHandHovering = true; // Keep schematic glow effect too
                }
              } else {
                // No hit, hide panel
                this.partInfoPanel?.hide();
                this.lastHoveredPart = null;
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

            this._tempNdc.set(ndcX, ndcY);
            this.raycaster.setFromCamera(this._tempNdc, this.camera);

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

                    // Initialize One Euro Filters for stable limb manipulation
                    // minCutoff=1.0: moderate smoothing at rest
                    // beta=0.5: responsive to fast movements
                    handState.limbPositionFilter = new Vector3OneEuroFilter(
                      1.0,
                      0.5,
                      1.0
                    );
                    // Slightly more aggressive smoothing for rotation
                    handState.limbRotationFilter = new RotationOneEuroFilter(
                      1.2,
                      0.6,
                      1.0
                    );

                    console.log(
                      `[WorkshopController] Hand ${handIndex} grabbed limb: ${limbType}`
                    );

                    // Play grab sound
                    this.audioManager.play('pinchRotate');
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
                  this.audioManager.play('pinchRotate');
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

              // Calculate raw target position based on hand movement (using pre-allocated temp)
              const movementScale = 0.5; // Sensitivity scaling
              this._tempRawTargetPosition.set(
                handState.grabStartLimbPosition.x + deltaX * movementScale,
                handState.grabStartLimbPosition.y + deltaY * movementScale,
                handState.grabStartLimbPosition.z // Keep Z unchanged
              );
              const rawTargetPosition = this._tempRawTargetPosition;

              // Apply One Euro Filter for stable, jitter-free movement
              // The filter adapts: smooth when stationary, responsive when moving
              const timestamp = performance.now() / 1000; // Convert to seconds
              if (handState.limbPositionFilter) {
                const smoothedPosition = handState.limbPositionFilter.filter(
                  rawTargetPosition,
                  timestamp
                );
                handState.grabbedLimbMesh.position.x = smoothedPosition.x;
                handState.grabbedLimbMesh.position.y = smoothedPosition.y;
              } else {
                // Fallback if filter not initialized
                handState.grabbedLimbMesh.position.x = rawTargetPosition.x;
                handState.grabbedLimbMesh.position.y = rawTargetPosition.y;
              }

              // === WRIST TWIST ROTATION ===
              // Calculate current wrist roll and apply to limb rotation
              const indexMCP = landmarks[5];
              const pinkyMCP = landmarks[17];
              const currentRoll = calculateHandRoll(indexMCP, pinkyMCP);

              // Calculate roll delta from initial grab position
              let rollDelta = currentRoll - handState.grabStartWristRoll;

              // Handle wrap-around at ±π boundary
              if (rollDelta > Math.PI) rollDelta -= 2 * Math.PI;
              if (rollDelta < -Math.PI) rollDelta += 2 * Math.PI;

              // Calculate raw target rotation
              const ROTATION_SENSITIVITY = 2.5;
              const rawTargetRotation =
                handState.grabStartLimbRotation.y +
                rollDelta * ROTATION_SENSITIVITY;

              // Apply One Euro Filter for smooth rotation
              if (handState.limbRotationFilter) {
                const smoothedRotation = handState.limbRotationFilter.filter(
                  rawTargetRotation,
                  timestamp
                );
                handState.grabbedLimbMesh.rotation.y = smoothedRotation;
              } else {
                // Fallback if filter not initialized
                handState.grabbedLimbMesh.rotation.y = rawTargetRotation;
              }
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

            // === ROTATION SOUND (Assembled mode only) ===
            const isAssembled =
              this.explodedViewManager?.getState() === 'assembled';
            if (isAssembled) {
              const rotationDelta = Math.abs(
                this.schematicTargetRotation.y - this.previousSchematicRotationY
              );
              const now = performance.now();
              const ROTATION_SOUND_COOLDOWN_MS = 400;
              const ROTATION_THRESHOLD = 0.15; // ~8.6 degrees

              if (
                rotationDelta > ROTATION_THRESHOLD &&
                now - this.lastRotationSoundTime > ROTATION_SOUND_COOLDOWN_MS
              ) {
                this.audioManager.play('rotateSchematic');
                this.lastRotationSoundTime = now;
                this.previousSchematicRotationY =
                  this.schematicTargetRotation.y;
              }
            }
          }
        }
      } else {
        // Not pinching - release grab
        // Resume levitation if we were grabbing a limb
        if (handState.grabTarget === 'limb' && handState.grabbedLimbType) {
          this.explodedViewManager?.resumeLevitation();
          // Play release sound
          // this.audioManager.play('partRelease');
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

        // Reset One Euro Filters for next grab
        handState.limbPositionFilter = null;
        handState.limbRotationFilter = null;

        // Check for hover
        if (this.schematic) {
          const ndcX = (1 - indexTip.x) * 2 - 1;
          const ndcY = -(indexTip.y * 2 - 1);

          // Simple throttle for hover raycast
          const now = performance.now();
          if (now - handState.lastRaycastTime > this.RAYCAST_INTERVAL_MS) {
            this._tempNdc.set(ndcX, ndcY);
            this.raycaster.setFromCamera(this._tempNdc, this.camera);

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
   * Updates hover visual feedback on the schematic.
   *
   * Provides smooth, interpolated hover effects that differ based on state:
   * - **Assembled state**: Scales the entire schematic as one unit
   * - **Exploded state**: Scales only the individually hovered limb(s)
   *
   * Visual effects include:
   * - Scale pulse (1.0 → 1.08) on hover
   * - Opacity boost (+0.15) for better visibility
   * - Color transition to amber (#FFB347) for hovered elements
   *
   * @param isHovering - Whether any hand is currently hovering over the schematic
   * @param deltaTime - Time since last frame for smooth interpolation
   *
   * @remarks
   * Implements early-exit optimization when fully settled (no active hovers and
   * all intensities at zero) to avoid unnecessary updates each frame.
   */
  private updateHoverState(isHovering: boolean, deltaTime: number): void {
    // Performance: Early exit if no hover state change and fully settled
    const hasHoveredLimbs = this.hoveredLimbTypes.size > 0;
    const isSettled = this.hoverIntensity < 0.001;

    // Check if all limb intensities are also settled (near zero)
    let allLimbsSettled = true;
    if (!hasHoveredLimbs) {
      for (const intensity of this.limbHoverIntensities.values()) {
        if (intensity > 0.001) {
          allLimbsSettled = false;
          break;
        }
      }
    } else {
      allLimbsSettled = false;
    }

    // Skip update if nothing is hovering and all values are settled
    if (!isHovering && !hasHoveredLimbs && isSettled && allLimbsSettled) {
      return;
    }

    // Play hover audio feedback on state transition
    if (isHovering !== this.isHoveringSchematic) {
      if (isHovering) {
        // this.audioManager.play('hoverEnter');
      } else {
        // this.audioManager.play('hoverExit');
      }
    }

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

    // Use pre-allocated colors for hover effect (avoid per-frame allocations)
    const BASE_COLOR = this._hoverBaseColor;
    const HOVER_COLOR = this._hoverHighlightColor;

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
   * Handles browser window resize events.
   *
   * Updates camera aspect ratio, projection matrix, and renderer/composer
   * dimensions to match the new viewport size.
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
   * Updates the frames-per-second counter.
   *
   * Accumulates frame counts and calculates FPS once per second for stable
   * display values. The result is stored in `currentFps` for debug display.
   *
   * @param timestamp - Current timestamp from `performance.now()`
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
   * Collects debug information for the debug overlay.
   *
   * @returns Current state snapshot including FPS, hand count, element counts,
   *          and interaction states (grabbing, hovering, grab target).
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
   * Gets the current number of detected hands.
   *
   * @returns Number of hands currently tracked by MediaPipe (0-2)
   */
  getHandCount(): number {
    const result = this.handTracker.detectHands(performance.now());
    return result?.landmarks?.length ?? 0;
  }

  /**
   * Enables debug mode with visual overlays and info callback.
   *
   * When enabled:
   * - Hand landmark overlay renders MediaPipe landmark positions
   * - Debug callback receives `WorkshopDebugInfo` each frame
   *
   * @param callback - Function invoked each frame with current debug info
   */
  enableDebug(callback: (info: WorkshopDebugInfo) => void): void {
    this.debugCallback = callback;
    this.handLandmarkOverlay?.setEnabled(true);
  }

  /**
   * Disables debug mode and hides visual overlays.
   */
  disableDebug(): void {
    this.debugCallback = null;
    this.handLandmarkOverlay?.setEnabled(false);
  }

  /**
   * Resets the schematic to its original viewing orientation.
   *
   * Smoothly animates the body rotation back to the default pose (facing camera)
   * and clears any active rotation velocity. Does not affect exploded/assembled state.
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
   * Disposes all resources and cleans up the controller.
   *
   * Cleanup sequence:
   * 1. Dispose subsystems (ExplodedViewManager, ParticleTrailEmitter, HandLandmarkOverlay)
   * 2. Stop animation loop
   * 3. Remove window resize listener
   * 4. Dispose all Three.js geometries and materials
   * 5. Dispose post-processing composer
   * 6. Dispose WebGL renderer
   * 7. Remove canvas from DOM
   *
   * @remarks
   * After calling dispose(), the controller instance cannot be reused.
   * Create a new instance if the workshop needs to be restarted.
   */
  dispose(): void {
    // Dispose audio system
    this.audioManager.dispose();

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
