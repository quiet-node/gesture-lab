/**
 * @fileoverview Visual Recognition mode controller.
 *
 * Orchestrates the Visual Recognition Service and Visual Recognition Overlay to provide
 * real-time object detection on a webcam feed. Follows the same controller
 * lifecycle pattern as other Gesture Lab modes (FoggyMirrorController, etc.).
 *
 * Lifecycle: construct → initialize → start → stop → dispose
 *
 * @module visual-recognition/VisualRecognitionController
 */

import { VisualRecognitionService } from './VisualRecognitionService';
import { VisualRecognitionOverlay } from './VisualRecognitionOverlay';
import type {
  VisualRecognitionConfig,
  VisualRecognitionDebugInfo,
  DetectionResult,
  BoundingBox,
} from './types';
import { DEFAULT_VISUAL_RECOGNITION_CONFIG } from './types';

/**
 * Internal interface representing a temporally tracked detection.
 * Used for bounding box EMA smoothing to reduce UI flickering.
 */
interface TrackedDetection extends DetectionResult {
  /** Number of consecutive frames this detection has persisted without a direct matched inference */
  age: number;
}

/**
 * Controller for the Visual Recognition interaction mode.
 *
 * Manages the detection loop, overlay rendering, and debug telemetry.
 * Does not use HandTracker — it has its own inference pipeline via
 * Roboflow's inferencejs running in a web worker.
 *
 * @example
 * ```typescript
 * const controller = new VisualRecognitionController(videoElement, container);
 * await controller.initialize();
 * controller.start();
 *
 * // When done:
 * controller.stop();
 * controller.dispose();
 * ```
 */
export class VisualRecognitionController {
  private readonly videoElement: HTMLVideoElement;
  private readonly container: HTMLElement;
  private readonly config: VisualRecognitionConfig;
  private readonly detectionService: VisualRecognitionService;
  private readonly overlay: VisualRecognitionOverlay;

  private animationFrameId: number | null = null;
  private running: boolean = false;
  private isInferring: boolean = false;
  private lastInferenceTime: number = 0;
  private lastInferenceDuration: number = 0;
  private totalFrames: number = 0;
  private latestDetections: ReadonlyArray<DetectionResult> = [];
  private trackedDetections: TrackedDetection[] = [];

  // Debug telemetry
  private debugCallback: ((info: VisualRecognitionDebugInfo) => void) | null = null;
  private fpsFrames: number = 0;
  private fpsLastTime: number = 0;
  private currentFps: number = 0;

  /**
   * Creates a VisualRecognitionController.
   *
   * @param videoElement - HTMLVideoElement with an active webcam stream
   * @param container - Parent container for the detection overlay canvas
   * @param config - Partial configuration; unspecified fields use defaults
   */
  constructor(
    videoElement: HTMLVideoElement,
    container: HTMLElement,
    config: Partial<VisualRecognitionConfig> = {}
  ) {
    this.videoElement = videoElement;
    this.container = container;
    this.config = { ...DEFAULT_VISUAL_RECOGNITION_CONFIG, ...config };

    this.detectionService = new VisualRecognitionService(this.config);
    this.overlay = new VisualRecognitionOverlay(this.container);
  }

  /**
   * Initializes the detection model.
   *
   * Downloads and loads the model into a web worker. This may take
   * several seconds on first load; subsequent loads use browser cache.
   *
   * @throws Error if the publishable key is missing or model download fails
   */
  async initialize(): Promise<void> {
    await this.detectionService.initialize();
  }

  /**
   * Starts the detection loop.
   *
   * Begins running inference at the configured interval and rendering
   * detection results on the overlay canvas. Safe to call if already running.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.fpsLastTime = performance.now();
    this.fpsFrames = 0;
    this.requestFrame();
  }

  /**
   * Stops the detection loop.
   *
   * Cancels pending animation frames and clears the overlay.
   * The controller can be restarted with {@link start} without
   * re-initializing the model.
   */
  stop(): void {
    this.running = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Enables debug telemetry reporting.
   *
   * @param callback - Called each frame with current debug metrics
   */
  enableDebug(callback: (info: VisualRecognitionDebugInfo) => void): void {
    this.debugCallback = callback;
  }

  /**
   * Disables debug telemetry reporting.
   */
  disableDebug(): void {
    this.debugCallback = null;
  }

  /**
   * Returns the number of objects detected in the latest inference frame.
   */
  getDetectionCount(): number {
    return this.latestDetections.length;
  }

  /**
   * Returns whether the detection model is loaded and ready.
   */
  isModelReady(): boolean {
    return this.detectionService.isReady();
  }

  /**
   * Resets the controller state.
   *
   * Clears current detections and resets frame counters.
   * Does not re-download the model.
   */
  reset(): void {
    this.latestDetections = [];
    this.trackedDetections = [];
    this.totalFrames = 0;
    this.lastInferenceDuration = 0;
    this.overlay.update([], { width: 1, height: 1 });
  }

  /**
   * Stops the detection loop and releases all resources.
   *
   * Disposes both the visual recognition service (kills web worker) and the
   * canvas overlay. After disposal, this controller cannot be reused.
   */
  dispose(): void {
    this.stop();
    this.detectionService.dispose();
    this.overlay.dispose();
    this.debugCallback = null;
  }

  /**
   * Schedules the next frame of the detection loop.
   */
  private requestFrame(): void {
    if (!this.running) return;
    this.animationFrameId = requestAnimationFrame((timestamp) => this.update(timestamp));
  }

  /**
   * Main update loop — runs each animation frame.
   *
   * Uses a timestamp-based throttle to limit inference calls to the
   * configured interval, while still rendering the latest cached
   * detections every frame for smooth visual updates.
   *
   * @param timestamp - High-resolution timestamp from requestAnimationFrame
   */
  private async update(timestamp: number): Promise<void> {
    if (!this.running) return;

    // Update FPS counter
    this.fpsFrames++;
    const fpsDelta = timestamp - this.fpsLastTime;
    if (fpsDelta >= 1000) {
      this.currentFps = (this.fpsFrames * 1000) / fpsDelta;
      this.fpsFrames = 0;
      this.fpsLastTime = timestamp;
    }

    // Run inference at the configured throttle interval
    const timeSinceLastInference = timestamp - this.lastInferenceTime;
    if (
      timeSinceLastInference >= this.config.inferenceIntervalMs &&
      !this.isInferring &&
      this.detectionService.isReady() &&
      this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      this.isInferring = true;
      this.lastInferenceTime = timestamp;
      const inferenceStart = performance.now();

      // Fire-and-forget inference. Do NOT await here, otherwise requestAnimationFrame loop blocks.
      this.detectionService
        .detect(this.videoElement)
        .then((detections) => {
          this.latestDetections = detections;
          this.updateTracking(detections);
          this.lastInferenceDuration = performance.now() - inferenceStart;
          this.totalFrames++;
        })
        .catch((error) => {
          console.error('[VisualRecognitionController] Inference error:', error);
        })
        .finally(() => {
          this.isInferring = false;
        });
    }

    // Render cached and tracked detections every frame for smooth visuals
    const videoDimensions = {
      width: this.videoElement.videoWidth,
      height: this.videoElement.videoHeight,
    };
    this.overlay.update(this.trackedDetections, videoDimensions);

    // Report debug telemetry
    if (this.debugCallback) {
      this.debugCallback({
        fps: this.currentFps,
        detectionCount: this.latestDetections.length,
        inferenceTimeMs: this.lastInferenceDuration,
        modelReady: this.detectionService.isReady(),
        totalFrames: this.totalFrames,
      });
    }

    // Schedule next frame
    this.requestFrame();
  }

  /**
   * Updates the temporal tracking state for bounding box smoothing.
   * Matches new detections against existing tracks using Intersection over Union (IoU),
   * applies Exponential Moving Average (EMA) to smooth coordinates, and ages out lost tracks.
   *
   * @param newDetections - The latest array of detections from the inference engine
   */
  private updateTracking(newDetections: ReadonlyArray<DetectionResult>): void {
    const updatedTracks: TrackedDetection[] = [];
    const unmatchedNew = [...newDetections];

    for (const track of this.trackedDetections) {
      let bestMatchIdx = -1;
      let bestIoU = 0;

      for (let i = 0; i < unmatchedNew.length; i++) {
        const det = unmatchedNew[i];
        if (det.className !== track.className) continue;

        const iou = this.calculateIoU(track.bbox, det.bbox);
        if (iou > bestIoU && iou > 0.3) {
          bestIoU = iou;
          bestMatchIdx = i;
        }
      }

      if (bestMatchIdx !== -1) {
        const match = unmatchedNew[bestMatchIdx];
        unmatchedNew.splice(bestMatchIdx, 1);

        // EMA smoothing factor: 0.5 provides a good balance between responsiveness and stability
        const alpha = 0.5;
        updatedTracks.push({
          className: match.className,
          confidence: match.confidence,
          bbox: {
            x: track.bbox.x * (1 - alpha) + match.bbox.x * alpha,
            y: track.bbox.y * (1 - alpha) + match.bbox.y * alpha,
            width: track.bbox.width * (1 - alpha) + match.bbox.width * alpha,
            height: track.bbox.height * (1 - alpha) + match.bbox.height * alpha,
          },
          age: 0,
        });
      } else {
        // Keep unmatched track alive to prevent brief flickering
        // max age of 3 frames (~300ms at 10 inferences/sec)
        if (track.age < 3) {
          updatedTracks.push({ ...track, age: track.age + 1 });
        }
      }
    }

    // Register remaining new detections
    for (const newDet of unmatchedNew) {
      updatedTracks.push({ ...newDet, age: 0 });
    }

    this.trackedDetections = updatedTracks;
  }

  /**
   * Calculates the Intersection over Union (IoU) between two bounding boxes.
   *
   * @param box1 - First bounding box
   * @param box2 - Second bounding box
   * @returns IoU ratio between 0 and 1
   */
  private calculateIoU(box1: BoundingBox, box2: BoundingBox): number {
    const xA = Math.max(box1.x, box2.x);
    const yA = Math.max(box1.y, box2.y);
    const xB = Math.min(box1.x + box1.width, box2.x + box2.width);
    const yB = Math.min(box1.y + box1.height, box2.y + box2.height);

    const interW = Math.max(0, xB - xA);
    const interH = Math.max(0, yB - yA);
    const interArea = interW * interH;

    const box1Area = box1.width * box1.height;
    const box2Area = box2.width * box2.height;

    return interArea / (box1Area + box2Area - interArea);
  }
}
