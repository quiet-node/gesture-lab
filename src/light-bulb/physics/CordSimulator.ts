/**
 * @fileoverview Position Based Dynamics (PBD) simulator for cord physics.
 *
 * Implements a time-corrected Verlet integration with specialized cord constraints.
 * Based on "Position Based Dynamics" (Müller et al.) and "Small Steps in Physics Simulation" (Macklin et al.).
 *
 * Key Features:
 * - Unconditionally stable constraints
 * - Real-time control of compliance (stiffness)
 * - Simple point-grabbing interaction
 *
 * @module light-bulb/physics/CordSimulator
 */

import * as THREE from 'three';

/**
 * Particle structure for the physical simulation.
 */
export interface Particle {
  position: THREE.Vector3;
  prevPosition: THREE.Vector3;
  velocity: THREE.Vector3;
  mass: number;
  invMass: number;
  isPinned: boolean;
}

/**
 * Configuration for the cord simulation.
 */
export interface CordConfig {
  /** Number of particles in the chain */
  segmentCount: number;

  /** Total length of the cord in world units */
  totalLength: number;

  /** Number of solver iterations per frame (higher = stiffer but more CPU) */
  iterations: number;

  /** Gravity vector applied to dynamic particles */
  gravity: THREE.Vector3;

  /** Simulation time step in seconds (e.g., 1/60) */
  timeStep: number;

  /** Damping factor (0-1) to reduce energy over time */
  damping: number;

  /** Y coordinate of the floor plane for collision */
  floorY: number;
}

/**
 * Default configuration for the cord simulation.
 */
export const DEFAULT_CORD_CONFIG: CordConfig = {
  segmentCount: 16,
  totalLength: 0.35, // Approx 35cm
  iterations: 10,
  gravity: new THREE.Vector3(0, -9.81, 0),
  timeStep: 1 / 60,
  damping: 0.99,
  floorY: -3.0,
};

/**
 * Simulator engine for realistic cord physics.
 */
export class CordSimulator {
  private particles: Particle[] = [];
  private constraints: { indexA: number; indexB: number; restLength: number }[] = [];
  private config: CordConfig;
  private accumulator: number = 0;

  /**
   * Internal reusable vectors to avoid allocation in the loop.
   */
  private tempVec3 = new THREE.Vector3();
  private tempDiff = new THREE.Vector3();

  /**
   * Creates a new cord simulator instance.
   *
   * @param startPosition - World position of the anchor point (top)
   * @param config - Optional configuration overrides
   */
  constructor(startPosition: THREE.Vector3, config: Partial<CordConfig> = {}) {
    this.config = { ...DEFAULT_CORD_CONFIG, ...config };
    this.initialize(startPosition);
  }

  /**
   * Initialize the particle chain.
   *
   * @param startPosition - The anchor position
   */
  private initialize(startPosition: THREE.Vector3): void {
    const { segmentCount, totalLength } = this.config;
    const segmentLength = totalLength / segmentCount;

    // Initialize particles extending downwards from anchor
    for (let i = 0; i <= segmentCount; i++) {
      // Add slight noise to initial position to prevent perfect equilibrium (dead physics)
      const noise = i > 0 ? (Math.random() - 0.5) * 0.02 * (i / segmentCount) : 0;

      const p = new THREE.Vector3(
        startPosition.x + noise,
        startPosition.y - i * segmentLength,
        startPosition.z + noise
      );

      this.particles.push({
        position: p.clone(),
        prevPosition: p.clone(),
        velocity: new THREE.Vector3(0, 0, 0),
        mass: 1.0,
        invMass: i === 0 ? 0 : 1.0, // Pin the first particle (mass = infinite, invMass = 0)
        isPinned: i === 0,
      });

      // Create distance constraint with previous particle
      if (i > 0) {
        this.constraints.push({
          indexA: i - 1,
          indexB: i,
          restLength: segmentLength,
        });
      }
    }
  }

  /**
   * Set the position of the anchor point (particle 0).
   * Typically driven by the light bulb's rotation.
   *
   * @param position - New anchor position
   */
  public setAnchor(position: THREE.Vector3): void {
    if (this.particles.length > 0 && this.particles[0].isPinned) {
      this.particles[0].position.copy(position);
      this.particles[0].prevPosition.copy(position);
      this.particles[0].velocity.set(0, 0, 0);
    }
  }

  /**
   * Pin a particle in place (infinite mass).
   */
  public pinParticle(index: number): void {
    if (index >= 0 && index < this.particles.length) {
      this.particles[index].isPinned = true;
      this.particles[index].invMass = 0;
      this.particles[index].velocity.set(0, 0, 0);
    }
  }

  /**
   * Unpin a particle (restore mass).
   */
  public unpinParticle(index: number): void {
    if (index >= 0 && index < this.particles.length) {
      this.particles[index].isPinned = false;
      this.particles[index].invMass = 1.0;
    }
  }

  /**
   * Grabs a specific particle and forces it to a position.
   * NOTE: For stable grabbing, call pinParticle() first!
   *
   * @param index - Index of the particle
   * @param position - Target position
   */
  public grabParticle(index: number, position: THREE.Vector3): void {
    if (index >= 0 && index < this.particles.length) {
      this.particles[index].position.copy(position);
      // Cancel velocity to prevent explosions
      this.particles[index].velocity.set(0, 0, 0);
      // Also update prevPosition to prevent high velocity in next frame import for Position Based Dynamics
      this.particles[index].prevPosition.copy(position);
    }
  }

  /**
   * Get the current positions of all particles.
   * Useful for rendering.
   */
  public getParticlePositions(): THREE.Vector3[] {
    return this.particles.map((p) => p.position);
  }

  /**
   * Get the velocity of a specific particle.
   */
  public getVelocity(index: number): THREE.Vector3 {
    if (index >= 0 && index < this.particles.length) {
      return this.particles[index].velocity.clone();
    }
    return new THREE.Vector3();
  }

  /**
   * Check if the anchor (particle 0) is detached.
   */
  public get isDetached(): boolean {
    return this.particles.length > 0 && !this.particles[0].isPinned;
  }

  /**
   * Detach the anchor point, allowing the cord to free-fall.
   * Called when the cord breaks.
   */
  public detachAnchor(): void {
    if (this.particles.length > 0) {
      this.particles[0].isPinned = false;
      this.particles[0].invMass = 1.0;
    }
  }

  /**
   * Reattach the cord to the anchor point.
   * Resets the cord to its initial hanging state.
   *
   * @param anchorPosition - New anchor position
   */
  public reattachAnchor(anchorPosition: THREE.Vector3): void {
    const { segmentCount, totalLength } = this.config;
    const segmentLength = totalLength / segmentCount;

    // Reset all particles to hanging state
    for (let i = 0; i <= segmentCount; i++) {
      const noise = i > 0 ? (Math.random() - 0.5) * 0.02 * (i / segmentCount) : 0;

      this.particles[i].position.set(
        anchorPosition.x + noise,
        anchorPosition.y - i * segmentLength,
        anchorPosition.z + noise
      );
      this.particles[i].prevPosition.copy(this.particles[i].position);
      this.particles[i].velocity.set(0, 0, 0);
      this.particles[i].isPinned = i === 0;
      this.particles[i].invMass = i === 0 ? 0 : 1.0;
    }
  }

  /**
   * Main physics update loop.
   * Uses fixed time step accumulation for stability.
   *
   * @param dt - Delta time in seconds
   */
  public update(dt: number): void {
    // Limit max dt to prevent spiral of death
    const maxDt = 0.1;
    this.accumulator += Math.min(dt, maxDt);

    const step = this.config.timeStep;

    while (this.accumulator >= step) {
      this.simulateStep(step);
      this.accumulator -= step;
    }
  }

  /**
   * Performs a single physics simulation step.
   * Algorithm:
   * 1. Apply external forces (Gravity) -> Predict Position
   * 2. Solve Constraints (Distance) -> Correct Position
   * 3. Update Integration (Velocity) -> Finalize State
   *
   * @param dt - Fixed time step
   */
  private simulateStep(dt: number): void {
    const { gravity, damping, iterations } = this.config;

    // 1. Prediction Step
    for (const p of this.particles) {
      if (p.isPinned) continue;

      // Apply gravity
      p.velocity.addScaledVector(gravity, dt);

      // Save previous position
      p.prevPosition.copy(p.position);

      // Predict new position
      p.position.addScaledVector(p.velocity, dt);
    }

    // 2. Constraint Solving Iterations
    for (let k = 0; k < iterations; k++) {
      this.solveDistanceConstraints();
    }

    // 3. Integration Step
    for (const p of this.particles) {
      if (p.isPinned) continue;

      // Calculate new velocity based on position change (Verlet)
      // v = (x - x_prev) / dt
      p.velocity.subVectors(p.position, p.prevPosition).multiplyScalar(1 / dt);

      // Apply global damping
      p.velocity.multiplyScalar(damping);
    }

    // 4. Floor Collision
    const { floorY } = this.config;
    const groundFriction = 0.85;
    const sleepThreshold = 0.01;

    for (const p of this.particles) {
      if (p.isPinned) continue;
      if (p.position.y < floorY) {
        p.position.y = floorY;

        // Stop vertical velocity (definitively)
        p.velocity.y = 0;

        // Apply ground friction to horizontal movement
        p.velocity.x *= groundFriction;
        p.velocity.z *= groundFriction;

        // Sleep check: if velocity is very low, kill it to prevent jitter/micro-bounce
        if (p.velocity.lengthSq() < sleepThreshold * sleepThreshold) {
          p.velocity.set(0, 0, 0);
        }
      }
    }
  }

  /**
   * Solve distance constraints for all links.
   * Ensures particles stay a fixed distance apart.
   */
  private solveDistanceConstraints(): void {
    for (const c of this.constraints) {
      const p1 = this.particles[c.indexA];
      const p2 = this.particles[c.indexB];

      const w1 = p1.invMass;
      const w2 = p2.invMass;
      const wSum = w1 + w2;

      // If both are infinite mass (pinned), skip
      if (wSum === 0) continue;

      // Vector from p1 to p2
      this.tempDiff.subVectors(p2.position, p1.position);

      const currentDist = this.tempDiff.length();
      if (currentDist === 0) continue; // Avoid division by zero

      // Calculate correction scalar: stiffness * (d - rest) / (w1 + w2)
      // For PBD, stiffness = 1.0 (converges to rigid) if iterations correspond
      const correction = (currentDist - c.restLength) / wSum;

      // Direction vector
      this.tempDiff.divideScalar(currentDist); // Normalize

      // Apply positional correction directly
      // x1 += w1 * correction * dir
      if (!p1.isPinned) {
        this.tempVec3.copy(this.tempDiff).multiplyScalar(w1 * correction);
        p1.position.add(this.tempVec3);
      }

      // x2 -= w2 * correction * dir
      if (!p2.isPinned) {
        this.tempVec3.copy(this.tempDiff).multiplyScalar(w2 * correction);
        p2.position.sub(this.tempVec3);
      }
    }
  }
}
