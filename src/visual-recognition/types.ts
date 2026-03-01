/**
 * @fileoverview Type definitions for the Visual Recognition mode.
 *
 * Defines configuration, detection results, and debug telemetry types
 * used across the Visual Recognition module.
 *
 * @module visual-recognition/types
 */

/**
 * Bounding box coordinates and dimensions for a detected object.
 * All values are in pixel coordinates relative to the source video frame.
 */
export interface BoundingBox {
  /** X coordinate of the bounding box top-left corner (pixels) */
  readonly x: number;
  /** Y coordinate of the bounding box top-left corner (pixels) */
  readonly y: number;
  /** Width of the bounding box (pixels) */
  readonly width: number;
  /** Height of the bounding box (pixels) */
  readonly height: number;
}

/**
 * A single object detection result from the inference engine.
 */
export interface DetectionResult {
  /** Detected object class name (e.g., "cup", "cell phone", "bottle") */
  readonly className: string;
  /** Confidence score between 0 and 1 */
  readonly confidence: number;
  /** Bounding box in pixel coordinates */
  readonly bbox: BoundingBox;
}

/**
 * Configuration for the Visual Recognition mode.
 */
export interface VisualRecognitionConfig {
  /** Roboflow model project ID */
  readonly modelId: string;
  /** Roboflow model version number */
  readonly modelVersion: number;
  /** Roboflow publishable API key for browser-side inference */
  readonly publishableKey: string;
  /** Minimum score threshold for displaying detections (0–1) */
  readonly scoreThreshold: number;
  /** Overlap threshold for non-max suppression (0–1) */
  readonly iouThreshold: number;
  /** Maximum number of detections to display simultaneously */
  readonly maxDetections: number;
  /** Minimum interval between inference calls in milliseconds */
  readonly inferenceIntervalMs: number;
  /** Enable debug telemetry reporting */
  readonly debug: boolean;
}

/**
 * Debug telemetry reported by the Visual Recognition controller.
 */
export interface VisualRecognitionDebugInfo {
  /** Current rendering frames per second */
  readonly fps: number;
  /** Number of objects detected in the latest inference */
  readonly detectionCount: number;
  /** Time taken for the last inference call in milliseconds */
  readonly inferenceTimeMs: number;
  /** Whether the detection model is loaded and ready */
  readonly modelReady: boolean;
  /** Total number of inference frames processed since mode start */
  readonly totalFrames: number;
}

/**
 * Default configuration values for Visual Recognition.
 *
 * Uses the official Microsoft COCO dataset (YOLOv8n, version 3) which
 * supports all 80 standard COCO object classes. The publishable key
 * is read from `VITE_ROBOFLOW_PUBLISHABLE_KEY` at build time.
 */
export const DEFAULT_VISUAL_RECOGNITION_CONFIG: VisualRecognitionConfig = {
  modelId: 'coco',
  modelVersion: 3,
  publishableKey: import.meta.env.VITE_ROBOFLOW_PUBLISHABLE_KEY ?? '',
  scoreThreshold: 0.25,
  iouThreshold: 0.45,
  maxDetections: 10,
  inferenceIntervalMs: 100,
  debug: false,
};
