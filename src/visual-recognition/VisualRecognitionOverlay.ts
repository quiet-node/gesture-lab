/**
 * @fileoverview Canvas overlay for rendering visual recognition bounding boxes.
 *
 * Draws visually striking, neon-styled bounding boxes with class labels and
 * confidence scores on a 2D canvas overlay positioned above the video feed.
 * Follows the same architectural pattern as {@link HandLandmarkOverlay}.
 *
 * Performance optimizations:
 * - Desynchronized canvas context for reduced display latency
 * - Batched path operations to minimize context state changes
 * - Pre-computed color palette to avoid per-frame hue calculations
 *
 * @module visual-recognition/VisualRecognitionOverlay
 */

import type { DetectionResult } from './types';

/**
 * Number of distinct hues in the color palette.
 * Chosen to provide visually distinguishable colors for common object classes.
 */
const PALETTE_SIZE = 12;

/**
 * Pre-computed HSL color palette for consistent per-class coloring.
 * Each class name maps to a deterministic hue to maintain visual consistency
 * across frames (the same class always gets the same color).
 */
const COLOR_CACHE = new Map<string, { stroke: string; fill: string; text: string }>();

/**
 * Generates a deterministic color set for a given class name.
 * Uses a simple string hash to assign a consistent hue from the palette.
 *
 * @param className - The object class name to generate colors for
 * @returns Stroke, fill, and text colors for the given class
 */
function getClassColors(className: string): { stroke: string; fill: string; text: string } {
  const cached = COLOR_CACHE.get(className);
  if (cached) return cached;

  // Simple string hash for deterministic hue assignment
  let hash = 0;
  for (let i = 0; i < className.length; i++) {
    hash = (hash * 31 + className.charCodeAt(i)) | 0;
  }
  const hue = ((Math.abs(hash) % PALETTE_SIZE) * (360 / PALETTE_SIZE)) | 0;

  const colors = {
    stroke: `hsla(${hue}, 100%, 65%, 0.9)`,
    fill: `hsla(${hue}, 100%, 50%, 0.12)`,
    text: `hsla(${hue}, 100%, 80%, 1)`,
  };

  COLOR_CACHE.set(className, colors);
  return colors;
}

/**
 * Canvas overlay that renders detection bounding boxes and labels.
 *
 * The canvas uses `transform: scaleX(-1)` to mirror the video feed,
 * so all text-based rendering (labels, confidence scores) must be
 * counter-scaled to remain readable.
 *
 * @example
 * ```typescript
 * const overlay = new VisualRecognitionOverlay(container);
 *
 * // In detection loop:
 * overlay.update(detections, { width: 640, height: 480 });
 *
 * // Cleanup:
 * overlay.dispose();
 * ```
 */
export class VisualRecognitionOverlay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;

  /**
   * Creates a VisualRecognitionOverlay and appends it to the given container.
   *
   * @param container - Parent element to attach the canvas overlay to
   * @throws Error if 2D canvas context creation fails
   */
  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 15;
      transform: scaleX(-1);
    `;
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
    });
    if (!ctx) {
      throw new Error('Failed to create 2D canvas context for visual recognition overlay');
    }
    this.ctx = ctx;

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  /**
   * Resizes the canvas to match the parent container dimensions.
   * Bound as an arrow function for stable event listener reference.
   */
  private resize = (): void => {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    if (rect) {
      const dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * dpr;
      this.canvas.height = rect.height * dpr;
      this.canvas.style.width = `${rect.width}px`;
      this.canvas.style.height = `${rect.height}px`;

      this.ctx.resetTransform();
      this.ctx.scale(dpr, dpr);

      this.width = rect.width;
      this.height = rect.height;
    }
  };

  /**
   * Renders detection bounding boxes and labels for the current frame.
   *
   * Drawing strategy:
   * 1. Clear previous frame
   * 2. Scale detection coordinates from source video to canvas dimensions
   * 3. Draw filled bounding boxes with rounded corners
   * 4. Draw class labels with confidence percentage (counter-scaled for mirror)
   *
   * @param detections - Array of detection results to render
   * @param videoDimensions - Source video dimensions for coordinate scaling
   */
  update(
    detections: ReadonlyArray<DetectionResult>,
    videoDimensions: { width: number; height: number }
  ): void {
    const { ctx, width, height } = this;

    ctx.clearRect(0, 0, width, height);

    if (detections.length === 0 || videoDimensions.width === 0 || videoDimensions.height === 0) {
      return;
    }

    // Scale factor from source video coordinates to canvas pixels
    const scaleX = width / videoDimensions.width;
    const scaleY = height / videoDimensions.height;

    for (const detection of detections) {
      const { bbox, className, confidence } = detection;

      // Scale bounding box to canvas coordinates
      const x = bbox.x * scaleX;
      const y = bbox.y * scaleY;
      const w = bbox.width * scaleX;
      const h = bbox.height * scaleY;

      const colors = getClassColors(className);
      const cornerRadius = 6;

      // Draw filled background
      ctx.fillStyle = colors.fill;
      ctx.beginPath();
      this.roundedRect(x, y, w, h, cornerRadius);
      ctx.fill();

      // Draw border with dashed line for low confidence
      if (confidence < 0.4) {
        ctx.setLineDash([8, 6]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.strokeStyle = colors.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      this.roundedRect(x, y, w, h, cornerRadius);
      ctx.stroke();

      // Reset line dash for subsequent draw operations
      ctx.setLineDash([]);

      // Draw label with counter-scale to cancel the CSS mirror transform.
      // Without this, text renders backwards on the scaleX(-1) canvas.
      this.drawLabel(ctx, className, confidence, x, y, w, colors);
    }
  }

  /**
   * Draws a readable label pill above (or inside) a bounding box.
   *
   * The label is drawn with a counter-scale transform so it appears
   * correctly on the CSS-mirrored canvas. The pill is anchored to
   * the right edge of the bounding box (which visually maps to the
   * left edge after mirroring).
   *
   * @param ctx - Canvas 2D rendering context
   * @param className - Object class name to display
   * @param confidence - Detection confidence score (0–1)
   * @param boxX - Scaled bounding box X position
   * @param boxY - Scaled bounding box Y position
   * @param boxW - Scaled bounding box width
   * @param colors - Color set for the detection class
   */
  private drawLabel(
    ctx: CanvasRenderingContext2D,
    className: string,
    confidence: number,
    boxX: number,
    boxY: number,
    boxW: number,
    colors: { stroke: string }
  ): void {
    const label = `${className} ${(confidence * 100).toFixed(0)}%`;
    ctx.font = 'bold 14px "Nunito", sans-serif';
    const textMetrics = ctx.measureText(label);
    const padX = 8;
    const padY = 4;
    const pillH = 22;
    const pillW = textMetrics.width + padX * 2;

    // Position label above the box, or inside if box is too close to top
    const pillY = boxY > pillH + 4 ? boxY - pillH - 4 : boxY + 4;

    // Anchor to the right edge of the bounding box so it visually
    // appears at the left edge after the CSS scaleX(-1) mirror.
    const pillX = boxX + boxW - pillW;

    // Counter-scale: flip text horizontally around the pill center
    // so it reads correctly on the mirrored canvas.
    const flipCenterX = pillX + pillW / 2;
    ctx.save();
    ctx.translate(flipCenterX, 0);
    ctx.scale(-1, 1);
    ctx.translate(-flipCenterX, 0);

    // Label pill background
    ctx.fillStyle = colors.stroke;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    this.roundedRect(pillX, pillY, pillW, pillH, 4);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Label text
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'top';
    ctx.fillText(label, pillX + padX, pillY + padY);

    ctx.restore();
  }

  /**
   * Traces a rounded rectangle path on the canvas context.
   * Does not fill or stroke — the caller must do so after calling this method.
   *
   * @param x - Top-left X coordinate
   * @param y - Top-left Y coordinate
   * @param w - Rectangle width
   * @param h - Rectangle height
   * @param r - Corner radius (clamped to half the smallest dimension)
   */
  private roundedRect(x: number, y: number, w: number, h: number, r: number): void {
    const radius = Math.min(r, w / 2, h / 2);
    const ctx = this.ctx;
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  /**
   * Removes the canvas from the DOM and cleans up event listeners.
   */
  dispose(): void {
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
    COLOR_CACHE.clear();
  }
}
