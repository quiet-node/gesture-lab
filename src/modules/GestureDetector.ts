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
import { HandLandmarkIndex } from './types/HandTypes';
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
} from './types/GestureTypes';

/**
 * Internal state for tracking pinch gesture lifecycles
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
}

/**
 * GestureDetector - Detects pinch gestures from MediaPipe landmarks
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
   * Create initial state for pinch gesture tracker
   */
  private createInitialState(): GestureStateTracker {
    return {
      pinch: {
        left: { isActive: false, lastTriggerTime: 0, sustainedFrames: 0 },
        right: { isActive: false, lastTriggerTime: 0, sustainedFrames: 0 },
      },
    };
  }

  /**
   * Main detection method - call every frame with hand landmarks
   *
   * @param landmarks - Array of hand landmarks (one or two hands)
   * @param handedness - Array of handedness classifications
   * @param timestamp - Current timestamp in milliseconds
   * @returns Detection result with pinch gesture events
   */
  detect(
    landmarks: NormalizedLandmark[][],
    handedness: Handedness[],
    timestamp: number
  ): GestureDetectionResult {
    const events: AnyGestureEvent[] = [];
    let pinchEvent: PinchGestureEvent | null = null;

    // Process each hand independently for pinch detection
    for (let i = 0; i < landmarks.length; i++) {
      const hand = landmarks[i];
      const handType = handedness[i] || 'unknown';

      // Detect pinch gesture
      const pinch = this.detectPinch(hand, handType, timestamp);
      if (pinch) {
        events.push(pinch);
        pinchEvent = pinch;
      }
    }

    return {
      events,
      pinch: pinchEvent,
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
    const cooldownElapsed =
      timestamp - handState.lastTriggerTime > this.config.pinch.cooldownMs;

    // Track sustained pinch frames (require 3 consecutive frames before triggering)
    const REQUIRED_SUSTAINED_FRAMES = 3;
    if (isPinching) {
      handState.sustainedFrames++;
    } else {
      handState.sustainedFrames = 0;
    }

    const isSustainedPinch =
      handState.sustainedFrames >= REQUIRED_SUSTAINED_FRAMES;

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
    const strength = Math.max(
      0,
      Math.min(1, 1 - distance / this.config.pinch.releaseThreshold)
    );

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
   * Calculate 3D Euclidean distance between two landmarks
   */
  private calculateDistance3D(
    p1: NormalizedLandmark,
    p2: NormalizedLandmark
  ): number {
    return Math.sqrt(
      Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
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
