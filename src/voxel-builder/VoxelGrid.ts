/**
 * VoxelGrid — Spatial occupancy data structure
 *
 * Tracks which grid cells are occupied using a Set<string> for O(1)
 * add / has / delete operations. Provides coordinate conversion between
 * continuous world-space and discrete grid-space, and maintains the
 * vertical extent (minY / maxY) for height-based color normalization.
 */

import * as THREE from 'three';
import { VoxelPosition, voxelKey } from './types';

export class VoxelGrid {
  /** Edge length of each cubic cell in world units */
  private readonly cellSize: number;
  /** Maximum number of cells this grid will accept */
  private readonly maxCells: number;
  /** Set of occupied cell keys in `"gx,gy,gz"` format */
  private readonly occupied = new Set<string>();

  /** Tracks the lowest occupied Y index (inclusive) */
  private minY = Infinity;
  /** Tracks the highest occupied Y index (inclusive) */
  private maxY = -Infinity;

  constructor(cellSize: number, maxCells: number) {
    this.cellSize = cellSize;
    this.maxCells = maxCells;
  }

  /**
   * Snap a world-space position to the nearest grid cell.
   *
   * @param worldPos - Continuous position in Three.js world coordinates
   * @returns Integer grid indices for the enclosing cell
   */
  worldToGrid(worldPos: THREE.Vector3): VoxelPosition {
    return {
      gx: Math.round(worldPos.x / this.cellSize),
      gy: Math.round(worldPos.y / this.cellSize),
      gz: Math.round(worldPos.z / this.cellSize),
    };
  }

  /**
   * Compute the center of a grid cell in world coordinates.
   *
   * @param pos - Integer grid indices
   * @returns World-space center of the cell
   */
  gridToWorld(pos: VoxelPosition): THREE.Vector3 {
    return new THREE.Vector3(
      pos.gx * this.cellSize,
      pos.gy * this.cellSize,
      pos.gz * this.cellSize
    );
  }

  /**
   * Attempt to mark a cell as occupied.
   *
   * @returns `true` if the cell was newly added, `false` if it was
   *          already occupied or the grid is at capacity.
   */
  add(gx: number, gy: number, gz: number): boolean {
    if (this.occupied.size >= this.maxCells) return false;

    const key = voxelKey(gx, gy, gz);
    if (this.occupied.has(key)) return false;

    this.occupied.add(key);

    // Update vertical extent
    if (gy < this.minY) this.minY = gy;
    if (gy > this.maxY) this.maxY = gy;

    return true;
  }

  /** Check whether a cell is already occupied. */
  has(gx: number, gy: number, gz: number): boolean {
    return this.occupied.has(voxelKey(gx, gy, gz));
  }

  /**
   * Remove a voxel from the grid.
   *
   * After removal, the vertical extent (minY/maxY) is recomputed by
   * scanning all remaining keys. This O(n) scan is acceptable because
   * `n` is bounded by `maxCells` (typically 1000).
   *
   * @returns `true` if the cell was occupied and removed, `false` otherwise
   */
  remove(gx: number, gy: number, gz: number): boolean {
    const key = voxelKey(gx, gy, gz);
    if (!this.occupied.delete(key)) return false;

    // Recompute vertical extent from remaining cells
    this.minY = Infinity;
    this.maxY = -Infinity;
    for (const k of this.occupied) {
      const gy = parseInt(k.split(',')[1], 10);
      if (gy < this.minY) this.minY = gy;
      if (gy > this.maxY) this.maxY = gy;
    }

    return true;
  }

  /** Number of occupied cells. */
  get count(): number {
    return this.occupied.size;
  }

  /**
   * Vertical extent of occupied cells (grid indices).
   * Returns `{ minY: 0, maxY: 0 }` when the grid is empty.
   */
  getYRange(): { minY: number; maxY: number } {
    if (this.occupied.size === 0) return { minY: 0, maxY: 0 };
    return { minY: this.minY, maxY: this.maxY };
  }

  /** Remove all occupied cells and reset vertical extent. */
  clear(): void {
    this.occupied.clear();
    this.minY = Infinity;
    this.maxY = -Infinity;
  }
}
