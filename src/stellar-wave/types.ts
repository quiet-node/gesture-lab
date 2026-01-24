/**
 * Stellar Wave Mode Type Definitions
 *
 * Configuration, state, and interface types for the Stellar Wave interactive
 * dot grid visualization. Physics parameters match the reference SwiftUI
 * implementation for consistent visual behavior.
 */

/**
 * Represents a single point in the mesh grid
 * Each point has spring physics for elastic return to rest position
 */
export interface MeshPoint {
  /** Current position in screen coordinates (pixels) */
  position: { x: number; y: number };

  /** Rest position - where the dot returns to after disturbance */
  restPosition: { x: number; y: number };

  /** Current velocity vector for physics simulation */
  velocity: { dx: number; dy: number };

  /** Whether this point is fixed (edge points don't move) */
  pinned: boolean;

  /** Ripple intensity for color transition (0-1, decays over time) */
  rippleIntensity: number;
}

/**
 * State for tracking an active ripple wave
 */
export interface RippleState {
  /** Center point of the ripple in screen coordinates */
  center: { x: number; y: number };

  /** Time when ripple was triggered (seconds, from animation clock) */
  startTime: number;

  /** Whether this ripple is still active */
  active: boolean;
}

/**
 * Configuration for the Stellar Wave renderer
 * Values match the original SwiftUI implementation for visual consistency
 */
export interface StellarWaveConfig {
  /** Grid spacing in pixels between dots */
  spacing: number;

  /** Spring stiffness coefficient (force toward rest position) */
  stiffness: number;

  /** Velocity damping factor per frame (0-1, higher = more friction) */
  damping: number;

  /** Radius of influence for push interaction in pixels */
  influenceRadius: number;

  /** Ripple wave expansion speed in pixels per second */
  rippleSpeed: number;

  // Interaction params
  /** Radius of repulsion effect in pixels */
  interactionRadius: number;
  /** Strength of the repulsion force */
  repulsionStrength: number;

  // Audio params
  /** Frequency of the ripple sound in Hz */
  rippleFreq: number;

  /** Width of the ripple ring in pixels */
  rippleWidth: number;

  /** Total duration of ripple effect in seconds */
  rippleDuration: number;

  /** Maximum concurrent ripples allowed */
  maxRipples: number;

  /** Normal dot radius in pixels */
  normalDotRadius: number;

  /** Dot radius when affected by ripple */
  rippleDotRadius: number;
}

/**
 * Default configuration matching the SwiftUI reference implementation
 */
export const DEFAULT_STELLAR_WAVE_CONFIG: StellarWaveConfig = {
  spacing: 35,
  stiffness: 0.08,
  damping: 0.92,
  influenceRadius: 120,
  rippleSpeed: 350,
  rippleWidth: 150,
  rippleDuration: 4.0,
  maxRipples: 5,
  normalDotRadius: 3,
  rippleDotRadius: 4,

  // Interaction params
  interactionRadius: 150,
  repulsionStrength: 5.0,

  // Audio params
  rippleFreq: 440,
};

/**
 * Debug information for development and performance monitoring
 */
export interface StellarWaveDebugInfo {
  /** Number of dots in the grid */
  dotCount: number;

  /** Number of currently active ripples */
  activeRipples: number;

  /** Current frames per second */
  fps: number;

  /** Time spent on physics update (ms) */
  physicsTimeMs: number;

  /** Number of hands detected */
  handsDetected: number;
}

/**
 * Current state of the Stellar Wave mode
 */
export enum StellarWaveState {
  /** Mode not yet initialized */
  UNINITIALIZED = 'UNINITIALIZED',

  /** Mode initialized but not running */
  READY = 'READY',

  /** Mode actively running and rendering */
  RUNNING = 'RUNNING',

  /** Mode paused */
  PAUSED = 'PAUSED',

  /** Mode disposed and cannot be reused */
  DISPOSED = 'DISPOSED',
}

/**
 * Specific interaction behaviors for Stellar Wave
 */
export enum StellarWaveInteraction {
  /**
   * cosmic style/pulse
   * Triggered by pinching right index and thumb.
   * Creates a visual ripple effect.
   */
  COSMIC_PULSE = 'COSMIC_PULSE',

  /**
   * Gravity Well
   * Triggered by closing right hand fist.
   * Creates a massive attraction force.
   */
  GRAVITY_WELL = 'GRAVITY_WELL',

  /**
   * Force Field
   * Triggered by left hand index finger.
   * Creates a repulsion field around the finger.
   */
  FORCE_FIELD = 'FORCE_FIELD',
}
