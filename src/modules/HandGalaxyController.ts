/**
 * HandGalaxyController Module
 * Bridge between hand tracking and galaxy rendering
 * Handles coordinate transformation, smoothing, and interaction logic
 *
 * Phase 3.2 Enhancement:
 * - Pinch gesture → Mini star burst
 */

import * as THREE from 'three';
import {
  HandLandmarkerResult,
  NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import { HandTracker } from './HandTracker';
import { GalaxyRenderer } from './GalaxyRenderer';
import { GestureDetector } from './GestureDetector';
import { StarBurstEffect } from './StarBurstEffect';
import { HandLandmarkIndex } from './types/HandTypes';
import {
  GestureState,
  Handedness,
  PinchGestureEvent,
} from './types/GestureTypes';
import { ExplosionState } from './types/GalaxyTypes';
import {
  distance3D,
  midpoint3D,
  normalizedToWorld,
  mapDistanceToScale,
} from '../utils/math';
import {
  ScalarSmoother,
  Vector3Smoother,
  EulerSmoother,
} from '../utils/smoothing';

/**
 * Interaction configuration
 */
interface InteractionConfig {
  /** Minimum hand distance for galaxy to appear (normalized) */
  minHandDistance: number;
  /** Maximum hand distance for full galaxy size (normalized) */
  maxHandDistance: number;
  /** Smoothing factor for scale (0-1) */
  scaleSmoothingFactor: number;
  /** Smoothing factor for position (0-1) */
  positionSmoothingFactor: number;
  /** Smoothing factor for rotation (0-1) */
  rotationSmoothingFactor: number;
  /** Grace period in ms to keep galaxy visible after losing hands */
  gracePeriodMs: number;
  /** Enable Phase 3.2 pinch gesture feature */
  enableGestures: boolean;
}

const DEFAULT_INTERACTION_CONFIG: InteractionConfig = {
  minHandDistance: 0.06,
  maxHandDistance: 0.35,
  scaleSmoothingFactor: 0.2, // Smooth resizing
  positionSmoothingFactor: 0.25, // Smooth positioning
  rotationSmoothingFactor: 0.2, // Smooth rotation
  gracePeriodMs: 500,
  enableGestures: true, // Phase 3.2: Pinch → Star Burst
};

/**
 * HandGalaxyController - Manages interaction between hands and galaxy
 *
 * Phase 3.2 Feature:
 * - Pinch: Thumb+Index pinch triggers star burst effect
 */
export class HandGalaxyController {
  private handTracker: HandTracker;
  private galaxyRenderer: GalaxyRenderer;
  private config: InteractionConfig;

  // Phase 3.2: Gesture detection and effects
  private gestureDetector: GestureDetector;
  private starBurstEffect: StarBurstEffect | null = null;

  // Smoothers for stable tracking
  private scaleSmoother: ScalarSmoother;
  private positionSmoother: Vector3Smoother;
  private rotationSmoother: EulerSmoother;

  // State tracking
  private lastHandsDetectedTime: number = 0;
  private isGalaxyActive: boolean = false;
  private lastTimestamp: number = 0;
  private lastHandCount: number = 0;

  // Explosion lifecycle tracking
  private hasExplodedThisLife: boolean = false; // Track if current galaxy has exploded
  // @ts-ignore - Reserved for future lifecycle features
  private lastGalaxyActivationTime: number = 0; // When galaxy was last shown

  // Debug state
  private debugEnabled: boolean = false;
  private debugCallback: ((info: DebugInfo) => void) | null = null;

  /**
   * Calculate palm center from the four MCP (Metacarpophalangeal) knuckles
   * This provides a more accurate hand center than just the wrist
   */
  private getPalmCenter(landmarks: NormalizedLandmark[]): NormalizedLandmark {
    const indexMCP = landmarks[HandLandmarkIndex.INDEX_FINGER_MCP];
    const middleMCP = landmarks[HandLandmarkIndex.MIDDLE_FINGER_MCP];
    const ringMCP = landmarks[HandLandmarkIndex.RING_FINGER_MCP];
    const pinkyMCP = landmarks[HandLandmarkIndex.PINKY_MCP];

    return {
      x: (indexMCP.x + middleMCP.x + ringMCP.x + pinkyMCP.x) / 4,
      y: (indexMCP.y + middleMCP.y + ringMCP.y + pinkyMCP.y) / 4,
      z: (indexMCP.z + middleMCP.z + ringMCP.z + pinkyMCP.z) / 4,
      visibility:
        (indexMCP.visibility! +
          middleMCP.visibility! +
          ringMCP.visibility! +
          pinkyMCP.visibility!) /
        4,
    };
  }

  constructor(
    handTracker: HandTracker,
    galaxyRenderer: GalaxyRenderer,
    config: Partial<InteractionConfig> = {}
  ) {
    this.handTracker = handTracker;
    this.galaxyRenderer = galaxyRenderer;
    this.config = { ...DEFAULT_INTERACTION_CONFIG, ...config };

    // Initialize smoothers
    this.scaleSmoother = new ScalarSmoother(
      0,
      this.config.scaleSmoothingFactor
    );
    this.positionSmoother = new Vector3Smoother(
      new THREE.Vector3(0, 0, 0),
      this.config.positionSmoothingFactor
    );
    this.rotationSmoother = new EulerSmoother(
      new THREE.Euler(0, 0, 0),
      this.config.rotationSmoothingFactor
    );

    // Phase 3.2: Initialize gesture detector
    this.gestureDetector = new GestureDetector();
  }

  /**
   * Initialize Phase 3.2 star burst effect (must be called after GalaxyRenderer.initialize())
   * This sets up the StarBurst effect in the scene
   *
   * @param scene - Three.js scene from GalaxyRenderer
   */
  initializeEffects(scene: THREE.Scene): void {
    if (!this.config.enableGestures) return;

    // Initialize star burst effect for pinch gesture
    this.starBurstEffect = new StarBurstEffect(
      scene,
      {
        particleCount: 300, // Optimized particle count
        duration: 1.5,
        initialVelocity: 2.5,
        color: new THREE.Color(0xffffff),
      },
      3
    ); // Max 3 concurrent bursts

    console.log(
      '[HandGalaxyController] Phase 3.2 star burst effect initialized'
    );
  }

  /**
   * Main update method - call this every frame
   * @param timestamp - Current timestamp from requestAnimationFrame
   */
  update(timestamp: number): void {
    // Calculate delta time
    const deltaTime =
      this.lastTimestamp > 0 ? (timestamp - this.lastTimestamp) / 1000 : 0;
    this.lastTimestamp = timestamp;

    // Update galaxy animation time
    this.galaxyRenderer.updateTime(deltaTime);

    // Update Phase 3.2 star burst effect
    if (this.config.enableGestures && this.starBurstEffect) {
      this.starBurstEffect.update(deltaTime);
    }

    // Detect hands
    const result = this.handTracker.detectHands(timestamp);

    // Track hand count for status
    this.lastHandCount = result?.landmarks.length ?? 0;

    // Process hand detection results
    if (result && result.landmarks.length >= 2) {
      // Two hands detected
      this.lastHandsDetectedTime = timestamp;
      this.processHandInteraction(result, timestamp);

      // Phase 3.2: Process gestures only when galaxy is active (two hands)
      if (this.config.enableGestures) {
        this.processGestures(result, timestamp);
      }
    } else if (result && result.landmarks.length === 1) {
      // Single hand - treat as no hands (galaxy needs two hands)
      this.handleNoHands(timestamp);
    } else {
      // No hands detected - check grace period
      this.handleNoHands(timestamp);
    }

    // Render the galaxy
    this.galaxyRenderer.render();
  }

  /**
   * Process Phase 3.2 gesture (pinch only)
   */
  private processGestures(
    result: HandLandmarkerResult,
    timestamp: number
  ): void {
    // Extract handedness from result
    const handedness: Handedness[] = result.handedness.map((h) => {
      const category = h[0]?.categoryName?.toLowerCase();
      return category === 'left' || category === 'right' ? category : 'unknown';
    });

    // Run gesture detection
    const gestureResult = this.gestureDetector.detect(
      result.landmarks,
      handedness,
      timestamp
    );

    // Process pinch gesture → Star Burst (Phase 3.2)
    if (gestureResult.pinch) {
      this.handlePinchGesture(gestureResult.pinch);
    }
  }

  /**
   * Handle pinch gesture - trigger star burst effect
   * Per DESIGN-v2.md Phase 3.2
   * Only triggers when galaxy is visible, active, and in normal state (not exploding)
   */
  private handlePinchGesture(event: PinchGestureEvent): void {
    if (
      event.state === GestureState.STARTED &&
      this.starBurstEffect &&
      this.isGalaxyActive &&
      this.galaxyRenderer.isVisible() &&
      this.galaxyRenderer.getExplosionState() === ExplosionState.NORMAL
    ) {
      console.log(
        `[HandGalaxyController] Pinch detected (${event.data.handedness}) - triggering star burst`
      );
      this.starBurstEffect.trigger(event.data.position);
    }
  }

  /**
   * Get the number of hands detected in the last frame
   */
  getHandCount(): number {
    return this.lastHandCount;
  }

  /**
   * Process interaction when two hands are detected
   */
  private processHandInteraction(
    result: HandLandmarkerResult,
    _timestamp: number
  ): void {
    // Get palm center positions for both hands (average of MCP knuckles)
    const palm1 = this.getPalmCenter(result.landmarks[0]);
    const palm2 = this.getPalmCenter(result.landmarks[1]);

    // Calculate hand distance (normalized coordinates)
    const distance = distance3D(palm1, palm2);

    // Update galaxy renderer with current hand distance for gravitational lensing
    this.galaxyRenderer.setHandDistance(distance);

    // Map distance to scale
    const targetScale = mapDistanceToScale(
      distance,
      this.config.minHandDistance,
      this.config.maxHandDistance
    );

    // Smooth the scale
    const smoothedScale = this.scaleSmoother.update(targetScale);

    // === BIG BANG EXPLOSION TRIGGER ===
    // Trigger when galaxy shrinks to critical mass (hands close but still tracked)
    // Only trigger once per galaxy lifecycle - not repeatedly
    if (
      smoothedScale < 0.01 &&
      smoothedScale > 0 &&
      !this.hasExplodedThisLife
    ) {
      console.log(
        `[HandGalaxyController] Critical mass! scale=${smoothedScale.toFixed(
          3
        )} - Triggering explosion!`
      );
      this.galaxyRenderer.triggerExplosion();
      this.hasExplodedThisLife = true; // Mark this galaxy as exploded
    }

    // === BLOCK UPDATES DURING EXPLOSION ===
    // During explosion (singularity → exploding → fading), ignore hand input
    // This prevents overlap and ensures clean cycle: explosion → clear screen → rebirth
    const explosionState = this.galaxyRenderer.getExplosionState();
    if (explosionState !== 0) {
      // 0 = ExplosionState.NORMAL
      // Explosion in progress - skip all normal updates
      return;
    }

    // Calculate midpoint in normalized coordinates (galaxy center at palm midpoint)
    const midpointNorm = midpoint3D(palm1, palm2);

    // Convert to world space for rendering
    const worldMidpoint = normalizedToWorld({
      x: midpointNorm.x,
      y: midpointNorm.y,
      z: midpointNorm.z,
    });

    // Smooth the position
    const smoothedPosition = this.positionSmoother.update(worldMidpoint);

    // Calculate rotation based on the axis between hands
    // This creates a more intuitive "galaxy between hands" effect
    const rotation = this.calculateAxisBasedRotation(palm1, palm2);
    const smoothedRotation = this.rotationSmoother.update(rotation);

    // Update galaxy state
    const shouldShow = smoothedScale > 0.01;

    if (shouldShow && !this.isGalaxyActive) {
      this.galaxyRenderer.setVisible(true);
      this.isGalaxyActive = true;
      // Reset explosion flag for new galaxy lifecycle
      this.hasExplodedThisLife = false;
      this.lastGalaxyActivationTime = performance.now();
      console.log(
        '[HandGalaxyController] New galaxy spawned - lifecycle reset'
      );
    }

    // Apply transforms
    this.galaxyRenderer.setScale(smoothedScale);
    this.galaxyRenderer.setPosition(
      smoothedPosition.x,
      smoothedPosition.y,
      smoothedPosition.z
    );
    this.galaxyRenderer.setRotation(smoothedRotation);

    // Debug output
    if (this.debugEnabled && this.debugCallback) {
      this.debugCallback({
        handsDetected: 2,
        distance,
        scale: smoothedScale,
        position: smoothedPosition,
        rotation: smoothedRotation,
      });
    }
  }

  /**
   * Handle case when less than two hands are detected
   */
  private handleNoHands(timestamp: number): void {
    const timeSinceLastHands = timestamp - this.lastHandsDetectedTime;

    // === EXPLOSION TRIGGER: Hands closed together ===
    // If we just lost hands AND scale was very small, hands likely closed together
    // MediaPipe loses tracking when hands overlap - trigger explosion!
    const currentScale = this.scaleSmoother.value;
    if (this.lastHandCount === 2 && currentScale < 0.3) {
      console.log(
        '[HandGalaxyController] Hands lost while close - triggering explosion!'
      );
      this.galaxyRenderer.triggerExplosion();
      // Don't fade out - let explosion play
      return;
    }

    if (timeSinceLastHands > this.config.gracePeriodMs) {
      // Grace period expired - fade out galaxy
      const fadeScale = this.scaleSmoother.update(0);

      if (fadeScale < 0.01 && this.isGalaxyActive) {
        this.galaxyRenderer.setVisible(false);
        this.isGalaxyActive = false;
      } else {
        this.galaxyRenderer.setScale(fadeScale);
      }
    }
    // Within grace period - keep galaxy visible at current state

    // Debug output
    if (this.debugEnabled && this.debugCallback) {
      this.debugCallback({
        handsDetected: 0,
        distance: 0,
        scale: this.scaleSmoother.value,
        position: this.positionSmoother.value,
        rotation: this.rotationSmoother.value,
      });
    }
  }

  /**
   * Calculate rotation based on the axis between two palms
   * This creates an intuitive "galaxy disc between hands" effect
   * The galaxy disc aligns perpendicular to the hand-to-hand axis
   */
  private calculateAxisBasedRotation(
    palm1: { x: number; y: number; z: number },
    palm2: { x: number; y: number; z: number }
  ): THREE.Euler {
    // Vector from hand1 to hand2
    const handAxis = new THREE.Vector3(
      palm2.x - palm1.x,
      -(palm2.y - palm1.y), // Flip Y for screen-to-3D conversion
      palm2.z - palm1.z
    );

    // Default up vector
    const worldUp = new THREE.Vector3(0, 1, 0);

    // Calculate the right vector perpendicular to hand axis and up
    const right = new THREE.Vector3()
      .crossVectors(worldUp, handAxis)
      .normalize();

    // If hands are vertically aligned, use different reference
    if (right.length() < 0.1) {
      right.set(1, 0, 0);
    }

    // Calculate the proper up vector
    const up = new THREE.Vector3().crossVectors(handAxis, right).normalize();

    // The galaxy disc should be perpendicular to the hand axis
    // We want the disc to "face" the camera somewhat, with a slight tilt
    // Add a base tilt so the spiral is always visible
    const baseTilt = Math.PI * 0.35; // ~63 degrees from horizontal - shows spiral nicely

    // Create rotation that aligns galaxy disc perpendicular to hand axis
    const matrix = new THREE.Matrix4();
    const forward = handAxis.clone().normalize();
    matrix.makeBasis(right, up, forward);

    const euler = new THREE.Euler().setFromRotationMatrix(matrix);

    // Add the base tilt to show the spiral pattern
    euler.x += baseTilt;

    return euler;
  }

  /**
   * Set distance thresholds
   */
  setDistanceThresholds(min: number, max: number): void {
    this.config.minHandDistance = min;
    this.config.maxHandDistance = max;
  }

  /**
   * Set smoothing factor (0-1)
   */
  setSmoothingFactor(factor: number): void {
    this.scaleSmoother.setSmoothingFactor(factor);
    this.positionSmoother.setSmoothingFactor(factor);
    this.rotationSmoother.setSmoothingFactor(factor);
  }

  /**
   * Enable debug mode with callback
   */
  enableDebug(callback: (info: DebugInfo) => void): void {
    this.debugEnabled = true;
    this.debugCallback = callback;
  }

  /**
   * Disable debug mode
   */
  disableDebug(): void {
    this.debugEnabled = false;
    this.debugCallback = null;
  }

  /**
   * Reset controller state
   */
  reset(): void {
    this.scaleSmoother.reset(0);
    this.positionSmoother.reset(new THREE.Vector3(0, 0, 0));
    this.rotationSmoother.reset(new THREE.Euler(0, 0, 0));
    this.lastHandsDetectedTime = 0;
    this.isGalaxyActive = false;
    this.galaxyRenderer.setVisible(false);
    this.galaxyRenderer.setScale(0);

    // Reset Phase 3.2 components
    this.gestureDetector.reset();
    this.starBurstEffect?.clear();
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    // Clean up Phase 3.2 star burst effect
    this.starBurstEffect?.dispose();
    this.starBurstEffect = null;
  }
}

/**
 * Debug information interface
 */
export interface DebugInfo {
  handsDetected: number;
  distance: number;
  scale: number;
  position: THREE.Vector3;
  rotation: THREE.Euler;
}
