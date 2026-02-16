/**
 * Voxel Builder — Type Definitions
 *
 * Configuration, debug diagnostics, color palette, and spatial data
 * types for the 3D voxel-drawing mode.
 */

/** Runtime configuration for the voxel builder mode */
export interface VoxelBuilderConfig {
  /** Debug mode — enables performance overlay */
  debug: boolean;
  /** Edge length of each cube in world units */
  cellSize: number;
  /** Maximum number of voxels allowed before spawning stops */
  maxBoxes: number;
  /** Minimum world-space distance between spawned boxes (prevents flooding) */
  spawnDistance: number;
  /** FPS threshold below which a performance warning is triggered */
  fpsWarningThreshold: number;
  /** Consecutive low-FPS seconds before spawning is blocked */
  fpsWarningDurationSec: number;
}

export const DEFAULT_VOXEL_BUILDER_CONFIG: VoxelBuilderConfig = {
  debug: false,
  cellSize: 0.45,
  maxBoxes: 1000,
  spawnDistance: 0.45,
  fpsWarningThreshold: 30,
  fpsWarningDurationSec: 3,
};

/** Integer grid coordinates identifying a voxel cell */
export interface VoxelPosition {
  /** Grid index along X axis */
  gx: number;
  /** Grid index along Y axis */
  gy: number;
  /** Grid index along Z axis */
  gz: number;
}

/** Debug telemetry emitted each frame when the debug panel is active */
export interface VoxelBuilderDebugInfo {
  fps: number;
  handsDetected: number;
  boxCount: number;
  isDrawing: boolean;
  gridPosition: string;
  performanceWarning: boolean;
  /** Whether erase mode is currently active (left fist held) */
  eraseMode: boolean;
  /** Name of the currently active color palette */
  palette: string;
}

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

/**
 * Defines a color theme for voxel rendering.
 *
 * Colors are specified as HSL endpoints — the renderer interpolates
 * between `bottomHSL` (lowest Y) and `topHSL` (highest Y) across
 * the vertical range of the build.
 */
export interface VoxelColorPalette {
  /** Display name shown in debug/HUD */
  name: string;
  /** HSL at the bottom of the build [hue 0–1, saturation 0–1, lightness 0–1] */
  bottomHSL: [number, number, number];
  /** HSL at the top of the build */
  topHSL: [number, number, number];
  /** Material roughness override (0 = mirror, 1 = matte) */
  roughness: number;
  /** Material metalness override (0 = dielectric, 1 = metal) */
  metalness: number;
  /** Edge line color (hex) */
  edgeColor: number;
}

/** Curated set of color palettes for the voxel builder */
export const VOXEL_PALETTES: readonly VoxelColorPalette[] = [
  {
    name: 'Spectrum',
    bottomHSL: [0.65, 0.75, 0.55],
    topHSL: [0.0, 0.75, 0.55],
    roughness: 0.4,
    metalness: 0.15,
    edgeColor: 0x000000,
  },
  {
    name: 'Cyberpunk',
    bottomHSL: [0.83, 0.9, 0.55],
    topHSL: [0.52, 0.9, 0.55],
    roughness: 0.3,
    metalness: 0.25,
    edgeColor: 0x110022,
  },
  {
    name: 'Monolith',
    bottomHSL: [0.0, 0.0, 0.12],
    topHSL: [0.0, 0.0, 0.35],
    roughness: 0.2,
    metalness: 0.6,
    edgeColor: 0xffffff,
  },
  {
    name: 'Gold Standard',
    bottomHSL: [0.08, 0.85, 0.35],
    topHSL: [0.12, 0.95, 0.55],
    roughness: 0.15,
    metalness: 0.85,
    edgeColor: 0x332200,
  },
] as const;

/**
 * Encode grid coordinates into a deterministic string key suitable
 * for use in a `Set` or as a `Map` key.
 *
 * @param gx - Grid X index
 * @param gy - Grid Y index
 * @param gz - Grid Z index
 * @returns Comma-separated coordinate string (e.g. `"3,-1,7"`)
 */
export function voxelKey(gx: number, gy: number, gz: number): string {
  return `${gx},${gy},${gz}`;
}
