/**
 * VoxelBuilderController — Gesture Processing & Box Spawning Orchestrator
 *
 * Owns the animation loop, processes right-hand pinch gestures from
 * MediaPipe via the shared `GestureDetector`, maps pinch positions to 3D
 * world coordinates, and delegates to `VoxelGrid` (occupancy) and
 * `VoxelBuilderRenderer` (visuals).
 *
 * Depth (Z-axis) tracking uses apparent hand scale as a proxy for camera
 * distance, since MediaPipe's normalized landmark `z` only represents
 * depth within the hand skeleton relative to the wrist — it does not
 * track forward/backward body movement.
 *
 * Follows the established controller pattern
 * (`MagneticClutterController` reference).
 */

import * as THREE from 'three';
import { HandTracker } from '../shared/HandTracker';
import { GestureDetector } from '../shared/GestureDetector';
import {
  GestureType,
  GestureState,
  PinchGestureData,
  FistGestureData,
} from '../shared/GestureTypes';
import { HandLandmarkIndex } from '../shared/HandTypes';
import {
  VoxelBuilderConfig,
  DEFAULT_VOXEL_BUILDER_CONFIG,
  VoxelBuilderDebugInfo,
  VOXEL_PALETTES,
} from './types';
import { HandLandmarkOverlay } from '../shared/HandLandmarkOverlay';
import { VoxelGrid } from './VoxelGrid';
import { VoxelBuilderRenderer } from './VoxelBuilderRenderer';

/**
 * Sensitivity multiplier for hand-scale-based depth mapping.
 * Higher values amplify the Z-axis response to hand movement
 * toward/away from the camera.
 */
const DEPTH_SCALE_SENSITIVITY = 12;

/**
 * Exponential smoothing factor for hand scale measurements (0–1).
 * Lower values yield heavier smoothing, reducing jitter but adding
 * latency. 0.3 balances responsiveness with noise rejection.
 */
const DEPTH_SMOOTHING_FACTOR = 0.3;

/**
 * Rotation sensitivity in radians per unit of normalized screen movement.
 * Controls how fast the box group rotates when dragging with left pinch.
 * 4.0 ≈ ~230° for a full-width drag.
 */
const ROTATION_SENSITIVITY = 4.0;

/**
 * Speed of the position smoothing (Exponential Moving Average) in units/sec.
 * Higher = more responsive (less lag), Lower = smoother (less jitter).
 * 18.0 provides a good balance for hand interactions at 60 FPS.
 */
const POSITION_SMOOTHING_SPEED = 18.0;

export class VoxelBuilderController {
  private readonly container: HTMLElement;
  private readonly config: VoxelBuilderConfig;
  private readonly handTracker: HandTracker;
  private readonly gestureDetector: GestureDetector;
  private readonly grid: VoxelGrid;

  private renderer: VoxelBuilderRenderer | null = null;
  private debugOverlay: HandLandmarkOverlay | null = null;
  private animationFrameId: number | null = null;
  private lastTimestamp = 0;
  private isRunning = false;

  // Drawing state
  private isDrawing = false;
  private lastSpawnWorldPos = new THREE.Vector3();
  private smoothedPinchPos = new THREE.Vector3();
  private currentGridStr = '—';

  // Depth tracking via hand scale
  /** Hand scale recorded at pinch start — serves as the Z=0 reference */
  private referenceHandScale = 0;
  /** Smoothed hand scale to filter out high-frequency jitter */
  private smoothedHandScale = 0;

  // Rotation state (left-hand pinch orbit)
  private isRotating = false;
  /** Normalized screen position when left pinch started or was last sampled */
  private rotationPrevPos = { x: 0, y: 0 };

  // Erase mode (left-hand fist)
  /** Whether erase mode is currently active */
  private eraseMode = false;

  // Color palette cycling
  /** Index into `VOXEL_PALETTES` for the currently active theme */
  private paletteIndex = 0;

  // FPS tracking
  private frameCount = 0;
  private lastFpsUpdate = 0;
  private currentFps = 60;

  // Performance warning
  private lowFpsAccumulator = 0;
  private performanceWarning = false;

  // Debug
  private debugCallback: ((info: VoxelBuilderDebugInfo) => void) | null = null;
  private lastHandCount = 0;

  constructor(
    handTracker: HandTracker,
    container: HTMLElement,
    config: Partial<VoxelBuilderConfig> = {}
  ) {
    this.handTracker = handTracker;
    this.container = container;
    this.config = { ...DEFAULT_VOXEL_BUILDER_CONFIG, ...config };
    this.gestureDetector = new GestureDetector();
    this.grid = new VoxelGrid(this.config.cellSize, this.config.maxBoxes);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Create the renderer and prepare the scene. */
  initialize(): void {
    if (this.renderer) return;

    this.renderer = new VoxelBuilderRenderer(this.container, this.config, this.grid);
    this.renderer.initialize();

    // Initialize debug overlay (hidden by default)
    this.debugOverlay = new HandLandmarkOverlay(this.container);

    // Throttle hand detection to ~30 FPS to save CPU budget for rendering
    this.handTracker.setDetectionIntervalMs(33);

    console.log('[VoxelBuilder] Initialized');
  }

  /** Begin the animation loop. */
  start(): void {
    if (this.isRunning) return;
    if (!this.renderer) this.initialize();

    this.isRunning = true;
    this.lastTimestamp = performance.now();
    this.loop();

    console.log('[VoxelBuilder] Started');
  }

  /** Pause the animation loop and restore hand-detection interval. */
  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    this.handTracker.setDetectionIntervalMs(0);
  }

  /** Full clean-up — release all resources. */
  dispose(): void {
    this.stop();
    this.renderer?.dispose();
    this.renderer = null;
    this.debugOverlay?.dispose();
    this.debugOverlay = null;
    this.gestureDetector.reset();
    this.grid.clear();
  }

  /** Clear all placed boxes, reset the grid, and restore defaults. */
  reset(): void {
    this.grid.clear();
    this.renderer?.clearBoxes();
    this.renderer?.resetRotation();
    this.isDrawing = false;
    this.isRotating = false;
    this.eraseMode = false;
    this.renderer?.setEraseMode(false);
    this.performanceWarning = false;
    this.lowFpsAccumulator = 0;
    this.referenceHandScale = 0;
    this.smoothedHandScale = 0;
    console.log('[VoxelBuilder] Reset');
  }

  // ---------------------------------------------------------------------------
  // Debug
  // ---------------------------------------------------------------------------

  enableDebug(callback: (info: VoxelBuilderDebugInfo) => void): void {
    this.config.debug = true;
    this.debugCallback = callback;
    this.debugOverlay?.setEnabled(true);
  }

  disableDebug(): void {
    this.config.debug = false;
    this.debugCallback = null;
    this.debugOverlay?.setEnabled(false);
  }

  /** @returns Number of hands detected on the most recent frame */
  getHandCount(): number {
    return this.lastHandCount;
  }

  // ---------------------------------------------------------------------------
  // Animation loop
  // ---------------------------------------------------------------------------

  private loop = (): void => {
    if (!this.isRunning) return;

    const now = performance.now();
    const dtSec = Math.min((now - this.lastTimestamp) / 1000, 0.1);
    this.lastTimestamp = now;

    // FPS calculation
    this.frameCount++;
    if (now - this.lastFpsUpdate >= 1000) {
      this.currentFps = this.frameCount;
      this.frameCount = 0;
      this.lastFpsUpdate = now;

      // Performance guard — accumulate seconds of low FPS
      this.updatePerformanceWarning(dtSec);
    }

    // 1. Process hand gestures
    this.processHands(now, dtSec);

    // 2. Render
    this.renderer?.render(now);

    // 3. Emit debug info
    if (this.config.debug) {
      this.debugOverlay?.update(this.handTracker.getLastResult());

      if (this.debugCallback) {
        this.debugCallback({
          fps: this.currentFps,
          handsDetected: this.lastHandCount,
          boxCount: this.grid.count,
          isDrawing: this.isDrawing,
          gridPosition: this.currentGridStr,
          performanceWarning: this.performanceWarning,
          eraseMode: this.eraseMode,
          palette: VOXEL_PALETTES[this.paletteIndex].name,
        });
      }
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  // ---------------------------------------------------------------------------
  // Performance monitoring
  // ---------------------------------------------------------------------------

  /**
   * Track how long the FPS stays below the warning threshold.
   * If it persists for `fpsWarningDurationSec`, block further spawning.
   */
  private updatePerformanceWarning(_dtSec: number): void {
    if (this.currentFps < this.config.fpsWarningThreshold && this.grid.count > 0) {
      this.lowFpsAccumulator += 1; // Approximate — called once per second
      if (this.lowFpsAccumulator >= this.config.fpsWarningDurationSec) {
        this.performanceWarning = true;
      }
    } else {
      // FPS recovered — reset accumulator but keep the warning flag
      // once set so users know to reduce complexity
      this.lowFpsAccumulator = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // Hand / gesture processing
  // ---------------------------------------------------------------------------

  private processHands(timestamp: number, dt: number): void {
    const result = this.handTracker.detectHands(timestamp);

    if (!result || result.landmarks.length === 0) {
      this.lastHandCount = 0;
      this.endDrawing();
      return;
    }

    this.lastHandCount = result.landmarks.length;

    const handednessStr = result.handedness.map(
      (h) => (h[0]?.categoryName?.toLowerCase() as 'left' | 'right' | 'unknown') || 'unknown'
    );

    // Identify the right hand's landmark array index for depth calculation
    const rightHandIndex = handednessStr.indexOf('right');

    const gestureResult = this.gestureDetector.detect(result.landmarks, handednessStr, timestamp);

    let rightPinchHandled = false;
    let leftPinchHandled = false;
    let fistHandled = false;

    for (const event of gestureResult.events) {
      const { type, state, data } = event;

      // Index-pinch events (drawing / rotation)
      if (type === GestureType.PINCH) {
        const pinchData = data as PinchGestureData;

        if (pinchData.handedness === 'right') {
          rightPinchHandled = true;
          const targetPos = this.computeDepthCorrectedPosition(
            pinchData,
            rightHandIndex >= 0 ? result.landmarks[rightHandIndex] : null,
            state
          );

          // Apply time-based smoothing to the final world position
          if (state === GestureState.STARTED) {
            this.smoothedPinchPos.copy(targetPos);
          } else {
            // Alpha = 1 - e^(-lambda * dt) for frame-rate independent smoothing
            const alpha = 1 - Math.exp(-POSITION_SMOOTHING_SPEED * dt);
            this.smoothedPinchPos.lerp(targetPos, alpha);
          }

          this.handleRightPinch(state, this.smoothedPinchPos.clone());
        } else if (pinchData.handedness === 'left') {
          leftPinchHandled = true;
          this.handleLeftPinch(state, pinchData);
        }
      }

      // Fist events (erase mode toggle)
      if (type === GestureType.FIST) {
        const fistData = data as FistGestureData;
        if (fistData.handedness === 'left') {
          fistHandled = true;
          this.handleLeftFist(state);
        }
      }

      // Pinky pinch events (palette cycling)
      if (type === GestureType.PINKY_PINCH) {
        if (state === GestureState.STARTED) {
          this.cyclePalette();
        }
      }
    }

    // If no right-hand pinch event was emitted this frame, end drawing
    if (!rightPinchHandled && this.isDrawing) {
      this.endDrawing();
    }

    // If no left-hand pinch event was emitted this frame, end rotation
    if (!leftPinchHandled && this.isRotating) {
      this.isRotating = false;
    }

    // If no left fist event was emitted this frame, deactivate erase mode
    if (!fistHandled && this.eraseMode) {
      this.eraseMode = false;
      this.renderer?.setEraseMode(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Depth estimation via hand scale
  // ---------------------------------------------------------------------------

  /**
   * Handle a left-hand pinch gesture for build group rotation.
   *
   * Maps the 2D drag delta (in normalized screen coordinates) to
   * Y-axis (horizontal turntable) and X-axis (vertical tilt) rotation
   * on the build group.
   *
   * STARTED → capture initial position
   * ACTIVE  → compute delta from previous frame → apply group rotation
   * ENDED   → stop rotation
   *
   * @param state - Gesture lifecycle state
   * @param data - Pinch data with normalized screen position
   */
  private handleLeftPinch(state: GestureState, data: PinchGestureData): void {
    if (state === GestureState.STARTED) {
      this.isRotating = true;
      this.rotationPrevPos = {
        x: data.normalizedPosition.x,
        y: data.normalizedPosition.y,
      };
      return;
    }

    if (state === GestureState.ACTIVE && this.isRotating) {
      const dx = data.normalizedPosition.x - this.rotationPrevPos.x;
      const dy = data.normalizedPosition.y - this.rotationPrevPos.y;

      // Horizontal drag → Y-axis turntable; vertical drag → X-axis tilt
      this.renderer?.applyRotationDelta(-dx * ROTATION_SENSITIVITY, dy * ROTATION_SENSITIVITY);

      this.rotationPrevPos = {
        x: data.normalizedPosition.x,
        y: data.normalizedPosition.y,
      };
      return;
    }

    if (state === GestureState.ENDED) {
      this.isRotating = false;
    }
  }

  /**
   * Compute a world position with reliable Z-axis tracking.
   *
   * MediaPipe's normalized `z` coordinate represents fingertip depth
   * relative to the wrist — it does NOT vary with forward/backward hand
   * movement relative to the camera. Instead, we use **apparent hand
   * scale** (2D distance between wrist and middle finger MCP) as a proxy:
   *
   * - Hand closer to camera → landmarks spread apart → larger scale
   * - Hand farther from camera → landmarks compress → smaller scale
   *
   * On pinch start, the current hand scale is captured as a reference.
   * During the active pinch, the delta from that reference is mapped
   * to a Z offset with exponential smoothing to reject jitter.
   *
   * @param data - Pinch gesture data with X/Y world coordinates
   * @param landmarks - Raw normalized landmarks for the right hand
   * @param state - Current gesture state (STARTED, ACTIVE, ENDED)
   * @returns World-space position with corrected Z coordinate
   */
  private computeDepthCorrectedPosition(
    data: PinchGestureData,
    landmarks: Array<{ x: number; y: number; z: number }> | null,
    state: GestureState
  ): THREE.Vector3 {
    const pos = data.position.clone();

    if (!landmarks) return pos;

    const rawScale = this.computeHandScale(landmarks);
    if (rawScale <= 0) return pos;

    // Apply exponential smoothing to reduce frame-to-frame jitter
    if (this.smoothedHandScale === 0 || state === GestureState.STARTED) {
      this.smoothedHandScale = rawScale;
    } else {
      this.smoothedHandScale =
        DEPTH_SMOOTHING_FACTOR * rawScale + (1 - DEPTH_SMOOTHING_FACTOR) * this.smoothedHandScale;
    }

    if (state === GestureState.STARTED) {
      // Capture baseline scale — this defines Z=0 for the current stroke
      this.referenceHandScale = this.smoothedHandScale;
      pos.z = 0;
    } else if (this.referenceHandScale > 0) {
      // Relative scale change: positive = hand moved closer, negative = farther
      const scaleDelta = this.smoothedHandScale - this.referenceHandScale;
      // Normalize by reference scale for proportional sensitivity
      const normalizedDelta = scaleDelta / this.referenceHandScale;
      pos.z = normalizedDelta * DEPTH_SCALE_SENSITIVITY;
    }

    return pos;
  }

  /**
   * Compute apparent hand size from wrist to middle finger MCP.
   *
   * Uses 2D Euclidean distance in normalized image coordinates,
   * which scales proportionally with camera distance.
   *
   * @param landmarks - Normalized hand landmarks (21 points)
   * @returns 2D distance between wrist (landmark 0) and middle finger MCP (landmark 9)
   */
  private computeHandScale(landmarks: Array<{ x: number; y: number; z: number }>): number {
    const wrist = landmarks[HandLandmarkIndex.WRIST];
    const middleMcp = landmarks[HandLandmarkIndex.MIDDLE_FINGER_MCP];

    if (!wrist || !middleMcp) return 0;

    const dx = wrist.x - middleMcp.x;
    const dy = wrist.y - middleMcp.y;

    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---------------------------------------------------------------------------
  // Pinch handling
  // ---------------------------------------------------------------------------

  /**
   * Handle a right-hand pinch gesture event through its lifecycle.
   *
   * Pinch positions arrive in world space. Before grid-snapping, they are
   * transformed into the build group's local coordinate system using the
   * inverse group quaternion. This ensures boxes are placed correctly
   * regardless of the current rotation angle.
   *
   * STARTED → place or erase first box at pinch location
   * ACTIVE  → spawn/erase additional boxes when hand moves ≥ spawnDistance
   * ENDED   → hide ghost preview and stop spawning
   */
  private handleRightPinch(state: GestureState, worldPos: THREE.Vector3): void {
    // Transform from world space into the build group's local space
    // so grid-snapping and box placement align with the rotated group
    const localPos = worldPos.clone();
    const inverseQuat = this.renderer?.getInverseGroupQuaternion();
    if (inverseQuat) {
      localPos.applyQuaternion(inverseQuat);
    }

    // Snap to grid in local space
    const gridPos = this.grid.worldToGrid(localPos);
    const snappedLocalPos = this.grid.gridToWorld(gridPos);
    this.currentGridStr = `${gridPos.gx}, ${gridPos.gy}, ${gridPos.gz}`;

    if (state === GestureState.STARTED) {
      this.isDrawing = true;
      this.renderer?.updateGhostPreview(snappedLocalPos, true);

      if (this.eraseMode) {
        this.tryEraseBox(gridPos.gx, gridPos.gy, gridPos.gz);
      } else {
        this.trySpawnBox(gridPos.gx, gridPos.gy, gridPos.gz, snappedLocalPos);
      }
      return;
    }

    if (state === GestureState.ACTIVE) {
      this.renderer?.updateGhostPreview(snappedLocalPos, true);

      // Distance-based spawn/erase gating (compared in local space)
      const dist = localPos.distanceTo(this.lastSpawnWorldPos);
      if (dist >= this.config.spawnDistance) {
        if (this.eraseMode) {
          this.tryEraseBox(gridPos.gx, gridPos.gy, gridPos.gz);
        } else {
          this.trySpawnBox(gridPos.gx, gridPos.gy, gridPos.gz, snappedLocalPos);
        }
      }
      return;
    }

    if (state === GestureState.ENDED) {
      this.endDrawing();
    }
  }

  /**
   * Attempt to place a box at the given grid cell.
   * Skips placement if the cell is occupied, at capacity, or performance-warned.
   */
  private trySpawnBox(gx: number, gy: number, gz: number, worldPos: THREE.Vector3): void {
    if (this.performanceWarning) return;

    const added = this.grid.add(gx, gy, gz);
    if (!added) return;

    this.renderer?.addBox(gx, gy, gz);
    this.lastSpawnWorldPos.copy(worldPos);
  }

  /**
   * Attempt to erase the box at the given grid cell.
   * Removes both the grid occupancy and the visual representation.
   */
  private tryEraseBox(gx: number, gy: number, gz: number): void {
    const removed = this.grid.remove(gx, gy, gz);
    if (!removed) return;

    this.renderer?.removeBox(gx, gy, gz);
  }

  // ---------------------------------------------------------------------------
  // Fist handling (erase mode)
  // ---------------------------------------------------------------------------

  /**
   * Handle left-hand fist gesture for toggling erase mode.
   *
   * While the left fist is held, the ghost preview turns red and
   * right-hand pinch gestures delete voxels instead of placing them.
   */
  private handleLeftFist(state: GestureState): void {
    if (state === GestureState.STARTED || state === GestureState.ACTIVE) {
      if (!this.eraseMode) {
        this.eraseMode = true;
        this.renderer?.setEraseMode(true);
      }
    } else if (state === GestureState.ENDED) {
      this.eraseMode = false;
      this.renderer?.setEraseMode(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Palette cycling
  // ---------------------------------------------------------------------------

  /** Advance to the next color palette and apply it to the scene. */
  private cyclePalette(): void {
    this.paletteIndex = (this.paletteIndex + 1) % VOXEL_PALETTES.length;
    this.renderer?.setPalette(VOXEL_PALETTES[this.paletteIndex]);
  }

  /** End the current drawing stroke and hide the ghost preview. */
  private endDrawing(): void {
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.renderer?.updateGhostPreview(new THREE.Vector3(), false);
  }
}
