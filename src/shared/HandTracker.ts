/**
 * HandTracker Module
 * Manages webcam access and hand landmark detection using MediaPipe Tasks Vision API
 * @see https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker/web_js
 */

import { FilesetResolver, HandLandmarker, HandLandmarkerResult } from '@mediapipe/tasks-vision';
import { DEFAULT_HAND_TRACKER_CONFIG, type HandTrackerConfig } from './HandTypes';

/**
 * HandTracker - Handles webcam initialization and MediaPipe hand detection
 */
export class HandTracker {
  private handLandmarker: HandLandmarker | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private config: HandTrackerConfig;
  private _isReady: boolean = false;
  private _isCameraEnabled: boolean = false;

  private detectionIntervalMs: number = 0;
  private lastResult: HandLandmarkerResult | null = null;

  constructor(config: Partial<HandTrackerConfig> = {}) {
    this.config = { ...DEFAULT_HAND_TRACKER_CONFIG, ...config };
  }

  setDetectionIntervalMs(intervalMs: number): void {
    this.detectionIntervalMs = Math.max(0, intervalMs);
  }

  getDetectionIntervalMs(): number {
    return this.detectionIntervalMs;
  }

  /**
   * Initialize MediaPipe HandLandmarker and webcam
   * @param videoElement - HTML video element to display camera feed
   */
  async initialize(videoElement: HTMLVideoElement): Promise<void> {
    this.videoElement = videoElement;

    // Initialize in parallel for faster startup
    // Camera errors are caught and handled gracefully
    await Promise.all([
      this.initializeHandLandmarker(),
      this.initializeWebcam().catch(() => {
        // Camera failure is handled in initializeWebcam, just swallow to prevent Promise.all rejection
      }),
    ]);

    this._isReady = true;
  }

  /**
   * Static shared instance to prevent multiple WASM heaps (OOM fix)
   */
  private static sharedHandLandmarker: HandLandmarker | null = null;
  private static initializationPromise: Promise<void> | null = null;

  /**
   * Initialize MediaPipe Tasks Vision HandLandmarker
   */
  private async initializeHandLandmarker(): Promise<void> {
    // If we already have a shared instance, reuse it
    if (HandTracker.sharedHandLandmarker) {
      this.handLandmarker = HandTracker.sharedHandLandmarker;
      console.log('[HandTracker] Reusing shared HandLandmarker instance');
      return;
    }

    // If initialization is in progress, wait for it
    if (HandTracker.initializationPromise) {
      await HandTracker.initializationPromise;
      if (HandTracker.sharedHandLandmarker) {
        this.handLandmarker = HandTracker.sharedHandLandmarker;
        return;
      }
    }

    try {
      // Start initialization lock
      HandTracker.initializationPromise = (async () => {
        // Step 1: Load WASM runtime
        // Using local assets to guarantee version matching and prevent LinkErrors
        const vision = await FilesetResolver.forVisionTasks('/wasm');

        // Step 2: Create HandLandmarker with configuration
        HandTracker.sharedHandLandmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: this.config.modelAssetPath,
            delegate: this.config.delegate,
          },
          runningMode: 'VIDEO',
          numHands: this.config.numHands,
          minHandDetectionConfidence: this.config.minHandDetectionConfidence,
          minHandPresenceConfidence: this.config.minHandPresenceConfidence,
          minTrackingConfidence: this.config.minTrackingConfidence,
        });
      })();

      await HandTracker.initializationPromise;
      this.handLandmarker = HandTracker.sharedHandLandmarker;

      console.log('[HandTracker] MediaPipe HandLandmarker initialized (New Instance)');
    } catch (error) {
      console.error('[HandTracker] Failed to initialize HandLandmarker:', error);
      HandTracker.initializationPromise = null; // Reset on failure
      throw new Error(`MediaPipe initialization failed: ${error}`);
    }
  }

  /**
   * Initialize webcam stream
   */
  private async initializeWebcam(): Promise<void> {
    if (!this.videoElement) {
      throw new Error('Video element not set');
    }

    try {
      // Request camera access with ideal constraints
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user', // Front camera for selfie mode
          frameRate: { ideal: 30 },
        },
        audio: false,
      });

      // Attach stream to video element
      this.videoElement.srcObject = this.stream;
      this.videoElement.playsInline = true;
      this.videoElement.muted = true;

      // Wait for video to be ready
      await new Promise<void>((resolve, reject) => {
        if (!this.videoElement) {
          reject(new Error('Video element not set'));
          return;
        }
        this.videoElement.onloadedmetadata = () => {
          this.videoElement!.play()
            .then(() => resolve())
            .catch(reject);
        };
        this.videoElement.onerror = () => reject(new Error('Video load error'));
      });

      console.log('[HandTracker] Webcam initialized:', {
        width: this.videoElement.videoWidth,
        height: this.videoElement.videoHeight,
      });

      this._isCameraEnabled = true;
    } catch (error) {
      this._isCameraEnabled = false;
      this.handleCameraError(error);
      // Do NOT re-throw; allow app to continue without camera
    }
  }

  /**
   * Handle camera access errors with user-friendly messages
   */
  private handleCameraError(error: unknown): void {
    if (error instanceof DOMException) {
      switch (error.name) {
        case 'NotAllowedError':
          console.error('[HandTracker] Camera permission denied. Please allow camera access.');
          break;
        case 'NotFoundError':
          console.error('[HandTracker] No camera found. Please connect a camera.');
          break;
        case 'NotReadableError':
          console.error('[HandTracker] Camera is in use by another application.');
          break;
        case 'OverconstrainedError':
          console.error('[HandTracker] Camera does not meet requirements.');
          break;
        default:
          console.error('[HandTracker] Camera error:', error.message);
      }
    } else {
      console.error('[HandTracker] Unknown camera error:', error);
    }
  }

  // Track last timestamp to avoid duplicate detections
  private lastDetectForVideoTimestamp: number = -1;

  /**
   * Detect hands in current video frame
   * @param timestamp - Current timestamp from performance.now() or requestAnimationFrame
   * @returns Hand detection results or null if not ready
   */
  detectHands(timestamp: number): HandLandmarkerResult | null {
    if (!this._isReady || !this.handLandmarker || !this.videoElement) {
      return null;
    }

    // Check if video is actually playing
    if (this.videoElement.readyState < 2) {
      return null;
    }

    // Ensure timestamp is strictly increasing (MediaPipe requirement)
    // This prevents "timestamp must be monotonically increasing" errors
    if (timestamp <= this.lastDetectForVideoTimestamp) {
      return this.lastResult;
    }

    // Throttle expensive detectForVideo calls to protect frame time.
    // Returning cached results keeps the render loop running at 60fps.
    if (
      this.detectionIntervalMs > 0 &&
      this.lastDetectForVideoTimestamp >= 0 &&
      timestamp - this.lastDetectForVideoTimestamp < this.detectionIntervalMs
    ) {
      return this.lastResult;
    }

    try {
      // detectForVideo is synchronous in VIDEO running mode
      const result = this.handLandmarker.detectForVideo(this.videoElement, timestamp);
      this.lastDetectForVideoTimestamp = timestamp;
      this.lastResult = result;
      return result;
    } catch (error) {
      console.error('[HandTracker] Detection error:', error);
      return null;
    }
  }

  /**
   * Check if the hand tracker is ready for detection
   */
  isReady(): boolean {
    return this._isReady;
  }

  /**
   * Check if camera is enabled and streaming
   */
  isCameraEnabled(): boolean {
    return this._isCameraEnabled;
  }

  /**
   * Get the last detection result
   * Useful for accessing cached results without re-running detection
   */
  getLastResult(): HandLandmarkerResult | null {
    return this.lastResult;
  }

  /**
   * Get the video element dimensions
   */
  getVideoDimensions(): { width: number; height: number } | null {
    if (!this.videoElement) return null;
    return {
      width: this.videoElement.videoWidth,
      height: this.videoElement.videoHeight,
    };
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    // Stop webcam stream
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    // Close HandLandmarker
    // FIX: Do NOT close the shared instance, as other components or reloads might need it.
    // The WASM heap is expensive and should persist.
    // Only cleanup local references.
    this.handLandmarker = null;

    // Note: If we really needed to nuke everything, we would add a static destroy() method.
    // But for this use case, keeping the WASM loaded is better for performance and preventing OOM.

    // Clear video element
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }

    this._isReady = false;
    console.log('[HandTracker] Disposed');
  }
}
