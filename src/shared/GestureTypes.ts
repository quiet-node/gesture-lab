/**
 * Gesture detection type definitions
 * Type-safe interfaces for Phase 3: Enhanced Interaction Patterns
 *
 * Phase 3.2 Only: Pinch Gesture → Mini Star Burst
 * - Pinch: Thumb + Index finger close together → Star burst effect
 *
 * @see DESIGN-v2.md Phase 3.2
 */

import * as THREE from 'three';
import type { Handedness } from './HandTypes';

// Re-export Handedness for convenience
export type { Handedness };

/**
 * Types of gestures that can be detected
 */
export enum GestureType {
  /** Thumb and index finger pinched together */
  PINCH = 'PINCH',
  /** Thumb and middle finger pinched together (Quasar Surge trigger) */
  MIDDLE_PINCH = 'MIDDLE_PINCH',
  /** Thumb and ring finger pinched together (Nebula Vortex trigger) */
  RING_PINCH = 'RING_PINCH',
  /** Fingers curled into a closed fist */
  FIST = 'FIST',
}

/**
 * State of a gesture in its lifecycle
 */
export enum GestureState {
  /** Gesture not detected */
  IDLE = 'IDLE',
  /** Gesture just started this frame */
  STARTED = 'STARTED',
  /** Gesture is continuing from previous frame */
  ACTIVE = 'ACTIVE',
  /** Gesture just ended this frame */
  ENDED = 'ENDED',
}

/**
 * Data payload for pinch gesture detection
 */
export interface PinchGestureData {
  /** 3D position of the pinch point (midpoint between thumb and index) */
  position: THREE.Vector3;
  /** Normalized position (0-1 range from MediaPipe) */
  normalizedPosition: { x: number; y: number; z: number };
  /** Distance between thumb and index finger (normalized) */
  distance: number;
  /** Which hand is performing the pinch */
  handedness: Handedness;
  /** Confidence/strength of the pinch (0-1) */
  strength: number;
}

/**
 * Data payload for fist gesture detection
 */
export interface FistGestureData {
  /** 3D position of the fist center */
  position: THREE.Vector3;
  /** Normalized position (0-1 range from MediaPipe) */
  normalizedPosition: { x: number; y: number; z: number };
  /** Which hand is performing the fist */
  handedness: Handedness;
  /** Duration the fist has been held in milliseconds */
  holdDuration: number;
}

/**
 * Data payload for middle finger pinch gesture (Quasar Surge trigger)
 */
export interface MiddlePinchGestureData {
  /** 3D position of the pinch point (midpoint between thumb and middle finger) */
  position: THREE.Vector3;
  /** Normalized position (0-1 range from MediaPipe) */
  normalizedPosition: { x: number; y: number; z: number };
  /** Distance between thumb and middle finger (normalized) */
  distance: number;
  /** Which hand is performing the pinch */
  handedness: Handedness;
  /** Confidence/strength of the pinch (0-1) */
  strength: number;
  /** Duration the pinch has been held in milliseconds */
  holdDuration: number;
}

/**
 * Data payload for ring finger pinch gesture (Nebula Vortex trigger)
 */
export interface RingPinchGestureData {
  /** 3D position of the pinch point (midpoint between thumb and ring finger) */
  position: THREE.Vector3;
  /** Normalized position (0-1 range from MediaPipe) */
  normalizedPosition: { x: number; y: number; z: number };
  /** Distance between thumb and ring finger (normalized) */
  distance: number;
  /** Which hand is performing the pinch */
  handedness: Handedness;
  /** Confidence/strength of the pinch (0-1) */
  strength: number;
}

/**
 * Generic gesture event with typed data payload
 */
export interface GestureEvent<
  T = PinchGestureData | FistGestureData | MiddlePinchGestureData | RingPinchGestureData,
> {
  /** Type of gesture */
  type: GestureType;
  /** Current state in gesture lifecycle */
  state: GestureState;
  /** Gesture-specific data */
  data: T;
  /** Timestamp when gesture was detected (ms) */
  timestamp: number;
}

/**
 * Pinch gesture event
 */
export type PinchGestureEvent = GestureEvent<PinchGestureData>;

/**
 * Middle finger pinch gesture event (Quasar Surge trigger)
 */
export type MiddlePinchGestureEvent = GestureEvent<MiddlePinchGestureData>;

/**
 * Ring finger pinch gesture event (Nebula Vortex trigger)
 */
export type RingPinchGestureEvent = GestureEvent<RingPinchGestureData>;

/**
 * Fist gesture event
 */
export type FistGestureEvent = GestureEvent<FistGestureData>;

/**
 * Union type of all gesture events
 */
export type AnyGestureEvent =
  | PinchGestureEvent
  | FistGestureEvent
  | MiddlePinchGestureEvent
  | RingPinchGestureEvent;

/**
 * Configuration thresholds for gesture detection
 */
export interface GestureConfig {
  /** Pinch gesture configuration (thumb + index finger) */
  pinch: {
    /** Maximum distance between thumb and index to trigger pinch (normalized) */
    threshold: number;
    /** Minimum distance to end pinch gesture (with hysteresis) */
    releaseThreshold: number;
    /** Minimum time between pinch triggers (ms) - debouncing */
    cooldownMs: number;
  };
  /** Middle pinch gesture configuration (thumb + middle finger for Quasar Surge) */
  middlePinch: {
    /** Maximum distance between thumb and middle finger to trigger pinch (normalized) */
    threshold: number;
    /** Minimum distance to end pinch gesture (with hysteresis) */
    releaseThreshold: number;
    /** Minimum time between triggers (ms) - debouncing */
    cooldownMs: number;
  };
  /** Ring pinch gesture configuration (thumb + ring finger for Nebula Vortex) */
  ringPinch: {
    /** Maximum distance between thumb and ring finger to trigger pinch (normalized) */
    threshold: number;
    /** Minimum distance to end pinch gesture (with hysteresis) */
    releaseThreshold: number;
    /** Minimum time between triggers (ms) - debouncing */
    cooldownMs: number;
  };
  /** Fist gesture configuration */
  fist: {
    /** Threshold ratio for fingertip-to-wrist distance vs palm scale */
    closeThreshold: number;
    /** Threshold ratio to release fist (hysteresis) */
    openThreshold: number;
    /** Minimum sustained frames to confirm fist */
    minDurationFrames: number;
  };
}

/**
 * Default configuration
 */
export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  pinch: {
    threshold: 0.035, // Slightly more lenient than 0.03 for better UX
    releaseThreshold: 0.055, // Hysteresis to prevent flickering
    cooldownMs: 800, // 800ms between star bursts (prevent spam)
  },
  middlePinch: {
    threshold: 0.04, // Slightly larger threshold for middle finger (harder to pinch precisely)
    releaseThreshold: 0.06, // Hysteresis for smooth release detection
    cooldownMs: 200, // Short cooldown - charging effect handles debouncing
  },
  ringPinch: {
    threshold: 0.04, // Same as middle pinch
    releaseThreshold: 0.06,
    cooldownMs: 200,
  },
  fist: {
    closeThreshold: 1.0, // Tip dist must be < 1.0x scale (tight fist)
    openThreshold: 1.4, // Tip dist must be > 1.4x scale to open
    minDurationFrames: 5, // Require 5 frames of stability
  },
};

/**
 * Result of gesture detection for a single frame
 */
export interface GestureDetectionResult {
  /** All detected gesture events this frame */
  events: AnyGestureEvent[];
  /** Current pinch state (null if not detected) */
  pinch: PinchGestureEvent | null;
  /** Current middle pinch state for Quasar Surge (null if not detected) */
  middlePinch: MiddlePinchGestureEvent | null;
  /** Current ring pinch state (null if not detected) */
  ringPinch: RingPinchGestureEvent | null;
  /** Current fist state (null if not detected) */
  fist: FistGestureEvent | null;
}

/**
 * Callback type for gesture event handlers
 */
export type GestureEventHandler<T extends AnyGestureEvent = AnyGestureEvent> = (event: T) => void;

/**
 * Star burst effect configuration (Phase 3.2)
 */
export interface StarBurstConfig {
  /** Number of particles to spawn (500-1000 per DESIGN-v2.md) */
  particleCount: number;
  /** Duration of burst animation in seconds */
  duration: number;
  /** Initial velocity magnitude of particles */
  initialVelocity: number;
  /** Velocity decay factor (0-1, lower = faster decay) */
  velocityDecay: number;
  /** Starting size of particles */
  initialSize: number;
  /** Color of burst particles */
  color: THREE.Color;
}

/**
 * Default star burst configuration
 */
export const DEFAULT_STAR_BURST_CONFIG: StarBurstConfig = {
  particleCount: 750, // Middle ground: 500-1000
  duration: 1.5, // Per DESIGN-v2.md: fade over 1.5 seconds
  initialVelocity: 3.0,
  velocityDecay: 0.92,
  initialSize: 0.8,
  color: new THREE.Color(0xffffff), // White particles
};
