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
  position: { x: number; y: number; z?: number };

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

  // Vortex params
  /** Radius of vortex influence */
  vortexRadius: number;
  /** Strength of rotational force */
  vortexStrength: number;

  // Quasar Surge params
  /** Radius of quasar surge gravitational influence in pixels */
  quasarSurgeRadius: number;
  /** Base attraction strength for quasar surge vortex */
  quasarSurgeStrength: number;
  /** Speed of spiral rotation during charging */
  quasarSurgeSpiralSpeed: number;
  /** Minimum charge time before burst can occur (ms) */
  quasarSurgeMinChargeTime: number;
  /** Maximum charge time for full power burst (ms) */
  quasarSurgeMaxChargeTime: number;
  /** Base velocity for burst explosion */
  quasarSurgeBurstVelocity: number;
  /** Duration of burst effect in seconds */
  quasarSurgeBurstDuration: number;

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

  // Vortex params
  vortexRadius: 200,
  vortexStrength: 4.0,

  // Quasar Surge params
  quasarSurgeRadius: 1000,
  quasarSurgeStrength: 10.0,
  quasarSurgeSpiralSpeed: 3.0,
  quasarSurgeMinChargeTime: 300,
  quasarSurgeMaxChargeTime: 3000,
  quasarSurgeBurstVelocity: 25.0,
  quasarSurgeBurstDuration: 1.5,

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
   * Cosmic Pulse
   * Triggered by pinching right index and thumb.
   * Creates a visual ripple effect.
   */
  COSMIC_PULSE = 'COSMIC_PULSE',

  /**
   * Gravity Well
   * Triggered by pinching left middle finger and thumb.
   * Creates a massive attraction force.
   */
  GRAVITY_WELL = 'GRAVITY_WELL',

  /**
   * Nebula Vortex
   * Triggered by pinching left ring finger and thumb.
   * Creates a spiraling, rotational force field.
   */
  NEBULA_VORTEX = 'NEBULA_VORTEX',

  /**
   * Quasar Surge
   * Triggered by left hand fist.
   * Two-phase interaction:
   * - Charging: Particles spiral inward toward fist center
   * - Burst: Supernova-like explosion on release
   */
  QUASAR_SURGE = 'QUASAR_SURGE',
}

/**
 * Phase of the Quasar Surge interaction
 */
export enum QuasarSurgePhase {
  /** No quasar surge active */
  INACTIVE = 'INACTIVE',
  /** Charging phase - particles spiraling inward */
  CHARGING = 'CHARGING',
  /** Burst phase - particles exploding outward */
  BURSTING = 'BURSTING',
}

/**
 * State tracking for the Quasar Surge effect
 */
export interface QuasarSurgeState {
  /** Current phase of the quasar surge */
  phase: QuasarSurgePhase;
  /** Center position in screen coordinates */
  center: { x: number; y: number };
  /** Time when charging started (seconds, animation clock) */
  chargeStartTime: number;
  /** Duration of charge in seconds */
  chargeDuration: number;
  /** Charge intensity (0-1, based on hold duration) */
  chargeIntensity: number;
  /** Time when burst started (seconds, animation clock) */
  burstStartTime: number;
  /** Stored particle velocities for burst effect */
  storedEnergy: number;
}
