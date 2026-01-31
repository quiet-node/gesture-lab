/**
 * @fileoverview Type definitions for the Interactive Light Bulb mode.
 *
 * Provides configuration interfaces, state types, and debug info structures
 * for the 3D light bulb interaction experience.
 *
 * @module light-bulb/types
 */

/**
 * Configuration options for the light bulb mode.
 */
export interface LightBulbConfig {
  /** Enable debug overlays and info display */
  debug: boolean;

  /** Bloom post-processing intensity (0-3) */
  bloomStrength: number;

  /** Bloom blur radius */
  bloomRadius: number;

  /** Luminance threshold for bloom activation */
  bloomThreshold: number;

  /** Color of the light bulb when ON (hex value) */
  lightOnColor: number;

  /** Color of the light bulb when OFF (hex value) */
  lightOffColor: number;

  /** Emissive intensity when bulb is ON (0-10) */
  emissiveIntensityOn: number;

  /** Emissive intensity when bulb is OFF (0-1) */
  emissiveIntensityOff: number;

  /** Pinch distance threshold for gesture activation (normalized, 0-1) */
  pinchThreshold: number;

  /** Minimum pull distance in pixels to trigger light toggle */
  cordPullThreshold: number;

  /** Rotation damping factor (0-1, higher = more friction) */
  rotationDamping: number;

  /** Rotation sensitivity multiplier */
  rotationSensitivity: number;

  /** Light state transition duration in seconds */
  lightTransitionDuration: number;
}

/**
 * Default configuration values for the light bulb mode.
 */
export const DEFAULT_LIGHT_BULB_CONFIG: LightBulbConfig = {
  debug: false,
  bloomStrength: 1.8,
  bloomRadius: 0.5,
  bloomThreshold: 0.15,
  lightOnColor: 0xfff4e0, // Warm white
  lightOffColor: 0x333333, // Dark gray
  emissiveIntensityOn: 2.5,
  emissiveIntensityOff: 0.05,
  pinchThreshold: 0.06,
  cordPullThreshold: 40,
  rotationDamping: 0.92,
  rotationSensitivity: 3.0,
  lightTransitionDuration: 0.3,
};

/**
 * State machine values for the light bulb controller.
 */
export enum LightBulbState {
  /** Controller not yet initialized */
  UNINITIALIZED = 'uninitialized',
  /** Resources loaded and ready */
  READY = 'ready',
  /** Actively running and rendering */
  RUNNING = 'running',
  /** Temporarily paused */
  PAUSED = 'paused',
  /** Disposed and cannot be restarted */
  DISPOSED = 'disposed',
}

/**
 * Interaction mode for the current gesture.
 */
export enum InteractionState {
  /** No active interaction */
  IDLE = 'idle',
  /** User is rotating the bulb via pinch-drag on body */
  ROTATING = 'rotating',
  /** User is pulling the cord */
  PULLING_CORD = 'pulling_cord',
}

/**
 * Light state (on/off toggle).
 */
export enum LightState {
  OFF = 'off',
  ON = 'on',
}

/**
 * Cord attachment state.
 */
export enum CordState {
  /** Cord is attached to the light bulb socket */
  ATTACHED = 'attached',
  /** Cord has snapped off and is free-falling */
  DETACHED = 'detached',
}

/**
 * Fatigue state for cord stress accumulation.
 * Models material fatigue from repeated aggressive pulls.
 */
export interface CordFatigueState {
  /** Accumulated stress level (0.0 to 1.0+) */
  stress: number;

  /** Timestamp of last aggressive pull (ms) */
  lastPullTimestamp: number;

  /** Count of aggressive pulls since last reset */
  pullCount: number;

  /** Whether the cord is marked to break on the next upward bounce */
  pendingBreak: boolean;
}

/**
 * Debug information snapshot for the light bulb debug overlay.
 */
export interface LightBulbDebugInfo {
  /** Current frames per second */
  fps: number;

  /** Number of hands currently tracked */
  handsDetected: number;

  /** Whether the light is currently on */
  isLightOn: boolean;

  /** Current interaction state */
  interactionState: InteractionState;

  /** Current pinch distance (normalized) */
  pinchDistance: number;

  /** Current cord pull distance in pixels */
  cordPullDistance: number;

  /** Current bulb rotation in degrees (Y-axis) */
  rotationY: number;

  /** Current bulb rotation in degrees (X-axis) */
  rotationX: number;
}

/**
 * Model part identifiers for the light bulb GLB.
 * These names should match the mesh names in the GLB file.
 */
export enum LightBulbPart {
  /** Main bulb body (glass portion) */
  BULB_BODY = 'bulb_body',
  /** Bulb base/socket */
  BULB_BASE = 'bulb_base',
  /** Pull cord string */
  CORD = 'cord',
  /** Pull cord handle/knob */
  CORD_HANDLE = 'cord_handle',
  /** Filament inside the bulb */
  FILAMENT = 'filament',
}

/**
 * Cord pull state tracking.
 */
export interface CordPullState {
  /** Whether the cord is currently being grabbed */
  isGrabbing: boolean;

  /** X position when grab started (normalized, 0-1) */
  grabStartX: number;

  /** Current X position during drag (normalized, 0-1) */
  currentX: number;

  /** Y position when grab started (normalized, 0-1) */
  grabStartY: number;

  /** Current Y position during drag (normalized, 0-1) */
  currentY: number;

  /** Calculated pull distance in pixels */
  pullDistance: number;

  /** Visual feedback intensity (0-1) */
  feedbackIntensity: number;

  /** Whether the Switch has already been toggled in this interaction */
  hasToggled: boolean;
}

/**
 * Rotation state tracking for smooth gesture control.
 */
export interface RotationState {
  /** Whether currently in rotation mode */
  isRotating: boolean;

  /** Position when rotation started (normalized, 0-1) */
  startPosition: { x: number; y: number };

  /** Current hand position (normalized, 0-1) */
  currentPosition: { x: number; y: number };

  /** Rotation velocity for inertia (radians per frame) */
  velocity: { x: number; y: number };

  /** Target rotation angles (radians) */
  targetRotation: { x: number; y: number };
}
