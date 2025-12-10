/**
 * App - Main Application Class
 * Orchestrates all modules and manages the application lifecycle
 */

import * as THREE from 'three';
import { FoggyMirrorController } from './foggy-mirror/FoggyMirrorController';
import { FoggyMirrorDebugInfo } from './foggy-mirror/types';
import { GalaxyRenderer } from './interactive-galaxy/GalaxyRenderer';
import {
  HandGalaxyController,
  DebugInfo,
} from './interactive-galaxy/HandGalaxyController';
import { HandTracker } from './shared/HandTracker';
import { DebugComponent } from './ui/DebugComponent';
import { Footer } from './ui/Footer';
import { HintComponent } from './ui/HintComponent';
import { InteractionMode, LandingPage } from './ui/LandingPage';
import { ModeIndicator } from './ui/ModeIndicator';
import { StatusIndicator } from './ui/StatusIndicator';

/**
 * Application state
 */
type AppState =
  | 'uninitialized'
  | 'initializing'
  | 'landing'
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
  private foggyMirrorController: FoggyMirrorController | null = null;
  private config: AppConfig;
  private currentMode: InteractionMode | null = null;

  // UI Components
  private landingPage: LandingPage | null = null;
  private footer: Footer | null = null;
  private hintComponent: HintComponent | null = null;
  private modeIndicator: ModeIndicator | null = null;
  private statusIndicator: StatusIndicator | null = null;
  private debugComponent: DebugComponent | null = null;

  // DOM elements
  private container: HTMLElement;
  private videoElement: HTMLVideoElement | null = null;

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

      // Initialize UI components
      this.initializeUI();

      // Update status
      this.updateStatus('Initializing...', 'loading');

      // Check browser support
      this.checkBrowserSupport();

      // Initialize hand tracker (preload)
      this.updateStatus('Loading hand tracking model...', 'loading');
      await this.handTracker.initialize(this.videoElement!);

      // Show landing page
      this.showLandingPage();

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
      opacity: 0; /* Hidden initially */
      transition: opacity 0.5s ease;
    `;
    this.container.appendChild(this.videoElement);

    // Set container styles
    this.container.style.cssText = `
      position: relative;
      width: 100%;
      height: 100vh;
      overflow: hidden;
      background: #000;
    `;
  }

  private initializeUI(): void {
    // Landing Page
    this.landingPage = new LandingPage(this.container, (mode) => {
      if (mode === 'galaxy') {
        this.switchToGalaxyMode();
      } else {
        this.switchToFoggyMirrorMode();
      }
    });

    // Footer
    this.footer = new Footer(this.container);

    // Hint Component
    this.hintComponent = new HintComponent(this.container);
    this.hintComponent.onAction((action) => {
      if (action === 'reset') {
        this.resetFoggyMirror();
      }
    });

    // Mode Indicator
    this.modeIndicator = new ModeIndicator(this.container);
    this.modeIndicator.onClick(() => {
      if (this.currentMode === 'galaxy') {
        this.switchToFoggyMirrorMode();
      } else {
        this.switchToGalaxyMode();
      }
    });

    // Status Indicator
    this.statusIndicator = new StatusIndicator(this.container);
    this.statusIndicator.onClick(() => {
      this.toggleDebug();
    });

    // Debug Component
    this.debugComponent = new DebugComponent(this.container);

    // Global Input Listeners
    this.setupGlobalInputListeners();
  }

  private setupGlobalInputListeners(): void {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();

      // Global shortcuts (work everywhere)
      if (key === 'd') {
        this.toggleDebug();
        return;
      } else if (key === 'h') {
        this.toggleControls();
        return;
      }

      // Mode switching shortcuts
      if (key === 'g') {
        this.switchToGalaxyMode();
        return;
      } else if (key === 'f') {
        this.switchToFoggyMirrorMode();
        return;
      }

      // Mode specific shortcuts
      if (this.currentMode === 'foggy-mirror' && key === 'r') {
        this.resetFoggyMirror();
      }
    });
  }

  private showLandingPage(): void {
    this.state = 'landing';
    this.currentMode = null;

    // Hide other UI
    this.statusIndicator?.hide();
    this.footer?.hide();
    if (this.videoElement) this.videoElement.style.opacity = '0';
    this.hintComponent?.hide(); // Assuming hide method exists or I need to add it
    // Actually HintComponent doesn't have hide() in my implementation above, only toggle().
    // I should add hide() to HintComponent.

    // Show landing
    this.landingPage?.show();
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
    this.statusIndicator?.update(message, state);
  }

  /**
   * Enable debug mode
   */
  public enableDebug(): void {
    if (!this.debugComponent) return;

    this.debugComponent.show();

    if (this.currentMode === 'galaxy' && this.controller) {
      this.controller.enableDebug((info) => this.updateGalaxyDebugPanel(info));
    } else if (
      this.currentMode === 'foggy-mirror' &&
      this.foggyMirrorController
    ) {
      this.foggyMirrorController.enableDebug((info) =>
        this.updateFoggyMirrorDebugPanel(info)
      );
    }
  }

  /**
   * Update galaxy debug panel with current info
   */
  private updateGalaxyDebugPanel(info: DebugInfo): void {
    if (!this.debugComponent) return;

    const fps = this.fpsCounter.getFps();

    this.debugComponent.update(`
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
    `);
  }

  /**
   * Update foggy mirror debug panel with current info
   */
  private updateFoggyMirrorDebugPanel(info: FoggyMirrorDebugInfo): void {
    if (!this.debugComponent) return;

    this.debugComponent.update(`
      <div style="margin-bottom: 8px; color: #fff; font-weight: bold;">Debug Info</div>
      <div>FPS: ${info.fps.toFixed(1)}</div>
      <div>Hands: ${info.handsDetected}</div>
      <div>Trail Points: ${info.trailPoints}</div>
      <div>Cleared: ${info.clearedPercentage.toFixed(1)}%</div>
      <div style="margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">
        <div>Wipe Speed: ${info.avgVelocity.toFixed(0)} px/f</div>
        <div>Brush Size: ${info.avgBrushSize.toFixed(0)} px</div>
      </div>
    `);
  }

  /**
   * Start the main animation loop
   */
  private startAnimationLoop(): void {
    if (this.animationFrameId !== null) return;

    const animate = (timestamp: number) => {
      if (this.state !== 'running') {
        this.animationFrameId = null;
        return;
      }

      // Update FPS counter
      this.fpsCounter.update();

      // Update controller based on current mode
      if (this.currentMode === 'galaxy') {
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
      }
      // Note: foggy-mirror mode has its own update loop in FoggyMirrorController

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
    if (!this.debugComponent) return;

    const isVisible = this.debugComponent.toggle();

    if (!isVisible) {
      this.controller?.disableDebug();
      this.foggyMirrorController?.disableDebug();
    } else {
      if (this.currentMode === 'galaxy' && this.controller) {
        this.controller.enableDebug((info) =>
          this.updateGalaxyDebugPanel(info)
        );
      } else if (
        this.currentMode === 'foggy-mirror' &&
        this.foggyMirrorController
      ) {
        this.foggyMirrorController.enableDebug((info) =>
          this.updateFoggyMirrorDebugPanel(info)
        );
      }
    }
  }

  /**
   * Toggle controls hint widget
   */
  toggleControls(): void {
    this.hintComponent?.toggle();
  }

  /**
   * Apply video styles based on interaction mode
   */
  private applyVideoStyles(mode: InteractionMode): void {
    if (!this.videoElement) return;

    const baseStyles = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1);
      transition: opacity 0.5s ease;
      opacity: 1;
    `;

    if (mode === 'galaxy') {
      // Dim video for galaxy mode (background effect)
      this.videoElement.style.cssText =
        baseStyles + 'filter: brightness(0.20) contrast(0.6);';
    } else {
      // Full brightness for foggy-mirror mode
      this.videoElement.style.cssText = baseStyles + 'filter: none;';
    }
  }

  /**
   * Switch to galaxy interaction mode
   */
  switchToGalaxyMode(): void {
    if (this.currentMode === 'galaxy') return;

    console.log('[App] Switching to galaxy mode');

    // Hide landing page
    this.landingPage?.hide();

    // Stop foggy-mirror controller
    if (this.foggyMirrorController) {
      this.foggyMirrorController.stop();
      this.foggyMirrorController.disableDebug();
      this.foggyMirrorController.dispose(); // Fully dispose to save resources
      this.foggyMirrorController = null;
    }

    // Initialize galaxy renderer if needed
    if (!this.galaxyRenderer) {
      this.updateStatus('Creating galaxy...', 'loading');
      this.galaxyRenderer = new GalaxyRenderer(this.container, {
        particleCount: this.config.particleCount,
      });
      this.galaxyRenderer.initialize();
    } else {
      this.galaxyRenderer.show();
    }

    // Initialize controller if needed
    if (!this.controller) {
      this.controller = new HandGalaxyController(
        this.handTracker,
        this.galaxyRenderer
      );
      this.controller.initializeEffects(this.galaxyRenderer.getScene());
    }

    // Apply video styles
    this.applyVideoStyles('galaxy');

    // Update mode
    this.currentMode = 'galaxy';
    this.state = 'running';
    this.updateStatus('Galaxy Mode - Show both hands', 'ready');

    // Show UI elements
    this.statusIndicator?.show();
    this.footer?.show();
    this.hintComponent?.update('galaxy');
    this.hintComponent?.show();
    this.modeIndicator?.update('galaxy');

    // Start loop
    this.startAnimationLoop();

    // Re-enable debug if it was active
    if (this.debugComponent?.isVisibleState() && this.controller) {
      this.controller.enableDebug((info) => this.updateGalaxyDebugPanel(info));
    }
  }

  /**
   * Switch to foggy-mirror interaction mode
   */
  switchToFoggyMirrorMode(): void {
    if (this.currentMode === 'foggy-mirror') return;

    console.log('[App] Switching to foggy-mirror mode');

    // Hide landing page
    this.landingPage?.hide();

    // Stop galaxy mode
    if (this.galaxyRenderer) {
      this.galaxyRenderer.hide();
      // We could dispose it, but keeping it might be faster for switching back.
      // However, user said "fully disable the other".
      // Let's dispose it to be safe and save memory.
      this.galaxyRenderer.dispose();
      this.galaxyRenderer = null;
    }
    if (this.controller) {
      this.controller.dispose();
      this.controller = null;
    }

    // Initialize foggy mirror controller if needed
    if (!this.foggyMirrorController) {
      this.foggyMirrorController = new FoggyMirrorController(
        this.handTracker,
        this.container,
        { debug: this.config.debug }
      );
      this.foggyMirrorController.initialize();
    }

    // Start foggy mirror controller
    this.foggyMirrorController.start();

    // Apply video styles
    this.applyVideoStyles('foggy-mirror');

    // Update mode
    this.currentMode = 'foggy-mirror';
    this.state = 'running';
    this.updateStatus('Foggy Mirror', 'ready');

    // Show UI elements
    this.statusIndicator?.show();
    this.footer?.show();
    this.hintComponent?.update('foggy-mirror');
    this.hintComponent?.show();
    this.modeIndicator?.update('foggy-mirror');

    // Start loop (for FPS and status, though foggy mirror has its own loop)
    this.startAnimationLoop();

    // Re-enable debug if it was active
    if (this.debugComponent?.isVisibleState()) {
      this.foggyMirrorController.enableDebug((info) =>
        this.updateFoggyMirrorDebugPanel(info)
      );
    }
  }

  /**
   * Reset the foggy mirror effect
   */
  resetFoggyMirror(): void {
    if (this.currentMode !== 'foggy-mirror' || !this.foggyMirrorController) {
      return;
    }

    this.foggyMirrorController.reset();
    this.updateStatus('Foggy Mirror Reset', 'active');

    // Reset status message after a short delay
    setTimeout(() => {
      if (this.currentMode === 'foggy-mirror') {
        this.updateStatus('Foggy Mirror', 'ready');
      }
    }, 2000);
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
    this.foggyMirrorController?.dispose();
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
