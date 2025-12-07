/**
 * App - Main Application Class
 * Orchestrates all modules and manages the application lifecycle
 */

import { HandTracker } from './modules/HandTracker';
import { GalaxyRenderer } from './modules/GalaxyRenderer';
import {
  HandGalaxyController,
  DebugInfo,
} from './modules/HandGalaxyController';

/**
 * Application state
 */
type AppState =
  | 'uninitialized'
  | 'initializing'
  | 'running'
  | 'error'
  | 'disposed';

/**
 * Application configuration
 */
interface AppConfig {
  /** Show debug panel */
  debug: boolean;
  /** Particle count for galaxy */
  particleCount: number;
}

const DEFAULT_APP_CONFIG: AppConfig = {
  debug: false,
  particleCount: 20000,
};

/**
 * Main Application Class
 */
export class App {
  private handTracker: HandTracker;
  private galaxyRenderer: GalaxyRenderer | null = null;
  private controller: HandGalaxyController | null = null;
  private config: AppConfig;

  // DOM elements
  private container: HTMLElement;
  private videoElement: HTMLVideoElement | null = null;
  private statusElement: HTMLElement | null = null;
  private debugElement: HTMLElement | null = null;

  // State
  private state: AppState = 'uninitialized';
  private animationFrameId: number | null = null;
  private fpsCounter: FpsCounter;

  constructor(container: HTMLElement, config: Partial<AppConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_APP_CONFIG, ...config };
    this.handTracker = new HandTracker();
    this.fpsCounter = new FpsCounter();
  }

  /**
   * Initialize and start the application
   */
  async start(): Promise<void> {
    if (this.state !== 'uninitialized') {
      console.warn('[App] Already initialized');
      return;
    }

    this.state = 'initializing';

    try {
      // Create DOM structure
      this.createDOMStructure();

      // Update status
      this.updateStatus('Initializing...', 'loading');

      // Check browser support
      this.checkBrowserSupport();

      // Initialize hand tracker
      this.updateStatus('Loading hand tracking model...', 'loading');
      await this.handTracker.initialize(this.videoElement!);

      // Initialize galaxy renderer
      this.updateStatus('Creating galaxy...', 'loading');
      this.galaxyRenderer = new GalaxyRenderer(this.container, {
        particleCount: this.config.particleCount,
      });
      this.galaxyRenderer.initialize();

      // Create controller
      this.controller = new HandGalaxyController(
        this.handTracker,
        this.galaxyRenderer
      );

      // Initialize Phase 3.2 gesture effect (star burst)
      this.controller.initializeEffects(this.galaxyRenderer.getScene());

      // Enable debug if configured
      if (this.config.debug) {
        this.enableDebug();
      }

      // Start animation loop
      this.state = 'running';
      this.updateStatus('Ready! Show both hands', 'ready');
      this.startAnimationLoop();

      console.log('[App] Started successfully');
    } catch (error) {
      this.state = 'error';
      this.handleError(error);
    }
  }

  /**
   * Create DOM structure for the application
   */
  private createDOMStructure(): void {
    // Clear container
    this.container.innerHTML = '';

    // Create video element for webcam
    this.videoElement = document.createElement('video');
    this.videoElement.id = 'webcam-video';
    this.videoElement.autoplay = true;
    this.videoElement.playsInline = true;
    this.videoElement.muted = true;
    this.videoElement.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1);
      filter: brightness(0.20) contrast(0.6);
    `;
    this.container.appendChild(this.videoElement);

    // Create status indicator
    this.statusElement = document.createElement('div');
    this.statusElement.id = 'status-indicator';
    this.statusElement.style.cssText = `
      position: absolute;
      bottom: 20px;
      left: 20px;
      padding: 10px 20px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      border-radius: 8px;
      z-index: 100;
      display: flex;
      align-items: center;
      gap: 10px;
    `;
    this.container.appendChild(this.statusElement);

    // Create debug panel (hidden by default)
    this.debugElement = document.createElement('div');
    this.debugElement.id = 'debug-panel';
    this.debugElement.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      padding: 15px;
      background: rgba(0, 0, 0, 0.8);
      color: #00ff00;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 12px;
      border-radius: 8px;
      z-index: 100;
      display: none;
      min-width: 200px;
    `;
    this.container.appendChild(this.debugElement);

    // Set container styles
    this.container.style.cssText = `
      position: relative;
      width: 100%;
      height: 100vh;
      overflow: hidden;
      background: #000;
    `;
  }

  /**
   * Check browser support for required features
   */
  private checkBrowserSupport(): void {
    const issues: string[] = [];

    // Check WebGL 2.0
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    if (!gl) {
      issues.push('WebGL 2.0 not supported');
    }

    // Check WebAssembly
    if (typeof WebAssembly !== 'object') {
      issues.push('WebAssembly not supported');
    }

    // Check getUserMedia
    if (!navigator.mediaDevices?.getUserMedia) {
      issues.push('Camera access not supported');
    }

    if (issues.length > 0) {
      throw new Error(`Browser not supported: ${issues.join(', ')}`);
    }
  }

  /**
   * Update status indicator
   */
  private updateStatus(
    message: string,
    state: 'loading' | 'ready' | 'error' | 'active'
  ): void {
    if (!this.statusElement) return;

    const stateColors: Record<string, string> = {
      loading: '#ffeb3b',
      ready: '#4caf50',
      error: '#f44336',
      active: '#2196f3',
    };

    const stateIcons: Record<string, string> = {
      loading: '⏳',
      ready: '✓',
      error: '✗',
      active: '👐',
    };

    this.statusElement.innerHTML = `
      <span style="color: ${stateColors[state]}">${stateIcons[state]}</span>
      <span>${message}</span>
    `;
  }

  /**
   * Enable debug mode
   */
  private enableDebug(): void {
    if (!this.debugElement || !this.controller) return;

    this.debugElement.style.display = 'block';

    this.controller.enableDebug((info: DebugInfo) => {
      this.updateDebugPanel(info);
    });
  }

  /**
   * Update debug panel with current info
   */
  private updateDebugPanel(info: DebugInfo): void {
    if (!this.debugElement) return;

    const fps = this.fpsCounter.getFps();

    this.debugElement.innerHTML = `
      <div style="margin-bottom: 8px; color: #fff; font-weight: bold;">Debug Info</div>
      <div>FPS: ${fps.toFixed(1)}</div>
      <div>Hands: ${info.handsDetected}</div>
      <div>Distance: ${info.distance.toFixed(3)}</div>
      <div>Scale: ${info.scale.toFixed(3)}</div>
      <div>Position:</div>
      <div style="padding-left: 10px;">
        x: ${info.position.x.toFixed(2)}<br>
        y: ${info.position.y.toFixed(2)}<br>
        z: ${info.position.z.toFixed(2)}
      </div>
      <div>Rotation (deg):</div>
      <div style="padding-left: 10px;">
        x: ${THREE.MathUtils.radToDeg(info.rotation.x).toFixed(1)}°<br>
        y: ${THREE.MathUtils.radToDeg(info.rotation.y).toFixed(1)}°<br>
        z: ${THREE.MathUtils.radToDeg(info.rotation.z).toFixed(1)}°
      </div>
    `;
  }

  /**
   * Start the main animation loop
   */
  private startAnimationLoop(): void {
    const animate = (timestamp: number) => {
      if (this.state !== 'running') return;

      // Update FPS counter
      this.fpsCounter.update();

      // Update controller
      this.controller?.update(timestamp);

      // Update status based on hands (get from controller to avoid duplicate detection)
      const handCount = this.controller?.getHandCount() ?? 0;
      if (handCount >= 2) {
        this.updateStatus(`${handCount} hands detected`, 'active');
      } else if (handCount === 1) {
        this.updateStatus('Show both hands', 'ready');
      } else {
        this.updateStatus('No hands detected', 'ready');
      }

      // Schedule next frame
      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Handle errors
   */
  private handleError(error: unknown): void {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[App] Error:', message);
    this.updateStatus(`Error: ${message}`, 'error');
  }

  /**
   * Toggle debug mode
   */
  toggleDebug(): void {
    if (!this.debugElement || !this.controller) return;

    if (this.debugElement.style.display === 'none') {
      this.debugElement.style.display = 'block';
      this.controller.enableDebug((info) => this.updateDebugPanel(info));
    } else {
      this.debugElement.style.display = 'none';
      this.controller.disableDebug();
    }
  }

  /**
   * Manually trigger Big Bang explosion (for testing)
   */
  triggerExplosion(): void {
    if (!this.galaxyRenderer) return;
    console.log('[App] Manual explosion trigger (press B)');
    this.galaxyRenderer.triggerExplosion();
  }

  /**
   * Clean up and stop the application
   */
  dispose(): void {
    if (this.state === 'disposed') return;

    // Stop animation loop
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // Dispose modules
    this.controller?.dispose();
    this.handTracker.dispose();
    this.galaxyRenderer?.dispose();

    // Clear container
    this.container.innerHTML = '';

    this.state = 'disposed';
    console.log('[App] Disposed');
  }
}

/**
 * Simple FPS counter
 */
class FpsCounter {
  private frames: number = 0;
  private lastTime: number = performance.now();
  private fps: number = 0;

  update(): void {
    this.frames++;
    const now = performance.now();
    const delta = now - this.lastTime;

    if (delta >= 1000) {
      this.fps = (this.frames * 1000) / delta;
      this.frames = 0;
      this.lastTime = now;
    }
  }

  getFps(): number {
    return this.fps;
  }
}

// Import THREE for MathUtils in debug panel
import * as THREE from 'three';
