/**
 * @fileoverview Visual recognition service wrapping Roboflow's inferencejs.
 *
 * Encapsulates all Roboflow InferenceEngine interaction behind a clean
 * interface. This is the only module that imports from `inferencejs`;
 * all consumer code works exclusively with the local {@link DetectionResult}
 * type (Dependency Inversion Principle).
 *
 * The service uses web workers internally (managed by inferencejs) to
 * run YOLO inference off the main thread, preventing UI jank.
 *
 * @module visual-recognition/VisualRecognitionService
 */

// @ts-expect-error — inferencejs has types at dist/index.d.ts but its package.json "exports" field
// does not expose them correctly. Types are available at runtime; this is a packaging bug upstream.
import { InferenceEngine, CVImage } from 'inferencejs';
import type { DetectionResult, VisualRecognitionConfig } from './types';
import { DEFAULT_VISUAL_RECOGNITION_CONFIG } from './types';

/**
 * Service for running visual recognition inference in the browser.
 *
 * Lifecycle:
 * 1. Construct with config
 * 2. Call {@link initialize} to download and load the model
 * 3. Call {@link detect} repeatedly with video frames
 * 4. Call {@link dispose} to release the web worker and free memory
 *
 * @example
 * ```typescript
 * const service = new VisualRecognitionService();
 * await service.initialize();
 * const detections = await service.detect(videoElement);
 * service.dispose();
 * ```
 */
export class VisualRecognitionService {
  private readonly config: VisualRecognitionConfig;
  private engine: InferenceEngine | null = null;
  private workerId: string | null = null;
  private modelLoaded: boolean = false;
  private initializing: boolean = false;

  /**
   * Creates a VisualRecognitionService instance.
   *
   * @param config - Partial configuration; unspecified fields use defaults
   */
  constructor(config: Partial<VisualRecognitionConfig> = {}) {
    this.config = { ...DEFAULT_VISUAL_RECOGNITION_CONFIG, ...config };
  }

  /**
   * Initializes the inference engine and downloads the model.
   *
   * This creates a web worker that loads the model weights from Roboflow's
   * CDN. The initial download is ~5–15 MB and is cached by the browser
   * for subsequent loads.
   *
   * @throws Error if the publishable key is missing or model loading fails
   */
  async initialize(): Promise<void> {
    if (this.modelLoaded || this.initializing) return;

    if (!this.config.publishableKey) {
      throw new Error(
        'Roboflow publishable key is required. ' +
          'Set VITE_ROBOFLOW_PUBLISHABLE_KEY in your .env file.'
      );
    }

    this.initializing = true;

    try {
      this.engine = new InferenceEngine();

      const options = {
        scoreThreshold: this.config.scoreThreshold,
        iouThreshold: this.config.iouThreshold,
        maxNumBoxes: this.config.maxDetections,
      };

      this.workerId = await this.engine.startWorker(
        this.config.modelId,
        this.config.modelVersion,
        this.config.publishableKey,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [options] as any
      );

      this.modelLoaded = true;
      console.log(
        `[VisualRecognitionService] ✅ Model ready: ${this.config.modelId}/${this.config.modelVersion}`
      );
    } catch (error) {
      this.modelLoaded = false;
      const message = error instanceof Error ? error.message : String(error);
      console.error('[VisualRecognitionService] ❌ Initialization failed:', message);
      throw new Error(`Model load failed: ${message}`);
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Runs visual recognition inference on the current video frame.
   *
   * Captures the current frame from the video element, sends it to the
   * web worker for YOLO inference, and returns normalized detection results.
   *
   * @param video - HTMLVideoElement with an active camera stream
   * @returns Array of detection results, empty if model is not ready or inference fails
   */
  async detect(video: HTMLVideoElement): Promise<DetectionResult[]> {
    if (!this.engine || !this.workerId || !this.modelLoaded) {
      return [];
    }

    let image: CVImage | null = null;
    try {
      image = new CVImage(video);
      const rawResult = await this.engine.infer(this.workerId, image);

      // Handle both flat array and wrapped { predictions: [] } response formats
      const predictions = Array.isArray(rawResult)
        ? rawResult
        : ((rawResult as Record<string, unknown>).predictions as unknown[]) || [];

      if (!Array.isArray(predictions)) {
        return [];
      }

      return predictions.map((pred: unknown) => this.normalizePrediction(pred));
    } catch {
      // Inference can fail transiently (e.g., during tab switch).
      // Return empty results rather than crashing the detection loop.
      return [];
    } finally {
      if (image) {
        try {
          image.dispose();
        } catch {
          // Ignore disposal errors if Tensor is already freed
        }
      }
    }
  }

  /**
   * Returns whether the model is loaded and ready for inference.
   */
  isReady(): boolean {
    return this.modelLoaded;
  }

  /**
   * Returns whether the service is currently loading the model.
   */
  isInitializing(): boolean {
    return this.initializing;
  }

  /**
   * Stops the inference worker and releases all resources.
   *
   * Safe to call multiple times. After disposal, the service
   * cannot be reused — a new instance must be created.
   */
  dispose(): void {
    if (this.engine && this.workerId) {
      try {
        this.engine.stopWorker(this.workerId);
      } catch {
        // Worker may already be stopped; ignore cleanup errors
      }
    }

    this.engine = null;
    this.workerId = null;
    this.modelLoaded = false;
    this.initializing = false;
  }

  /**
   * Converts a raw Roboflow prediction to the normalized DetectionResult format.
   *
   * Roboflow returns center-based coordinates (x, y are the center of the box).
   * This converts them to top-left-based coordinates for canvas rendering.
   * Handles both flat and nested (bbox/box) response structures from inferencejs.
   *
   * @param pred - Raw prediction from the InferenceEngine
   * @returns Normalized detection result with top-left based bounding box
   */
  private normalizePrediction(pred: unknown): DetectionResult {
    // Robustly handle different Roboflow response formats (flat vs nested).
    // Some versions nest the coordinates under 'bbox' or 'box'.
    const p = pred as Record<string, unknown>;
    const box = (p.bbox || p.box || p) as Record<string, unknown>;

    const cx = typeof box.x === 'number' ? box.x : 0;
    const cy = typeof box.y === 'number' ? box.y : 0;
    const w = typeof box.width === 'number' ? box.width : 0;
    const h = typeof box.height === 'number' ? box.height : 0;

    return {
      className: typeof p.class === 'string' ? p.class : 'unknown',
      confidence: typeof p.confidence === 'number' ? p.confidence : 0,
      bbox: {
        x: cx - w / 2,
        y: cy - h / 2,
        width: w,
        height: h,
      },
    };
  }
}
