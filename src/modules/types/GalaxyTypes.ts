/**
 * Galaxy rendering type definitions
 * Configuration and state types for Three.js WebGL particle system
 */

import * as THREE from 'three';

/**
 * Galaxy explosion states for Big Bang effect
 */
export enum ExplosionState {
  /** Normal galaxy rendering */
  NORMAL = 0,
  /** Galaxy imploding (hands closing) */
  IMPLODING = 1,
  /** Singularity point (bright vibrating point) */
  SINGULARITY = 2,
  /** Explosion in progress (stars shooting outward) */
  EXPLODING = 3,
  /** Fading away (cooling and disappearing) */
  FADING = 4,
}

/**
 * Galaxy visual configuration
 */
export interface GalaxyConfig {
  /** Number of particles (default: 20000) */
  particleCount: number;
  /** Number of spiral arms (default: 3) */
  spiralArms: number;
  /** Maximum radius of galaxy (default: 5) */
  radius: number;
  /** Spiral twist factor (default: 1) */
  spin: number;
  /** Particle spread randomness (default: 0.2) */
  randomness: number;
  /** Power curve for randomness distribution (default: 3) */
  randomnessPower: number;
  /** Inner color (hex string, default: '#ffa575') */
  colorInside: string;
  /** Outer color (hex string, default: '#311599') */
  colorOutside: string;
  /** Base particle size (default: 2.0) */
  particleSize: number;
}

/**
 * Default galaxy configuration - optimized for stunning visuals
 * REALISTIC GALAXY: millions of tiny white stars like real night sky
 */
export const DEFAULT_GALAXY_CONFIG: GalaxyConfig = {
  particleCount: 6000000, // 6 MILLION particles for ultra-dense rings
  spiralArms: 4, // 4 arms for classic spiral look
  radius: 4.5, // Slightly larger for grand scale
  spin: 2.0, // Strong twist for dramatic spirals
  randomness: 0.25, // Natural spread
  randomnessPower: 3,
  colorInside: '#ffffff', // Pure white stars
  colorOutside: '#ffffff', // Pure white throughout
  particleSize: 0.9, // Uniform tiny size
};

/**
 * Galaxy transform state (position, rotation, scale)
 */
export interface GalaxyTransform {
  /** Position in 3D space */
  position: { x: number; y: number; z: number };
  /** Rotation in radians (Euler angles) */
  rotation: { x: number; y: number; z: number };
  /** Uniform scale factor (0-1) */
  scale: number;
  /** Visibility flag */
  visible: boolean;
}

/**
 * Initial galaxy transform state
 */
export const INITIAL_GALAXY_TRANSFORM: GalaxyTransform = {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: 0,
  visible: false,
};

/**
 * Performance profile configuration
 */
export interface PerformanceProfile {
  /** Profile name */
  name: 'high' | 'balanced' | 'performance';
  /** Number of particles */
  particleCount: number;
  /** Target FPS */
  targetFps: number;
}

/**
 * Available performance profiles
 */
export const PERFORMANCE_PROFILES: Record<string, PerformanceProfile> = {
  high: {
    name: 'high',
    particleCount: 20000,
    targetFps: 60,
  },
  balanced: {
    name: 'balanced',
    particleCount: 10000,
    targetFps: 60,
  },
  performance: {
    name: 'performance',
    particleCount: 5000,
    targetFps: 30,
  },
};

/**
 * Shader uniform types for the galaxy material
 * Uses index signature for Three.js ShaderMaterial compatibility
 */
export interface GalaxyUniforms {
  [uniform: string]: { value: number } | { value: THREE.Vector3 };
  /** Time for animation */
  uTime: { value: number };
  /** Galaxy scale multiplier */
  uScale: { value: number };
  /** Particle size multiplier */
  uSize: { value: number };
  /** Explosion state (ExplosionState enum value) */
  uExplosionState: { value: number };
  /** Time since explosion started (seconds) */
  uExplosionTime: { value: number };
}
