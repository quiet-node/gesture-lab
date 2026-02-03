import { HandTracker } from '../shared/HandTracker';
import { GestureDetector } from '../shared/GestureDetector';
import { MagneticClutterRenderer } from './MagneticClutterRenderer';
import {
  MagneticClutterConfig,
  DEFAULT_MAGNETIC_CLUTTER_CONFIG,
  MagneticClutterDebugInfo,
} from './types';
import {
  GestureType,
  GestureState,
  PinchGestureData,
  FistGestureData,
} from '../shared/GestureTypes';

export class MagneticClutterController {
  private container: HTMLElement;
  private config: MagneticClutterConfig;
  private handTracker: HandTracker;
  private renderer: MagneticClutterRenderer | null = null;
  private gestureDetector: GestureDetector;

  private animationFrameId: number | null = null;
  private lastTimestamp: number = 0;
  private isRunning: boolean = false;

  // Debug
  private debugCallback: ((info: MagneticClutterDebugInfo) => void) | null = null;
  private lastHandCount: number = 0;
  private frameCount: number = 0;
  private lastFpsUpdate: number = 0;
  private currentFps: number = 60;

  // Interaction State
  private isRepulsing: boolean = false;
  private isGrabbing: boolean = false;

  constructor(
    handTracker: HandTracker,
    container: HTMLElement,
    config: Partial<MagneticClutterConfig> = {}
  ) {
    this.handTracker = handTracker;
    this.container = container;
    this.config = { ...DEFAULT_MAGNETIC_CLUTTER_CONFIG, ...config };
    this.gestureDetector = new GestureDetector();
  }

  initialize(): void {
    if (this.renderer) return;

    this.renderer = new MagneticClutterRenderer(this.container, this.config);
    this.renderer.initialize();

    // Optimize: Throttle hand detection to ~30 FPS to save CPU for physics and rendering
    this.handTracker.setDetectionIntervalMs(33);

    console.log('[MagneticClutter] Initialized');
  }

  start(): void {
    if (this.isRunning) return;

    if (!this.renderer) {
      this.initialize();
    }

    this.isRunning = true;
    this.lastTimestamp = performance.now();
    this.loop();

    console.log('[MagneticClutter] Started');
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    // Reset hand detection interval
    this.handTracker.setDetectionIntervalMs(0);
  }

  private loop = (): void => {
    if (!this.isRunning) return;

    try {
      const now = performance.now();
      const deltaTime = Math.min((now - this.lastTimestamp) / 1000, 0.1); // Cap dt
      this.lastTimestamp = now;

      // FPS Calculation
      this.frameCount++;
      if (now - this.lastFpsUpdate >= 1000) {
        this.currentFps = this.frameCount;
        this.frameCount = 0;
        this.lastFpsUpdate = now;
      }

      // 1. Process Hand Tracking & Gestures
      this.processHands(now);

      // 2. Update Renderer
      if (this.renderer) {
        const physicsStart = performance.now();
        this.renderer.update(deltaTime);
        const physicsTime = performance.now() - physicsStart;

        // Debug Info
        if (this.config.debug && this.debugCallback) {
          const stats = this.renderer.getStats();
          this.debugCallback({
            fps: this.currentFps,
            handsDetected: this.lastHandCount,
            activeBalls: stats.balls,
            physicsTimeMs: physicsTime,
            isRepulsing: this.isRepulsing,
            isGrabbing: this.isGrabbing,
          });
        }
      }
    } catch (e) {
      console.error('[MagneticClutter] Loop Error:', e);
      // Optional: Stop loop if critical
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private processHands(timestamp: number): void {
    const result = this.handTracker.detectHands(timestamp);

    // Default states
    let rightFistActive = false;
    let rightHandPos = { x: 0, y: 0 };

    let leftPinchActive = false;
    let leftHandPos = { x: 0, y: 0 };

    if (result && result.landmarks.length > 0) {
      this.lastHandCount = result.landmarks.length;

      // Map handedness
      const handednessStr = result.handedness.map(
        (h) => (h[0]?.categoryName?.toLowerCase() as 'left' | 'right' | 'unknown') || 'unknown'
      );

      // Detect Gestures
      const gestureResult = this.gestureDetector.detect(result.landmarks, handednessStr, timestamp);

      for (const event of gestureResult.events) {
        // RIGHT HAND FIST -> REPULSOR
        if (event.type === GestureType.FIST) {
          const data = event.data as FistGestureData;
          if (data.handedness === 'right') {
            if (event.state === GestureState.STARTED || event.state === GestureState.ACTIVE) {
              rightFistActive = true;
              rightHandPos = data.normalizedPosition;
            }
          }
        }

        // LEFT HAND PINCH -> GRAB
        if (event.type === GestureType.PINCH) {
          // Note: added GestureState.ACTIVE for robustness, though usually handled by detector
          const data = event.data as PinchGestureData;
          if (data.handedness === 'left') {
            if (event.state === GestureState.STARTED || event.state === GestureState.ACTIVE) {
              leftPinchActive = true;
              leftHandPos = data.normalizedPosition;
            }
          }
        }
      }
    } else {
      this.lastHandCount = 0;
    }

    // Update Renderer Interaction
    if (this.renderer) {
      // Update state for debug
      this.isRepulsing = rightFistActive;
      this.isGrabbing = leftPinchActive;

      // 1. Repulsor (Right Fist)
      if (rightFistActive) {
        const ndcX = 1 - rightHandPos.x * 2;
        const ndcY = -(rightHandPos.y * 2) + 1;

        // Project to z=0.2 plane
        const worldPos = this.renderer.projectToWorld(ndcX, ndcY, 0.2);
        this.renderer.setRepulsor(worldPos.x, worldPos.y, worldPos.z, true);
      } else {
        this.renderer.setRepulsor(0, 0, 0, false);
      }

      // 2. Grabber (Left Pinch)
      if (leftPinchActive) {
        const ndcX = 1 - leftHandPos.x * 2;
        const ndcY = -(leftHandPos.y * 2) + 1;

        // Match grabber plane
        const worldPos = this.renderer.projectToWorld(ndcX, ndcY, 0.2);
        this.renderer.setGrabber(worldPos.x, worldPos.y, worldPos.z, true);
      } else {
        this.renderer.setGrabber(0, 0, 0, false);
      }
    }
  }

  enableDebug(callback: (info: MagneticClutterDebugInfo) => void): void {
    this.config.debug = true;
    this.debugCallback = callback;
  }

  disableDebug(): void {
    this.config.debug = false;
    this.debugCallback = null;
  }

  // Required by App.ts for hand status
  getHandCount(): number {
    return this.lastHandCount;
  }

  reset(): void {
    // TODO: implement logic to reset balls
  }

  dispose(): void {
    this.stop();
    this.renderer?.dispose();
    this.renderer = null;
    this.gestureDetector.reset();
  }
}
