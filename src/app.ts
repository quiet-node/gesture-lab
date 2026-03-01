/**
 * App - Main Application Class
 * Orchestrates all modules and manages the application lifecycle
 */

import * as THREE from 'three';
import { FoggyMirrorController } from './foggy-mirror/FoggyMirrorController';
import { FoggyMirrorDebugInfo } from './foggy-mirror/types';
import { GalaxyRenderer } from './interactive-galaxy/GalaxyRenderer';
import { HandGalaxyController, DebugInfo } from './interactive-galaxy/HandGalaxyController';
import { CosmicSlashController } from './cosmic-slash/CosmicSlashController';
import { CosmicSlashDebugInfo } from './cosmic-slash/types';
import { WorkshopController } from './iron-man-workshop/WorkshopController';
import { WorkshopDebugInfo } from './iron-man-workshop/types';
import { StellarWaveController } from './stellar-wave/StellarWaveController';
import { StellarWaveDebugInfo } from './stellar-wave/types';
import { LightBulbController } from './light-bulb/LightBulbController';
import { LightBulbDebugInfo } from './light-bulb/types';
import { MagneticClutterController } from './magnetic-clutter/MagneticClutterController';
import { MagneticClutterDebugInfo } from './magnetic-clutter/types';
import { VoxelBuilderController } from './voxel-builder/VoxelBuilderController';
import { VoxelBuilderDebugInfo } from './voxel-builder/types';
import { VisualRecognitionController } from './visual-recognition/VisualRecognitionController';
import type { VisualRecognitionDebugInfo } from './visual-recognition/types';
import { HandTracker } from './shared/HandTracker';
import { DebugComponent } from './ui/DebugComponent';
import { Footer } from './ui/Footer';
import { HintComponent } from './ui/HintComponent';
import { InteractionMode, LandingPage } from './ui/LandingPage';
import { ModeIndicator } from './ui/ModeIndicator';
import { StatusIndicator } from './ui/StatusIndicator';
import { DeviceBanner } from './ui/DeviceBanner';
import { CameraPermissionBanner } from './ui/CameraPermissionBanner';

/**
 * Application state
 */
type AppState = 'uninitialized' | 'initializing' | 'landing' | 'running' | 'error' | 'disposed';

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
  private cosmicSlashController: CosmicSlashController | null = null;
  private workshopController: WorkshopController | null = null;
  private stellarWaveController: StellarWaveController | null = null;
  private lightBulbController: LightBulbController | null = null;
  private magneticClutterController: MagneticClutterController | null = null;
  private voxelBuilderController: VoxelBuilderController | null = null;
  private visualRecognitionController: VisualRecognitionController | null = null;
  private config: AppConfig;
  private currentMode: InteractionMode | null = null;

  // UI Components
  private landingPage: LandingPage | null = null;
  private footer: Footer | null = null;
  private hintComponent: HintComponent | null = null;
  private modeIndicator: ModeIndicator | null = null;
  private statusIndicator: StatusIndicator | null = null;
  private debugComponent: DebugComponent | null = null;
  private deviceBanner: DeviceBanner | null = null;
  private cameraPermissionBanner: CameraPermissionBanner | null = null;

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
      if (mode === 'iron-man-workshop') {
        this.switchToWorkshopMode();
      } else if (mode === 'cosmic-slash') {
        this.switchToCosmicSlashMode();
      } else if (mode === 'galaxy') {
        this.switchToGalaxyMode();
      } else if (mode === 'foggy-mirror') {
        this.switchToFoggyMirrorMode();
      } else if (mode === 'stellar-wave') {
        this.switchToStellarWaveMode();
      } else if (mode === 'light-bulb') {
        this.switchToLightBulbMode();
      } else if (mode === 'magnetic-clutter') {
        this.switchToMagneticClutterMode();
      } else if (mode === 'voxel-builder') {
        this.switchToVoxelBuilderMode();
      } else if (mode === 'visual-recognition') {
        this.switchToVisualRecognitionMode();
      }
    });

    // Footer
    this.footer = new Footer(this.container);
    this.footer.onClick(() => this.returnToMainMenu());

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
      this.returnToMainMenu();
    });

    // Status Indicator
    this.statusIndicator = new StatusIndicator(this.container);
    this.statusIndicator.onClick(() => {
      this.toggleDebug();
    });

    // Debug Component
    this.debugComponent = new DebugComponent(this.container);

    // Device Banner (for non-laptop screens)
    this.deviceBanner = new DeviceBanner();
    this.deviceBanner.show();

    // Camera Permission Banner (shown when camera is denied)
    this.cameraPermissionBanner = new CameraPermissionBanner();

    // Global Input Listeners
    this.setupGlobalInputListeners();
  }

  private setupGlobalInputListeners(): void {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();

      if (event.code === 'Space') {
        if (this.currentMode === 'cosmic-slash' && this.cosmicSlashController) {
          event.preventDefault();
          const paused = this.cosmicSlashController.togglePause();
          if (paused) {
            this.updateStatus('Paused — Press Space to resume', 'ready');
          }
        }
        return;
      }

      // Global shortcuts (work everywhere)
      if (key === 'd') {
        this.toggleDebug();
        return;
      } else if (key === 'h') {
        this.toggleControls();
        return;
      } else if (key === 'm') {
        this.returnToMainMenu();
        return;
      }

      // Mode switching shortcuts
      if (key === 'i') {
        this.switchToWorkshopMode();
        return;
      } else if (key === 'c') {
        this.switchToCosmicSlashMode();
        return;
      } else if (key === 'g') {
        this.switchToGalaxyMode();
        return;
      } else if (key === 'f') {
        this.switchToFoggyMirrorMode();
        return;
      } else if (key === 's') {
        this.switchToStellarWaveMode();
        return;
      } else if (key === 'l') {
        this.switchToLightBulbMode();
        return;
      } else if (key === 'k') {
        this.switchToMagneticClutterMode();
        return;
      } else if (key === 'v') {
        this.switchToVoxelBuilderMode();
        return;
      } else if (key === 'o') {
        this.switchToVisualRecognitionMode();
        return;
      }

      // Mode specific shortcuts
      if (key === 'r') {
        // Restart current mode
        if (this.currentMode === 'foggy-mirror') {
          this.resetFoggyMirror();
        } else if (this.currentMode === 'cosmic-slash') {
          this.cosmicSlashController?.reset();
        } else if (this.currentMode === 'galaxy') {
          this.controller?.reset();
        } else if (this.currentMode === 'iron-man-workshop') {
          this.workshopController?.reset();
        } else if (this.currentMode === 'stellar-wave') {
          this.stellarWaveController?.reset();
        } else if (this.currentMode === 'light-bulb') {
          this.lightBulbController?.reset();
        } else if (this.currentMode === 'magnetic-clutter') {
          this.magneticClutterController?.reset();
        } else if (this.currentMode === 'voxel-builder') {
          this.voxelBuilderController?.reset();
        } else if (this.currentMode === 'visual-recognition') {
          this.visualRecognitionController?.reset();
        }
        return;
      }
    });
  }

  private showLandingPage(): void {
    this.state = 'landing';
    this.currentMode = null;

    // Show/Keep other UI
    this.statusIndicator?.hide();
    this.footer?.show();
    if (this.videoElement) this.videoElement.style.opacity = '0';
    this.hintComponent?.hide();

    // Show landing
    this.landingPage?.show();
  }

  /**
   * Stop and dispose the currently active mode controller (if any).
   * This centralizes all mode cleanup logic to prevent resource leaks
   * and ensure modes are mutually exclusive.
   */
  private stopCurrentMode(): void {
    // Stop galaxy mode
    if (this.galaxyRenderer) {
      this.galaxyRenderer.hide();
      this.galaxyRenderer.dispose();
      this.galaxyRenderer = null;
    }
    if (this.controller) {
      this.controller.disableDebug();
      this.controller.dispose();
      this.controller = null;
    }

    // Stop foggy-mirror controller
    if (this.foggyMirrorController) {
      this.foggyMirrorController.stop();
      this.foggyMirrorController.disableDebug();
      this.foggyMirrorController.dispose();
      this.foggyMirrorController = null;
    }

    // Stop cosmic slash controller
    if (this.cosmicSlashController) {
      this.cosmicSlashController.stop();
      this.cosmicSlashController.disableDebug();
      this.cosmicSlashController.dispose();
      this.cosmicSlashController = null;
    }

    // Stop workshop controller
    if (this.workshopController) {
      this.workshopController.stop();
      this.workshopController.disableDebug();
      this.workshopController.dispose();
      this.workshopController = null;
    }

    // Stop stellar wave controller
    if (this.stellarWaveController) {
      this.stellarWaveController.stop();
      this.stellarWaveController.disableDebug();
      this.stellarWaveController.dispose();
      this.stellarWaveController = null;
    }

    // Stop light bulb controller
    if (this.lightBulbController) {
      this.lightBulbController.dispose();
      this.lightBulbController = null;
    }

    // Stop magnetic clutter controller
    if (this.magneticClutterController) {
      this.magneticClutterController.stop();
      this.magneticClutterController.disableDebug();
      this.magneticClutterController.dispose();
      this.magneticClutterController = null;
    }

    // Stop voxel builder controller
    if (this.voxelBuilderController) {
      this.voxelBuilderController.stop();
      this.voxelBuilderController.disableDebug();
      this.voxelBuilderController.dispose();
      this.voxelBuilderController = null;
    }

    // Stop visual recognition controller
    if (this.visualRecognitionController) {
      this.visualRecognitionController.stop();
      this.visualRecognitionController.disableDebug();
      this.visualRecognitionController.dispose();
      this.visualRecognitionController = null;
    }
  }

  private returnToMainMenu(): void {
    if (this.state === 'landing') {
      this.showLandingPage();
      return;
    }

    this.stopCurrentMode();
    this.cameraPermissionBanner?.hide();

    this.showLandingPage();
  }

  private updateHandStatus(handCount: number): void {
    if (this.currentMode === null) return;

    if (this.currentMode === 'cosmic-slash' && this.cosmicSlashController) {
      if (this.cosmicSlashController.getIsPaused()) {
        this.updateStatus('Paused — Press Space to resume', 'ready');
        return;
      }
    }

    // Only show hand detection status if debug mode is enabled
    // This reduces visual clutter during normal usage
    const isDebug = this.debugComponent?.isVisibleState() ?? false;
    if (!isDebug) {
      this.statusIndicator?.hide();
      return;
    }

    if (handCount <= 0) {
      this.updateStatus('No hands detected', 'ready');
      return;
    }
    if (handCount === 1) {
      this.updateStatus('1 hand detected', 'active');
      return;
    }
    this.updateStatus(`${handCount} hands detected`, 'active');
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
  private updateStatus(message: string, state: 'loading' | 'ready' | 'error' | 'active'): void {
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
    } else if (this.currentMode === 'foggy-mirror' && this.foggyMirrorController) {
      this.foggyMirrorController.enableDebug((info) => this.updateFoggyMirrorDebugPanel(info));
    } else if (this.currentMode === 'cosmic-slash' && this.cosmicSlashController) {
      this.cosmicSlashController.enableDebug((info) => this.updateCosmicSlashDebugPanel(info));
    } else if (this.currentMode === 'iron-man-workshop' && this.workshopController) {
      this.workshopController.enableDebug((info) => this.updateWorkshopDebugPanel(info));
    } else if (this.currentMode === 'stellar-wave' && this.stellarWaveController) {
      this.stellarWaveController.enableDebug((info) => this.updateStellarWaveDebugPanel(info));
    } else if (this.currentMode === 'light-bulb' && this.lightBulbController) {
      this.lightBulbController.enableDebug((info) => this.updateLightBulbDebugPanel(info));
    } else if (this.currentMode === 'magnetic-clutter' && this.magneticClutterController) {
      this.magneticClutterController.enableDebug((info) =>
        this.updateMagneticClutterDebugPanel(info)
      );
    } else if (this.currentMode === 'voxel-builder' && this.voxelBuilderController) {
      this.voxelBuilderController.enableDebug((info) => this.updateVoxelBuilderDebugPanel(info));
    } else if (this.currentMode === 'visual-recognition' && this.visualRecognitionController) {
      this.visualRecognitionController.enableDebug((info) =>
        this.updateVisualRecognitionDebugPanel(info)
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
      <div>Cleared: ${info.clearedPercentage.toFixed(1)}%</div>
      <div style="margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">
        <div>Wipe Speed: ${info.avgVelocity.toFixed(0)} px/f</div>
        <div>Brush Size: ${info.avgBrushSize.toFixed(0)} px</div>
      </div>
    `);
  }

  /**
   * Update cosmic slash debug panel with current info
   */
  private updateCosmicSlashDebugPanel(info: CosmicSlashDebugInfo): void {
    if (!this.debugComponent) return;

    this.debugComponent.update(`
      <div style="margin-bottom: 8px; color: #fff; font-weight: bold;">Debug Info</div>
      <div>FPS: ${info.fps.toFixed(1)}</div>
      <div>Hands: ${info.handsDetected}</div>
      <div>Active Objects: ${info.activeObjects}</div>
      <div>Total Sliced: ${info.totalSliced}</div>
      <div style="margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">
        <div>Active Explosions: ${info.activeExplosions}</div>
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

        const handCount = this.controller?.getHandCount() ?? 0;
        this.updateHandStatus(handCount);
      } else if (this.currentMode === 'foggy-mirror') {
        const handCount = this.foggyMirrorController?.getHandCount() ?? 0;
        this.updateHandStatus(handCount);
      } else if (this.currentMode === 'cosmic-slash') {
        const handCount = this.cosmicSlashController?.getHandCount() ?? 0;
        this.updateHandStatus(handCount);
      } else if (this.currentMode === 'iron-man-workshop') {
        const handCount = this.workshopController?.getHandCount() ?? 0;
        this.updateHandStatus(handCount);
      } else if (this.currentMode === 'stellar-wave') {
        const handCount = this.stellarWaveController?.getHandCount() ?? 0;
        this.updateHandStatus(handCount);
      } else if (this.currentMode === 'light-bulb') {
        const handCount = this.lightBulbController?.getHandCount() ?? 0;
        this.updateHandStatus(handCount);
      } else if (this.currentMode === 'magnetic-clutter') {
        const handCount = this.magneticClutterController?.getHandCount() ?? 0;
        this.updateHandStatus(handCount);
      } else if (this.currentMode === 'voxel-builder') {
        const handCount = this.voxelBuilderController?.getHandCount() ?? 0;
        this.updateHandStatus(handCount);
      } else if (this.currentMode === 'visual-recognition') {
        // Visual Recognition does not use hand tracking; status handled by its own controller
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
      this.cosmicSlashController?.disableDebug();
      this.workshopController?.disableDebug();
      this.stellarWaveController?.disableDebug();
      this.lightBulbController?.disableDebug();
      this.magneticClutterController?.disableDebug();
      this.voxelBuilderController?.disableDebug();
      this.visualRecognitionController?.disableDebug();
    } else {
      if (this.currentMode === 'galaxy' && this.controller) {
        this.controller.enableDebug((info) => this.updateGalaxyDebugPanel(info));
      } else if (this.currentMode === 'foggy-mirror' && this.foggyMirrorController) {
        this.foggyMirrorController.enableDebug((info) => this.updateFoggyMirrorDebugPanel(info));
      } else if (this.currentMode === 'cosmic-slash' && this.cosmicSlashController) {
        this.cosmicSlashController.enableDebug((info) => this.updateCosmicSlashDebugPanel(info));
      } else if (this.currentMode === 'iron-man-workshop' && this.workshopController) {
        this.workshopController.enableDebug((info) => this.updateWorkshopDebugPanel(info));
      } else if (this.currentMode === 'stellar-wave' && this.stellarWaveController) {
        this.stellarWaveController.enableDebug((info) => this.updateStellarWaveDebugPanel(info));
      } else if (this.currentMode === 'light-bulb' && this.lightBulbController) {
        this.lightBulbController.enableDebug((info) => this.updateLightBulbDebugPanel(info));
      } else if (this.currentMode === 'magnetic-clutter' && this.magneticClutterController) {
        this.magneticClutterController.enableDebug((info) =>
          this.updateMagneticClutterDebugPanel(info)
        );
      } else if (this.currentMode === 'voxel-builder' && this.voxelBuilderController) {
        this.voxelBuilderController.enableDebug((info) => this.updateVoxelBuilderDebugPanel(info));
      } else if (this.currentMode === 'visual-recognition' && this.visualRecognitionController) {
        this.visualRecognitionController.enableDebug((info) =>
          this.updateVisualRecognitionDebugPanel(info)
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
      this.videoElement.style.cssText = baseStyles + 'filter: brightness(0.20) contrast(0.6);';
    } else if (mode === 'cosmic-slash') {
      // Dim video for cosmic slash (cosmic background effect)
      this.videoElement.style.cssText =
        baseStyles + 'filter: brightness(0.25) contrast(0.7) saturate(0.8);';
    } else if (mode === 'iron-man-workshop') {
      // Slight dim for workshop mode to make glowing elements more visible
      this.videoElement.style.cssText =
        baseStyles + 'filter: brightness(0.4) contrast(0.9) saturate(0.8);';
    } else if (mode === 'stellar-wave') {
      // Dim video for stellar wave to make dots more visible
      this.videoElement.style.cssText =
        baseStyles + 'filter: brightness(0.2) contrast(0.7) saturate(0.8);';
    } else if (mode === 'light-bulb') {
      // Dark background for dramatic light bulb effect - makes glow more visible
      this.videoElement.style.cssText =
        baseStyles + 'filter: brightness(0.3) contrast(0.7) saturate(0.5);';
    } else if (mode === 'magnetic-clutter') {
      // Dark background to match CodePen style
      this.videoElement.style.cssText =
        baseStyles + 'filter: brightness(0.05) contrast(1) saturate(1);';
    } else if (mode === 'voxel-builder') {
      // Subtle self-view with enough contrast for voxel visibility
      this.videoElement.style.cssText =
        baseStyles + 'filter: brightness(0.25) contrast(0.8) saturate(0.7);';
    } else if (mode === 'visual-recognition') {
      // Near-full brightness so the user can clearly see themselves and objects
      this.videoElement.style.cssText = baseStyles + 'filter: brightness(0.95) contrast(1.1);';
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

    // Stop any currently active mode
    this.stopCurrentMode();

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
      this.controller = new HandGalaxyController(this.handTracker, this.galaxyRenderer);
      this.controller.initializeEffects(this.galaxyRenderer.getScene());
    }

    // Apply video styles
    this.applyVideoStyles('galaxy');

    // Update mode
    this.currentMode = 'galaxy';
    this.state = 'running';
    this.updateHandStatus(0);

    // Show UI elements

    this.footer?.show();
    this.hintComponent?.update('galaxy');
    this.hintComponent?.show();
    this.modeIndicator?.update('galaxy');

    // Start loop
    this.startAnimationLoop();

    // Show camera permission banner if camera is not enabled
    if (!this.handTracker.isCameraEnabled()) {
      this.cameraPermissionBanner?.show('galaxy');
    }

    // Re-enable debug if it was active
    if (this.debugComponent?.isVisibleState() && this.controller) {
      this.controller.enableDebug((info) => this.updateGalaxyDebugPanel(info));
    }
  }

  /**
   * Switch to magnetic clutter interaction mode
   */
  switchToMagneticClutterMode(): void {
    if (this.currentMode === 'magnetic-clutter') return;

    console.log('[App] Switching to magnetic-clutter mode');

    this.landingPage?.hide();
    this.stopCurrentMode();

    if (!this.magneticClutterController) {
      this.magneticClutterController = new MagneticClutterController(
        this.handTracker,
        this.container,
        { debug: this.config.debug }
      );
      this.magneticClutterController.initialize();
    }

    this.magneticClutterController.start();

    this.applyVideoStyles('magnetic-clutter');
    this.currentMode = 'magnetic-clutter';
    this.state = 'running';
    this.updateHandStatus(0);

    this.footer?.show();
    this.hintComponent?.update('magnetic-clutter');
    this.hintComponent?.show();
    this.modeIndicator?.update('magnetic-clutter');

    this.startAnimationLoop();

    if (!this.handTracker.isCameraEnabled()) {
      this.cameraPermissionBanner?.show('magnetic-clutter');
    }

    if (this.debugComponent?.isVisibleState()) {
      this.magneticClutterController.enableDebug((info) =>
        this.updateMagneticClutterDebugPanel(info)
      );
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

    // Stop any currently active mode
    this.stopCurrentMode();

    // Initialize foggy mirror controller if needed
    if (!this.foggyMirrorController) {
      this.foggyMirrorController = new FoggyMirrorController(this.handTracker, this.container, {
        debug: this.config.debug,
      });
      this.foggyMirrorController.initialize();
    }

    // Start foggy mirror controller
    this.foggyMirrorController.start();

    // Apply video styles
    this.applyVideoStyles('foggy-mirror');

    // Update mode
    this.currentMode = 'foggy-mirror';
    this.state = 'running';
    this.updateHandStatus(0);

    // Show UI elements

    this.footer?.show();
    this.hintComponent?.update('foggy-mirror');
    this.hintComponent?.show();
    this.modeIndicator?.update('foggy-mirror');

    // Start loop (for FPS and status, though foggy mirror has its own loop)
    this.startAnimationLoop();

    // Show camera permission banner if camera is not enabled
    if (!this.handTracker.isCameraEnabled()) {
      this.cameraPermissionBanner?.show('foggy-mirror');
    }

    // Re-enable debug if it was active
    if (this.debugComponent?.isVisibleState()) {
      this.foggyMirrorController.enableDebug((info) => this.updateFoggyMirrorDebugPanel(info));
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
   * Switch to cosmic slash interaction mode
   */
  switchToCosmicSlashMode(): void {
    if (this.currentMode === 'cosmic-slash') return;

    console.log('[App] Switching to cosmic-slash mode');

    // Hide landing page
    this.landingPage?.hide();

    // Stop any currently active mode
    this.stopCurrentMode();

    // Initialize cosmic slash controller if needed
    if (!this.cosmicSlashController) {
      this.updateStatus('Loading Cosmic Slash...', 'loading');
      this.cosmicSlashController = new CosmicSlashController(this.handTracker, this.container, {
        debug: this.config.debug,
      });
      this.cosmicSlashController.initialize();
    }

    // Start cosmic slash controller
    this.cosmicSlashController.start();

    // Apply video styles - dim video for cosmic mode
    this.applyVideoStyles('cosmic-slash');

    // Update mode
    this.currentMode = 'cosmic-slash';
    this.state = 'running';
    this.updateHandStatus(0);

    // Show UI elements

    this.footer?.show();
    this.hintComponent?.update('cosmic-slash');
    this.hintComponent?.show();
    this.modeIndicator?.update('cosmic-slash');

    // Start loop
    this.startAnimationLoop();

    // Show camera permission banner if camera is not enabled
    if (!this.handTracker.isCameraEnabled()) {
      this.cameraPermissionBanner?.show('cosmic-slash');
    }

    // Re-enable debug if it was active
    if (this.debugComponent?.isVisibleState()) {
      this.cosmicSlashController.enableDebug((info) => this.updateCosmicSlashDebugPanel(info));
    }
  }

  /**
   * Switch to workshop interaction mode
   */
  switchToWorkshopMode(): void {
    if (this.currentMode === 'iron-man-workshop') return;

    console.log('[App] Switching to workshop mode');

    // Hide landing page
    this.landingPage?.hide();

    // Stop any currently active mode
    this.stopCurrentMode();

    // Initialize workshop controller if needed
    if (!this.workshopController) {
      this.updateStatus('Loading Workshop...', 'loading');
      this.workshopController = new WorkshopController(this.handTracker, this.container, {
        debug: this.config.debug,
      });
      this.workshopController.initialize();
    }

    // Start workshop controller
    this.workshopController.start();

    // Apply video styles - show webcam behind hologram
    this.applyVideoStyles('iron-man-workshop');

    // Update mode
    this.currentMode = 'iron-man-workshop';
    this.state = 'running';
    this.updateHandStatus(0);

    // Show UI elements

    this.footer?.show();
    this.hintComponent?.update('iron-man-workshop');
    this.hintComponent?.show();
    this.modeIndicator?.update('iron-man-workshop');

    // Start loop
    this.startAnimationLoop();

    // Show camera permission banner if camera is not enabled
    if (!this.handTracker.isCameraEnabled()) {
      this.cameraPermissionBanner?.show('iron-man-workshop');
    }

    // Re-enable debug if it was active
    if (this.debugComponent?.isVisibleState()) {
      this.workshopController.enableDebug((info) => this.updateWorkshopDebugPanel(info));
    }
  }

  /**
   * Update workshop debug panel with current info
   */
  private updateWorkshopDebugPanel(info: WorkshopDebugInfo): void {
    if (!this.debugComponent) return;

    this.debugComponent.update(`
      <div style="margin-bottom: 8px; color: #fff; font-weight: bold;">Debug Info</div>
      <div>FPS: ${info.fps.toFixed(1)}</div>
      <div>Hands: ${info.handsDetected}</div>
      <div>Grabbing: ${info.isGrabbing ? '<span style="color: #0ff;">YES</span>' : 'No'}</div>
      <div>Active Elements: ${info.activeElements}</div>
      <div>Bloom: ${info.bloomEnabled ? 'ON' : 'OFF'}</div>
    `);
  }

  /**
   * Switch to stellar wave interaction mode
   */
  switchToStellarWaveMode(): void {
    if (this.currentMode === 'stellar-wave') return;

    console.log('[App] Switching to stellar-wave mode');

    // Hide landing page
    this.landingPage?.hide();

    // Stop any currently active mode
    this.stopCurrentMode();

    // Initialize stellar wave controller if needed
    if (!this.stellarWaveController) {
      this.updateStatus('Loading Stellar Wave...', 'loading');
      this.stellarWaveController = new StellarWaveController(this.handTracker, this.container);
      this.stellarWaveController.initialize();
    }

    // Start stellar wave controller
    this.stellarWaveController.start();

    // Apply video styles - dim video for stellar wave mode
    this.applyVideoStyles('stellar-wave');

    // Update mode
    this.currentMode = 'stellar-wave';
    this.state = 'running';
    this.updateHandStatus(0);

    // Show UI elements
    this.footer?.show();
    this.hintComponent?.update('stellar-wave');
    this.hintComponent?.show();
    this.modeIndicator?.update('stellar-wave');

    // Start loop
    this.startAnimationLoop();

    // Show camera permission banner if camera is not enabled
    if (!this.handTracker.isCameraEnabled()) {
      this.cameraPermissionBanner?.show('stellar-wave');
    }

    // Re-enable debug if it was active
    if (this.debugComponent?.isVisibleState()) {
      this.stellarWaveController.enableDebug((info) => this.updateStellarWaveDebugPanel(info));
    }
  }

  /**
   * Update stellar wave debug panel with current info
   */
  private updateStellarWaveDebugPanel(info: StellarWaveDebugInfo): void {
    if (!this.debugComponent) return;

    this.debugComponent.update(`
      <div style="margin-bottom: 8px; color: #fff; font-weight: bold;">Debug Info</div>
      <div>FPS: ${info.fps.toFixed(1)}</div>
      <div>Hands: ${info.handsDetected}</div>
      <div>Dots: ${info.dotCount}</div>
      <div>Active Ripples: ${info.activeRipples}</div>
      <div style="margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">
        <div>Physics: ${info.physicsTimeMs.toFixed(1)} ms</div>
      </div>
    `);
  }

  /**
   * Switch to light bulb interaction mode
   */
  switchToLightBulbMode(): void {
    if (this.currentMode === 'light-bulb') return;

    console.log('[App] Switching to light-bulb mode');

    // Hide landing page
    this.landingPage?.hide();

    // Stop any currently active mode
    this.stopCurrentMode();

    // Initialize light bulb controller if needed
    if (!this.lightBulbController) {
      this.updateStatus('Loading Light Bulb...', 'loading');
      this.lightBulbController = new LightBulbController(this.handTracker, this.container, {
        debug: this.config.debug,
      });
      this.lightBulbController.initialize();
    }

    // Start light bulb controller
    this.lightBulbController.start();

    // Apply video styles - moderate dim to make 3D model visible
    this.applyVideoStyles('light-bulb');

    // Update mode
    this.currentMode = 'light-bulb';
    this.state = 'running';
    this.updateHandStatus(0);

    // Show UI elements
    this.footer?.show();
    this.hintComponent?.update('light-bulb');
    this.hintComponent?.show();
    this.modeIndicator?.update('light-bulb');

    // Start loop
    this.startAnimationLoop();

    // Show camera permission banner if camera is not enabled
    if (!this.handTracker.isCameraEnabled()) {
      this.cameraPermissionBanner?.show('light-bulb');
    }

    // Re-enable debug if it was active
    if (this.debugComponent?.isVisibleState()) {
      this.lightBulbController.enableDebug((info) => this.updateLightBulbDebugPanel(info));
    }
  }

  /**
   * Update light bulb debug panel with current info
   */
  private updateLightBulbDebugPanel(info: LightBulbDebugInfo): void {
    if (!this.debugComponent) return;

    this.debugComponent.update(`
      <div style="margin-bottom: 8px; color: #fff; font-weight: bold;">Debug Info</div>
      <div>FPS: ${info.fps.toFixed(1)}</div>
      <div>Hands: ${info.handsDetected}</div>
      <div>Light: ${info.isLightOn ? '<span style="color: #ffd700;">ON</span>' : 'OFF'}</div>
      <div>State: ${info.interactionState}</div>
      <div style="margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">
        <div>Rotation X: ${info.rotationX.toFixed(1)}°</div>
        <div>Rotation Y: ${info.rotationY.toFixed(1)}°</div>
        <div>Cord Pull: ${info.cordPullDistance.toFixed(0)}px</div>
      </div>
    `);
  }

  /**
   * Update magnetic clutter debug panel with current info
   */
  private updateMagneticClutterDebugPanel(info: MagneticClutterDebugInfo): void {
    if (!this.debugComponent) return;

    this.debugComponent.update(`
      <div style="margin-bottom: 8px; color: #fff; font-weight: bold;">Debug Info</div>
      <div>FPS: ${info.fps.toFixed(1)}</div>
      <div>Hands: ${info.handsDetected}</div>
      <div>Balls: ${info.activeBalls}</div>
      <div style="margin-top: 4px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 4px;">
        <div>Repulsor: ${info.isRepulsing ? '<span style="color: #f00;">ON</span>' : 'OFF'}</div>
        <div>Grabber: ${info.isGrabbing ? '<span style="color: #0f0;">ON</span>' : 'OFF'}</div>
        <div>Physics: ${info.physicsTimeMs.toFixed(1)} ms</div>
      </div>
    `);
  }

  /**
   * Switch to voxel builder interaction mode
   */
  switchToVoxelBuilderMode(): void {
    if (this.currentMode === 'voxel-builder') return;

    console.log('[App] Switching to voxel-builder mode');

    this.landingPage?.hide();
    this.stopCurrentMode();

    if (!this.voxelBuilderController) {
      this.voxelBuilderController = new VoxelBuilderController(this.handTracker, this.container, {
        debug: this.config.debug,
      });
      this.voxelBuilderController.initialize();
    }

    this.voxelBuilderController.start();

    this.applyVideoStyles('voxel-builder');
    this.currentMode = 'voxel-builder';
    this.state = 'running';
    this.updateHandStatus(0);

    this.footer?.show();
    this.hintComponent?.update('voxel-builder');
    this.hintComponent?.show();
    this.modeIndicator?.update('voxel-builder');

    this.startAnimationLoop();

    if (!this.handTracker.isCameraEnabled()) {
      this.cameraPermissionBanner?.show('voxel-builder');
    }

    if (this.debugComponent?.isVisibleState()) {
      this.voxelBuilderController.enableDebug((info) => this.updateVoxelBuilderDebugPanel(info));
    }
  }

  /**
   * Update voxel builder debug panel with current telemetry
   */
  private updateVoxelBuilderDebugPanel(info: VoxelBuilderDebugInfo): void {
    if (!this.debugComponent) return;

    this.debugComponent.update(`
      <div style="margin-bottom: 8px; color: #fff; font-weight: bold;">Debug Info</div>
      <div>FPS: ${info.fps}</div>
      <div>Hands: ${info.handsDetected}</div>
      <div>Boxes: ${info.boxCount}</div>
      <div>Drawing: ${info.isDrawing ? '<span style="color: #0f0;">YES</span>' : 'No'}</div>
      <div>Grid: ${info.gridPosition}</div>
      ${info.performanceWarning ? '<div style="color: #f00; margin-top: 4px;">⚠ Low FPS — spawning paused</div>' : ''}
    `);
  }

  /**
   * Switch to visual recognition interaction mode.
   * Unlike other modes, Visual Recognition does not use HandTracker —
   * it uses Roboflow inferencejs for object detection on the video feed.
   */
  async switchToVisualRecognitionMode(): Promise<void> {
    if (this.currentMode === 'visual-recognition') return;

    console.log('[App] Switching to visual-recognition mode');

    this.landingPage?.hide();
    this.stopCurrentMode();
    this.applyVideoStyles('visual-recognition');

    if (!this.visualRecognitionController) {
      this.updateStatus('Loading Visual Recognition Model...', 'loading');
      this.visualRecognitionController = new VisualRecognitionController(
        this.videoElement!,
        this.container,
        { debug: this.config.debug }
      );

      try {
        await this.visualRecognitionController.initialize();
        this.updateStatus('Visual Recognition Ready', 'ready');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[App] Visual recognition initialization failed:', message);
        this.updateStatus(`Model error: ${message}`, 'error');
        this.visualRecognitionController.dispose();
        this.visualRecognitionController = null;
        return;
      }
    }

    this.visualRecognitionController.start();

    this.currentMode = 'visual-recognition';
    this.state = 'running';

    this.footer?.show();
    this.hintComponent?.update('visual-recognition');
    this.hintComponent?.show();
    this.modeIndicator?.update('visual-recognition');

    this.startAnimationLoop();

    // Visual Recognition uses its own camera access via the shared video element,
    // but still requires camera permission
    if (!this.handTracker.isCameraEnabled()) {
      this.cameraPermissionBanner?.show('visual-recognition');
    }

    if (this.debugComponent?.isVisibleState()) {
      this.visualRecognitionController.enableDebug((info) =>
        this.updateVisualRecognitionDebugPanel(info)
      );
    }
  }

  /**
   * Update visual recognition debug panel with detection telemetry
   */
  private updateVisualRecognitionDebugPanel(info: VisualRecognitionDebugInfo): void {
    if (!this.debugComponent) return;

    this.debugComponent.update(`
      <div style="margin-bottom: 8px; color: #fff; font-weight: bold;">Debug Info</div>
      <div>FPS: ${info.fps.toFixed(1)}</div>
      <div>Detections: ${info.detectionCount}</div>
      <div>Inference: ${info.inferenceTimeMs.toFixed(0)} ms</div>
      <div>Model: ${info.modelReady ? '<span style="color: #0f0;">Ready</span>' : '<span style="color: #f00;">Loading</span>'}</div>
      <div>Total Frames: ${info.totalFrames}</div>
    `);
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
    this.cosmicSlashController?.dispose();
    this.workshopController?.dispose();
    this.stellarWaveController?.dispose();
    this.lightBulbController?.dispose();
    this.magneticClutterController?.dispose();
    this.voxelBuilderController?.dispose();
    this.visualRecognitionController?.dispose();
    this.handTracker.dispose();
    this.galaxyRenderer?.dispose();
    this.deviceBanner?.dispose();
    this.cameraPermissionBanner?.dispose();

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
