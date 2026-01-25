/**
 * GestureDetector Module
 * Responsible for detecting hand gestures from MediaPipe landmarks
 *
 * Implements Single Responsibility Principle (SRP):
 * - Only detects gestures, does not handle effects
 * - Pure detection logic with state tracking
 * - Configurable thresholds
 *
 * Phase 3.2 Only: Pinch Gesture → Mini Star Burst
 *
 * @see DESIGN-v2.md Phase 3.2
 */

import * as THREE from 'three';
import { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { HandLandmarkIndex } from './HandTypes';
import {
  GestureType,
  GestureState,
  GestureConfig,
  GestureDetectionResult,
  PinchGestureEvent,
  PinchGestureData,
  Handedness,
  DEFAULT_GESTURE_CONFIG,
  AnyGestureEvent,
  FistGestureEvent,
  FistGestureData,
  MiddlePinchGestureEvent,
  MiddlePinchGestureData,
} from './GestureTypes';

/**
 * Internal state for tracking pinch and fist gesture lifecycles
 */
interface GestureStateTracker {
  pinch: {
    left: {
      isActive: boolean;
      lastTriggerTime: number;
      sustainedFrames: number;
    };
    right: {
      isActive: boolean;
      lastTriggerTime: number;
      sustainedFrames: number;
    };
  };
  middlePinch: {
    left: {
      isActive: boolean;
      lastTriggerTime: number;
      sustainedFrames: number;
      holdStartTime: number;
    };
    right: {
      isActive: boolean;
      lastTriggerTime: number;
      sustainedFrames: number;
      holdStartTime: number;
    };
  };
  fist: {
    left: {
      isActive: boolean;
      sustainedFrames: number;
    };
    right: {
      isActive: boolean;
      sustainedFrames: number;
    };
  };
}

/**
 * GestureDetector - Detects pinch and fist gestures from MediaPipe landmarks
 *
 * Design principles:
 * - Stateful tracking for gesture lifecycles (STARTED → ACTIVE → ENDED)
 * - Hysteresis to prevent gesture flickering
 * - Cooldown periods for debouncing rapid triggers
 * - Sustained frame requirement to prevent accidental triggers
 */
export class GestureDetector {
  private config: GestureConfig;
  private state: GestureStateTracker;

  constructor(config: Partial<GestureConfig> = {}) {
    this.config = { ...DEFAULT_GESTURE_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  /**
   * Create initial state for gesture trackers
   */
  private createInitialState(): GestureStateTracker {
    return {
      pinch: {
        left: { isActive: false, lastTriggerTime: 0, sustainedFrames: 0 },
        right: { isActive: false, lastTriggerTime: 0, sustainedFrames: 0 },
      },
      middlePinch: {
        left: { isActive: false, lastTriggerTime: 0, sustainedFrames: 0, holdStartTime: 0 },
        right: { isActive: false, lastTriggerTime: 0, sustainedFrames: 0, holdStartTime: 0 },
      },
      fist: {
        left: { isActive: false, sustainedFrames: 0 },
        right: { isActive: false, sustainedFrames: 0 },
      },
    };
  }

  /**
   * Main detection method - call every frame with hand landmarks
   *
   * @param landmarks - Array of hand landmarks (one or two hands)
   * @param handedness - Array of handedness classifications
   * @param timestamp - Current timestamp in milliseconds
   * @returns Detection result with pinch and fist gesture events
   */
  detect(
    landmarks: NormalizedLandmark[][],
    handedness: Handedness[],
    timestamp: number
  ): GestureDetectionResult {
    const events: AnyGestureEvent[] = [];
    let pinchEvent: PinchGestureEvent | null = null;
    let middlePinchEvent: MiddlePinchGestureEvent | null = null;
    let fistEvent: FistGestureEvent | null = null;

    // Process each hand independently
    for (let i = 0; i < landmarks.length; i++) {
      const hand = landmarks[i];
      const handType = handedness[i] || 'unknown';

      // Detect pinch gesture (thumb + index)
      const pinch = this.detectPinch(hand, handType, timestamp);
      if (pinch) {
        events.push(pinch);
        pinchEvent = pinch;
      }

      // Detect middle pinch gesture (thumb + middle finger for Black Hole)
      const middlePinch = this.detectMiddlePinch(hand, handType, timestamp);
      if (middlePinch) {
        events.push(middlePinch);
        middlePinchEvent = middlePinch;
      }

      // Detect fist gesture
      const fist = this.detectFist(hand, handType, timestamp);
      if (fist) {
        events.push(fist);
        fistEvent = fist;
      }
    }

    return {
      events,
      pinch: pinchEvent,
      middlePinch: middlePinchEvent,
      fist: fistEvent,
    };
  }

  /**
   * Detect FIST gesture (fingers curled into palm)
   */
  private detectFist(
    landmarks: NormalizedLandmark[],
    handedness: Handedness,
    timestamp: number
  ): FistGestureEvent | null {
    // 1. Calculate Scale Reference: Wrist to Middle Finger Knuckle (MCP)
    const wrist = landmarks[HandLandmarkIndex.WRIST];
    const middleMCP = landmarks[HandLandmarkIndex.MIDDLE_FINGER_MCP];
    const palmScale = this.calculateDistance3D(wrist, middleMCP);

    // Safeguard against bad data (scale shouldn't be near zero)
    if (palmScale < 0.01) return null;

    // 2. Check all fingertips against wrist
    const fingertipIndices = [
      HandLandmarkIndex.INDEX_FINGER_TIP,
      HandLandmarkIndex.MIDDLE_FINGER_TIP,
      HandLandmarkIndex.RING_FINGER_TIP,
      HandLandmarkIndex.PINKY_TIP,
    ];

    let allFingersClosed = true;
    let anyFingerOpen = false;

    for (const tipIndex of fingertipIndices) {
      const tip = landmarks[tipIndex];
      const distanceToWrist = this.calculateDistance3D(tip, wrist);
      const ratio = distanceToWrist / palmScale;

      if (ratio > this.config.fist.closeThreshold) {
        allFingersClosed = false;
      }
      if (ratio > this.config.fist.openThreshold) {
        anyFingerOpen = true;
      }
    }

    // Get state tracker
    const handKey = handedness === 'left' ? 'left' : 'right';
    const handState = this.state.fist[handKey];
    const wasActive = handState.isActive;

    // State Transitions
    let gestureState: GestureState;

    if (!wasActive && allFingersClosed) {
      // Potential start - check duration
      handState.sustainedFrames++;
      if (handState.sustainedFrames >= this.config.fist.minDurationFrames) {
        gestureState = GestureState.STARTED;
        handState.isActive = true;
      } else {
        return null; // Not sustained enough yet
      }
    } else if (wasActive && !anyFingerOpen) {
      // Staying closed (hysteresis zone included)
      gestureState = GestureState.ACTIVE;
      handState.sustainedFrames++; // Keep counting for robustness
    } else if (wasActive && anyFingerOpen) {
      // Released
      gestureState = GestureState.ENDED;
      handState.isActive = false;
      handState.sustainedFrames = 0;
    } else {
      // Not active and not closing
      handState.sustainedFrames = 0;
      return null;
    }

    // Compute Fist Center (approximate using Middle MCP for stability)
    const center = middleMCP;

    // Convert to Three.js world coords (mirror X)
    const worldPosition = new THREE.Vector3(
      -(center.x - 0.5) * 10,
      -(center.y - 0.5) * 10,
      -center.z * 10
    );

    const data: FistGestureData = {
      position: worldPosition,
      normalizedPosition: { x: center.x, y: center.y, z: center.z },
      handedness,
    };

    return {
      type: GestureType.FIST,
      state: gestureState,
      data,
      timestamp,
    };
  }

  /**
   * Detect pinch gesture between thumb and index finger
   *
   * Pinch is detected when:
   * - Distance between thumb tip and index tip < threshold
   * - Sustained for multiple frames (prevents accidental triggers)
   * - Cooldown period has elapsed since last trigger
   *
   * @param landmarks - Single hand landmarks
   * @param handedness - Which hand ('left' or 'right')
   * @param timestamp - Current timestamp
   * @returns Pinch gesture event or null
   */
  private detectPinch(
    landmarks: NormalizedLandmark[],
    handedness: Handedness,
    timestamp: number
  ): PinchGestureEvent | null {
    const thumbTip = landmarks[HandLandmarkIndex.THUMB_TIP];
    const indexTip = landmarks[HandLandmarkIndex.INDEX_FINGER_TIP];

    // Calculate distance between thumb and index tips
    const distance = this.calculateDistance3D(thumbTip, indexTip);

    // Get state tracker for this hand
    const handKey = handedness === 'left' ? 'left' : 'right';
    const handState = this.state.pinch[handKey];

    // Determine gesture state
    const wasActive = handState.isActive;
    const isPinching = distance < this.config.pinch.threshold;
    const isReleased = distance > this.config.pinch.releaseThreshold;

    // Check cooldown
    const cooldownElapsed = timestamp - handState.lastTriggerTime > this.config.pinch.cooldownMs;

    // Track sustained pinch frames (require 3 consecutive frames before triggering)
    const REQUIRED_SUSTAINED_FRAMES = 3;
    if (isPinching) {
      handState.sustainedFrames++;
    } else {
      handState.sustainedFrames = 0;
    }

    const isSustainedPinch = handState.sustainedFrames >= REQUIRED_SUSTAINED_FRAMES;

    let gestureState: GestureState;

    if (!wasActive && isSustainedPinch && cooldownElapsed) {
      // Gesture just started (after sustained detection)
      gestureState = GestureState.STARTED;
      handState.isActive = true;
      handState.lastTriggerTime = timestamp;
    } else if (wasActive && isPinching) {
      // Gesture continuing
      gestureState = GestureState.ACTIVE;
    } else if (wasActive && isReleased) {
      // Gesture ended
      gestureState = GestureState.ENDED;
      handState.isActive = false;
      handState.sustainedFrames = 0;
    } else if (!wasActive && !isSustainedPinch) {
      // No gesture (or not yet sustained)
      return null;
    } else {
      // In hysteresis zone - maintain current state
      gestureState = wasActive ? GestureState.ACTIVE : GestureState.IDLE;
      if (gestureState === GestureState.IDLE) return null;
    }

    // Calculate pinch position (midpoint between thumb and index)
    const midX = (thumbTip.x + indexTip.x) / 2;
    const midY = (thumbTip.y + indexTip.y) / 2;
    const midZ = (thumbTip.z + indexTip.z) / 2;

    // Convert to Three.js world coordinates
    // Mirror X coordinate to match video display (left hand → left side)
    const worldPosition = new THREE.Vector3(
      -(midX - 0.5) * 10, // Flip X for mirror effect + scale to world units
      -(midY - 0.5) * 10, // Flip Y + scale to world units
      -midZ * 10
    );

    // Calculate pinch strength (inverse of distance, normalized)
    const strength = Math.max(0, Math.min(1, 1 - distance / this.config.pinch.releaseThreshold));

    const data: PinchGestureData = {
      position: worldPosition,
      normalizedPosition: { x: midX, y: midY, z: midZ },
      distance,
      handedness,
      strength,
    };

    return {
      type: GestureType.PINCH,
      state: gestureState,
      data,
      timestamp,
    };
  }

  /**
   * Detect middle finger pinch gesture (thumb + middle finger) for Black Hole effect
   *
   * This gesture triggers the gravitational vortex effect:
   * - STARTED: Begin charging the black hole
   * - ACTIVE: Continue charging (particles spiral inward)
   * - ENDED: Release burst (supernova explosion)
   *
   * @param landmarks - Single hand landmarks
   * @param handedness - Which hand ('left' or 'right')
   * @param timestamp - Current timestamp in milliseconds
   * @returns Middle pinch gesture event or null
   */
  private detectMiddlePinch(
    landmarks: NormalizedLandmark[],
    handedness: Handedness,
    timestamp: number
  ): MiddlePinchGestureEvent | null {
    const thumbTip = landmarks[HandLandmarkIndex.THUMB_TIP];
    const middleTip = landmarks[HandLandmarkIndex.MIDDLE_FINGER_TIP];

    // Calculate distance between thumb and middle finger tips
    const distance = this.calculateDistance3D(thumbTip, middleTip);

    // Get state tracker for this hand
    const handKey = handedness === 'left' ? 'left' : 'right';
    const handState = this.state.middlePinch[handKey];

    // Determine gesture state
    const wasActive = handState.isActive;
    const isPinching = distance < this.config.middlePinch.threshold;
    const isReleased = distance > this.config.middlePinch.releaseThreshold;

    // Check cooldown (only for initial trigger)
    const cooldownElapsed =
      timestamp - handState.lastTriggerTime > this.config.middlePinch.cooldownMs;

    // Track sustained pinch frames (require 3 consecutive frames for stability)
    const REQUIRED_SUSTAINED_FRAMES = 3;
    if (isPinching) {
      handState.sustainedFrames++;
    } else {
      handState.sustainedFrames = 0;
    }

    const isSustainedPinch = handState.sustainedFrames >= REQUIRED_SUSTAINED_FRAMES;

    let gestureState: GestureState;

    if (!wasActive && isSustainedPinch && cooldownElapsed) {
      // Gesture just started - begin black hole charging
      gestureState = GestureState.STARTED;
      handState.isActive = true;
      handState.lastTriggerTime = timestamp;
      handState.holdStartTime = timestamp;
    } else if (wasActive && isPinching) {
      // Gesture continuing - black hole is charging
      gestureState = GestureState.ACTIVE;
    } else if (wasActive && isReleased) {
      // Gesture ended - trigger supernova burst
      gestureState = GestureState.ENDED;
      handState.isActive = false;
      handState.sustainedFrames = 0;
    } else if (!wasActive && !isSustainedPinch) {
      // No gesture detected (or not yet sustained)
      return null;
    } else {
      // In hysteresis zone - maintain current state
      gestureState = wasActive ? GestureState.ACTIVE : GestureState.IDLE;
      if (gestureState === GestureState.IDLE) return null;
    }

    // Calculate pinch position (midpoint between thumb and middle finger)
    const midX = (thumbTip.x + middleTip.x) / 2;
    const midY = (thumbTip.y + middleTip.y) / 2;
    const midZ = (thumbTip.z + middleTip.z) / 2;

    // Convert to Three.js world coordinates
    const worldPosition = new THREE.Vector3(-(midX - 0.5) * 10, -(midY - 0.5) * 10, -midZ * 10);

    // Calculate pinch strength (inverse of distance, normalized)
    const strength = Math.max(
      0,
      Math.min(1, 1 - distance / this.config.middlePinch.releaseThreshold)
    );

    // Calculate hold duration for charge intensity
    const holdDuration = wasActive ? timestamp - handState.holdStartTime : 0;

    const data: MiddlePinchGestureData = {
      position: worldPosition,
      normalizedPosition: { x: midX, y: midY, z: midZ },
      distance,
      handedness,
      strength,
      holdDuration,
    };

    return {
      type: GestureType.MIDDLE_PINCH,
      state: gestureState,
      data,
      timestamp,
    };
  }

  /**
   * Calculate 3D Euclidean distance between two landmarks
   */
  private calculateDistance3D(p1: NormalizedLandmark, p2: NormalizedLandmark): number {
    return Math.sqrt(
      Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2)
    );
  }

  /**
   * Reset all gesture states
   */
  reset(): void {
    this.state = this.createInitialState();
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<GestureConfig> {
    return this.config;
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<GestureConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
