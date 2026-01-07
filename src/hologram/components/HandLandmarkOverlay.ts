/**
 * HandLandmarkOverlay
 * High-performance hand landmark rendering using direct canvas drawing
 * Visible only in debug mode for the Hologram interface
 */

import type { HandLandmarkerResult } from '@mediapipe/tasks-vision';

/**
 * Hand connections for drawing the skeletal structure (21 landmarks)
 * Pre-defined as typed tuples for performance (no runtime lookups)
 */
const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // Thumb
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  // Index finger
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  // Middle finger
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  // Ring finger
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  // Pinky
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
];

/**
 * Configuration for the hand landmark overlay
 */
export interface HandLandmarkOverlayConfig {
  /** Color for landmark points */
  landmarkColor: string;
  /** Color for connection lines */
  connectionColor: string;
  /** Radius of landmark points */
  landmarkRadius: number;
  /** Width of connection lines */
  connectionLineWidth: number;
}

const DEFAULT_CONFIG: HandLandmarkOverlayConfig = {
  landmarkColor: '#00ffff',
  connectionColor: '#00ffff',
  landmarkRadius: 3,
  connectionLineWidth: 2,
};

/**
 * HandLandmarkOverlay - High-performance hand landmark rendering
 * Uses direct canvas drawing instead of MediaPipe DrawingUtils for maximum FPS
 */
export class HandLandmarkOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly config: HandLandmarkOverlayConfig;
  private enabled: boolean = false;
  private width: number = 0;
  private height: number = 0;

  constructor(
    container: HTMLElement,
    config: Partial<HandLandmarkOverlayConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    // Create canvas element
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 5;
      transform: scaleX(-1);
    `;
    container.appendChild(this.canvas);

    // Get 2D context with performance optimizations
    const ctx = this.canvas.getContext('2d', {
      alpha: true,
      desynchronized: true, // Reduces latency on supported browsers
    });
    if (!ctx) {
      throw new Error('Failed to get 2D canvas context');
    }
    this.ctx = ctx;

    // Set initial size
    this.resize();

    // Listen for resize
    window.addEventListener('resize', this.resize);

    // Initially hidden
    this.canvas.style.display = 'none';
  }

  /**
   * Resize canvas to match container
   */
  private resize = (): void => {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
      this.width = rect.width;
      this.height = rect.height;
    }
  };

  /**
   * Enable or disable the overlay
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.canvas.style.display = enabled ? 'block' : 'none';

    if (!enabled) {
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  /**
   * Update the overlay with new hand detection results
   * Optimized for maximum performance with direct canvas operations
   */
  update(handResults: HandLandmarkerResult | null): void {
    if (!this.enabled) return;

    const { ctx, width, height, config } = this;

    // Clear previous frame
    ctx.clearRect(0, 0, width, height);

    if (!handResults || handResults.landmarks.length === 0) {
      return;
    }

    // Set styles once (avoid repeated style changes)
    ctx.strokeStyle = config.connectionColor;
    ctx.lineWidth = config.connectionLineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.fillStyle = config.landmarkColor;

    // Draw each detected hand
    for (const landmarks of handResults.landmarks) {
      // Draw all connections in a single path (faster than individual lines)
      ctx.beginPath();
      for (const [start, end] of HAND_CONNECTIONS) {
        const p1 = landmarks[start];
        const p2 = landmarks[end];
        ctx.moveTo(p1.x * width, p1.y * height);
        ctx.lineTo(p2.x * width, p2.y * height);
      }
      ctx.stroke();

      // Draw all landmarks as circles
      const radius = config.landmarkRadius;
      const twoPI = Math.PI * 2;
      for (const lm of landmarks) {
        ctx.beginPath();
        ctx.arc(lm.x * width, lm.y * height, radius, 0, twoPI);
        ctx.fill();
      }
    }
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }
}
