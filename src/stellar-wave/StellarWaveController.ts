/**
 * StellarWaveController
 *
 * Orchestrates the Stellar Wave interactive mode by coordinating hand tracking,
 * gesture detection, and visual ripple effects. It manages the lifecycle of the
 * interaction from initialization to disposal.
 */

import { HandTracker } from '../shared/HandTracker';
import { GestureDetector } from '../shared/GestureDetector';
import {
  GestureType,
  GestureState,
  type Handedness,
  type PinchGestureData,
  type FistGestureData,
  type MiddlePinchGestureData,
  type RingPinchGestureData,
  type PinkyPinchGestureData,
} from '../shared/GestureTypes';
import { HandLandmarkOverlay } from '../shared/HandLandmarkOverlay';
import { StellarWaveRenderer } from './StellarWaveRenderer';
import { StellarWaveAudioManager } from './StellarWaveAudioManager';
import {
  DEFAULT_STELLAR_WAVE_CONFIG,
  StellarWaveState,
  QuasarSurgePhase,
  type StellarWaveConfig,
  type StellarWaveDebugInfo,
} from './types';

/**
 * StellarWaveController - Main controller for the Stellar Wave mode
 *
 * Manages the complete lifecycle of the dot grid visualization including
 * initialization, hand tracking, gesture detection, and rendering.
 */
export class StellarWaveController {
  private readonly handTracker: HandTracker;
  private readonly container: HTMLElement;
  private readonly config: StellarWaveConfig;

  private renderer: StellarWaveRenderer | null = null;
  private gestureDetector: GestureDetector;
  private landmarkOverlay: HandLandmarkOverlay | null = null;
  private audioManager: StellarWaveAudioManager | null = null;

  // Animation loop state
  private animationFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private state: StellarWaveState = StellarWaveState.UNINITIALIZED;

  // Debug mode
  private debugEnabled: boolean = false;
  private debugCallback: ((info: StellarWaveDebugInfo) => void) | null = null;

  // Performance tracking
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 60;

  // Hand count tracking for status
  private lastHandCount: number = 0;

  /**
   * Create a new StellarWaveController instance
   * @param handTracker - Shared hand tracking instance
   * @param container - Parent container element for the renderer
   * @param config - Optional configuration overrides
   */
  constructor(
    handTracker: HandTracker,
    container: HTMLElement,
    config: Partial<StellarWaveConfig> = {}
  ) {
    this.handTracker = handTracker;
    this.container = container;
    this.config = { ...DEFAULT_STELLAR_WAVE_CONFIG, ...config };

    // Initialize gesture detector for pinch detection
    this.gestureDetector = new GestureDetector();
  }

  /**
   * Initialize the Stellar Wave mode
   * Sets up the renderer and prepares for interaction
   */
  initialize(): void {
    if (this.state !== StellarWaveState.UNINITIALIZED) {
      console.warn('[StellarWaveController] Already initialized');
      return;
    }

    // Create renderer
    this.renderer = new StellarWaveRenderer(this.container, this.config);
    this.renderer.initialize();

    // Create landmark overlay (debug visualization)
    this.landmarkOverlay = new HandLandmarkOverlay(this.container);
    this.landmarkOverlay.setEnabled(this.debugEnabled);

    // Initialize audio manager for ripple sounds
    this.audioManager = new StellarWaveAudioManager();
    this.audioManager.initialize();

    this.state = StellarWaveState.READY;
    console.log('[StellarWaveController] Initialized');
  }

  /**
   * Enable debug mode with callback for performance metrics
   * @param callback - Function to receive debug information each frame
   */
  enableDebug(callback: (info: StellarWaveDebugInfo) => void): void {
    this.debugEnabled = true;
    this.debugCallback = callback;
    this.landmarkOverlay?.setEnabled(true);
  }

  /**
   * Disable debug mode
   */
  disableDebug(): void {
    this.debugEnabled = false;
    this.debugCallback = null;
    this.landmarkOverlay?.setEnabled(false);
  }

  /**
   * Start the Stellar Wave mode (begin tracking and rendering)
   * @throws Error if called after disposal
   */
  start(): void {
    if (this.state === StellarWaveState.DISPOSED) {
      throw new Error('[StellarWaveController] Cannot start after disposal');
    }

    if (this.state === StellarWaveState.RUNNING) {
      console.warn('[StellarWaveController] Already running');
      return;
    }

    if (this.state === StellarWaveState.UNINITIALIZED) {
      this.initialize();
    }

    this.state = StellarWaveState.RUNNING;
    this.lastTimestamp = performance.now();
    this.startUpdateLoop();

    console.log('[StellarWaveController] Started');
  }

  /**
   * Stop the Stellar Wave mode (pause tracking and rendering)
   */
  stop(): void {
    if (this.state !== StellarWaveState.RUNNING) {
      return;
    }

    this.stopUpdateLoop();
    this.state = StellarWaveState.PAUSED;

    console.log('[StellarWaveController] Stopped');
  }

  /**
   * Start the update loop for hand tracking and rendering
   */
  private startUpdateLoop(): void {
    const update = (timestamp: number): void => {
      if (this.state !== StellarWaveState.RUNNING) return;

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

      // Detect hands and process gestures
      const physicsStart = performance.now();
      this.processHandTracking(timestamp);
      const physicsTime = performance.now() - physicsStart;

      // Update renderer physics and ripples
      if (this.renderer) {
        this.renderer.update(deltaTime);
        this.renderer.render();
      }

      // Send debug info
      if (this.debugEnabled && this.debugCallback && this.renderer) {
        this.debugCallback({
          dotCount: this.renderer.getDotCount(),
          activeRipples: this.renderer.getActiveRippleCount(),
          fps: this.currentFps,
          physicsTimeMs: physicsTime,
          handsDetected: this.lastHandCount,
        });
      }

      // Schedule next frame
      this.animationFrameId = requestAnimationFrame(update);
    };

    this.animationFrameId = requestAnimationFrame(update);
  }

  /**
   * Stop the update loop
   */
  private stopUpdateLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Process hand tracking and gesture detection
   * Filters for right-hand pinch gestures only
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
      // Clear all interactions
      this.renderer?.setForceField(null, null);
      this.renderer?.setGravityWell(null, null);
      this.renderer?.setVortex(null, null);
      this.audioManager?.stopForceField();
      this.audioManager?.stopGravityWell();
      this.audioManager?.stopVortex();
      // Clear Cosmic Strings (Left Pinky)
      this.renderer?.setCosmicStringPluck(null, null);
      this.audioManager?.stopCosmicStringTension();
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

    let leftPinchActive = false;
    let leftPinkyPinchActive = false; // COSMIC_STRINGS
    let leftMiddlePinchActive = false; // GRAVITY_WELL
    let leftRingPinchActive = false; // NEBULA_VORTEX
    let quasarSurgeActive = false; // QUASAR_SURGE (Left Hand Fist)

    // Process all gesture events to handle multiple hands and interactions
    for (const event of gestureResult.events) {
      // ----------------------------------------------------------------
      // 1. COSMIC PULSE (Right Pinch) & FORCE FIELD (Left Pinch)
      // ----------------------------------------------------------------
      if (event.type === GestureType.PINCH) {
        const pinchData = event.data as PinchGestureData;

        if (pinchData.handedness === 'right') {
          // Trigger Ripple only on the frame the pinch STARTS
          if (event.state === GestureState.STARTED) {
            const { x, y } = pinchData.normalizedPosition;
            this.renderer?.triggerCosmicPulse(x, y);
            this.audioManager?.playCosmicPulse();
          }
        } else if (pinchData.handedness === 'left') {
          // Engage Force Field while pinch is ACTIVE or just STARTED
          if (event.state === GestureState.STARTED || event.state === GestureState.ACTIVE) {
            const { x, y } = pinchData.normalizedPosition;
            this.renderer?.setForceField(x, y);
            this.audioManager?.startForceField();
            leftPinchActive = true;
          }
        }
      }

      // ----------------------------------------------------------------
      // 2. GRAVITY WELL (Left Middle Pinch)
      // ----------------------------------------------------------------
      if (event.type === GestureType.MIDDLE_PINCH) {
        const middlePinchData = event.data as MiddlePinchGestureData;

        // Allow both hands for Gravity Well for better robustness
        if (middlePinchData.handedness === 'left' || middlePinchData.handedness === 'right') {
          if (event.state === GestureState.STARTED || event.state === GestureState.ACTIVE) {
            const { x, y } = middlePinchData.normalizedPosition;
            this.renderer?.setGravityWell(x, y);
            this.audioManager?.startGravityWell();
            leftMiddlePinchActive = true;
          }
        }
      }

      // 3. COSMIC STRINGS (Left Pinky Pinch)
      if (event.type === GestureType.PINKY_PINCH) {
        const pinkyPinchData = event.data as PinkyPinchGestureData;
        // Allow both hands for Cosmic Strings for better accessibility and robustness
        if (pinkyPinchData.handedness === 'left' || pinkyPinchData.handedness === 'right') {
          if (event.state === GestureState.STARTED) {
            this.audioManager?.startCosmicStringTension();
          }

          if (event.state === GestureState.STARTED || event.state === GestureState.ACTIVE) {
            const { x, y } = pinkyPinchData.normalizedPosition;
            this.renderer?.setCosmicStringPluck(x, y);
            leftPinkyPinchActive = true;
          }
        }
      }

      // ----------------------------------------------------------------
      // 3. NEBULA VORTEX (Left Ring Pinch)
      // ----------------------------------------------------------------
      if (event.type === GestureType.RING_PINCH) {
        const ringPinchData = event.data as RingPinchGestureData;

        // Allow both hands for Nebula Vortex
        if (ringPinchData.handedness === 'left' || ringPinchData.handedness === 'right') {
          if (event.state === GestureState.STARTED || event.state === GestureState.ACTIVE) {
            const { x, y } = ringPinchData.normalizedPosition;
            this.renderer?.setVortex(x, y);
            this.audioManager?.startVortex();
            leftRingPinchActive = true;
          }
        }
      }

      // ----------------------------------------------------------------
      // 4. QUASAR SURGE (Left Hand Fist)
      // ----------------------------------------------------------------
      if (event.type === GestureType.FIST) {
        const fistData = event.data as FistGestureData;
        const { x, y } = fistData.normalizedPosition;

        // Allow both hands for Quasar Surge
        if (fistData.handedness === 'left' || fistData.handedness === 'right') {
          if (event.state === GestureState.STARTED || event.state === GestureState.ACTIVE) {
            // Charging phase - particles spiral inward based on hold duration
            const maxChargeTime = this.config.quasarSurgeMaxChargeTime;
            const chargeIntensity = Math.min(1, fistData.holdDuration / maxChargeTime);

            this.renderer?.startQuasarSurgeCharge(x, y, chargeIntensity);
            this.audioManager?.startQuasarSurgeCharge(chargeIntensity);
            quasarSurgeActive = true;
          } else if (event.state === GestureState.ENDED) {
            // Burst phase - supernova explosion on release
            const intensity = this.renderer?.triggerQuasarSurgeBurst() || 0;
            this.audioManager?.playQuasarSurgeBurst(intensity);
          }
        }
      }
    }

    // ----------------------------------------------------------------
    // 5. CLEANUP / STATE SYNC
    // Clear interactions if the corresponding gesture is not active
    // ----------------------------------------------------------------
    if (!leftPinchActive) {
      this.renderer?.setForceField(null, null);
      this.audioManager?.stopForceField();
    }

    if (!leftPinkyPinchActive) {
      if (this.renderer?.hasActiveCosmicStringPluck()) {
        // Plucked!
      }
      this.renderer?.setCosmicStringPluck(null, null);
      this.audioManager?.stopCosmicStringTension();
    }

    if (!leftMiddlePinchActive) {
      this.renderer?.setGravityWell(null, null);
      this.audioManager?.stopGravityWell();
    }

    if (!leftRingPinchActive) {
      this.renderer?.setVortex(null, null);
      this.audioManager?.stopVortex();
    }

    if (!quasarSurgeActive) {
      // Only clear if not in bursting phase (let burst complete naturally)
      const currentPhase = this.renderer?.getQuasarSurgePhase();
      if (currentPhase === QuasarSurgePhase.CHARGING) {
        // If charging was interrupted, still trigger the burst
        const intensity = this.renderer?.triggerQuasarSurgeBurst() || 0;
        this.audioManager?.playQuasarSurgeBurst(intensity);
      }
      this.audioManager?.stopQuasarSurgeCharge();
    }
  }

  /**
   * Get current state
   */
  getState(): StellarWaveState {
    return this.state;
  }

  /**
   * Get number of currently tracked hands
   */
  getHandCount(): number {
    return this.lastHandCount;
  }

  /**
   * Reset the stellar wave visualization.
   * Clears all active ripples and returns dots to their rest positions.
   */
  reset(): void {
    if (this.state === StellarWaveState.UNINITIALIZED) return;

    this.renderer?.clearRipples();
    console.log('[StellarWaveController] Reset');
  }

  /**
   * Check if controller is active
   */
  isActive(): boolean {
    return this.state === StellarWaveState.RUNNING;
  }

  /**
   * Clean up resources and dispose controller.
   * After disposal, the controller cannot be restarted.
   */
  dispose(): void {
    if (this.state === StellarWaveState.DISPOSED) {
      return;
    }

    this.stopUpdateLoop();

    this.renderer?.dispose();
    this.renderer = null;

    this.landmarkOverlay?.dispose();
    this.landmarkOverlay = null;

    this.audioManager?.dispose();
    this.audioManager = null;

    this.gestureDetector.reset();
    this.state = StellarWaveState.DISPOSED;

    console.log('[StellarWaveController] Disposed');
  }
}
