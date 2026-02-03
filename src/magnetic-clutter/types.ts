export interface MagneticClutterConfig {
  /** Debug mode */
  debug: boolean;
  /** Number of magnetic balls */
  ballCount: number;
  /** Bloom strength */
  bloomStrength: number;
  /** Size of the repulsor sphere */
  repulsorSize: number;
  /** Strength of the repulsor force */
  repulsorForce: number;
  /** Strength of the grabber force */
  grabberForce: number;
}

export const DEFAULT_MAGNETIC_CLUTTER_CONFIG: MagneticClutterConfig = {
  debug: false,
  ballCount: 100,
  bloomStrength: 2.0,
  repulsorSize: 2.0, // Visual size multiplier
  repulsorForce: 20.0,
  grabberForce: 50.0,
};

export interface MagneticClutterDebugInfo {
  fps: number;
  handsDetected: number;
  activeBalls: number;
  physicsTimeMs: number;
  isRepulsing: boolean;
  isGrabbing: boolean;
}
