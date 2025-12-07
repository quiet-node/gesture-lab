/**
 * StarBurstEffect Module
 * Creates spectacular mini particle explosions when pinch gesture is detected
 *
 * Features:
 * - Object pooling for efficient particle reuse
 * - Radial explosion with velocity decay
 * - Alpha fade over lifetime
 * - GPU-accelerated rendering via Three.js Points
 *
 * Per DESIGN-v2.md Phase 3.2:
 * - Spawn 500-1000 micro-particles at pinch position
 * - Particles burst outward radially
 * - Fade over 1.5 seconds
 *
 * @see DESIGN-v2.md Phase 3.2
 */

import * as THREE from 'three';
import {
  StarBurstConfig,
  DEFAULT_STAR_BURST_CONFIG,
} from './types/GestureTypes';

/**
 * Individual burst instance tracking
 */
interface BurstInstance {
  /** Unique identifier */
  id: number;
  /** Start time of this burst */
  startTime: number;
  /** Starting index in particle arrays */
  particleStartIndex: number;
  /** Number of particles in this burst */
  particleCount: number;
  /** Origin position of the burst */
  origin: THREE.Vector3;
  /** Whether this burst is still active */
  isActive: boolean;
}

/**
 * Particle data stored in typed arrays for GPU efficiency
 */
interface ParticleData {
  /** Per-particle velocity vectors */
  velocities: Float32Array;
  /** Per-particle initial alpha values */
  initialAlphas: Float32Array;
  /** Per-particle lifetime offsets (for variation) */
  lifetimeOffsets: Float32Array;
}

// Vertex shader for star burst particles
const starBurstVertexShader = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  
  uniform float uTime;
  uniform float uPointSize;
  
  varying float vAlpha;
  
  void main() {
    vAlpha = aAlpha;
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Size with perspective
    float perspectiveSize = aSize * uPointSize * (200.0 / -mvPosition.z);
    gl_PointSize = clamp(perspectiveSize, 0.5, 8.0);
  }
`;

// Fragment shader for star burst particles
const starBurstFragmentShader = /* glsl */ `
  uniform vec3 uColor;
  
  varying float vAlpha;
  
  void main() {
    // Circular point with soft gaussian falloff
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    
    if (dist > 0.5) discard;
    
    // Gaussian falloff for soft particles
    float alpha = exp(-dist * dist * 6.0) * vAlpha;
    
    if (alpha < 0.01) discard;
    
    // Add glow halo
    float halo = exp(-dist * 2.5) * 0.4;
    alpha += halo * vAlpha;
    
    // Output with color
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/**
 * StarBurstEffect - Manages mini particle explosion effects
 *
 * Architecture:
 * - Pre-allocates particle pool for multiple concurrent bursts
 * - Uses object pooling to avoid garbage collection
 * - Updates all active bursts each frame
 * - Automatically recycles completed burst slots
 */
export class StarBurstEffect {
  private scene: THREE.Scene;
  private config: StarBurstConfig;

  // Three.js objects
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private points: THREE.Points;

  // Particle pool
  private maxConcurrentBursts: number;
  private totalParticles: number;
  private particleData: ParticleData;

  // Burst management
  private bursts: BurstInstance[] = [];
  private nextBurstId: number = 0;

  // Buffer attributes (for direct GPU updates)
  private positionAttribute: THREE.BufferAttribute;
  private alphaAttribute: THREE.BufferAttribute;
  private sizeAttribute: THREE.BufferAttribute;

  // Animation state
  private isActive: boolean = false;

  constructor(
    scene: THREE.Scene,
    config: Partial<StarBurstConfig> = {},
    maxConcurrentBursts: number = 5
  ) {
    this.scene = scene;
    this.config = { ...DEFAULT_STAR_BURST_CONFIG, ...config };
    this.maxConcurrentBursts = maxConcurrentBursts;
    this.totalParticles = this.config.particleCount * maxConcurrentBursts;

    // Initialize particle data storage
    this.particleData = {
      velocities: new Float32Array(this.totalParticles * 3),
      initialAlphas: new Float32Array(this.totalParticles),
      lifetimeOffsets: new Float32Array(this.totalParticles),
    };

    // Create geometry and material
    this.geometry = this.createGeometry();
    this.material = this.createMaterial();
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false; // Always render (particles spread widely)

    // Get attribute references
    this.positionAttribute = this.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    this.alphaAttribute = this.geometry.getAttribute(
      'aAlpha'
    ) as THREE.BufferAttribute;
    this.sizeAttribute = this.geometry.getAttribute(
      'aSize'
    ) as THREE.BufferAttribute;

    // Add to scene (starts hidden)
    this.scene.add(this.points);
  }

  /**
   * Create buffer geometry with pre-allocated particle pool
   */
  private createGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();

    // Pre-allocate all particle positions (will be updated dynamically)
    const positions = new Float32Array(this.totalParticles * 3);
    const alphas = new Float32Array(this.totalParticles);
    const sizes = new Float32Array(this.totalParticles);

    // Initialize all particles as invisible (alpha = 0)
    alphas.fill(0);
    sizes.fill(this.config.initialSize);

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    return geometry;
  }

  /**
   * Create shader material for burst particles
   */
  private createMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uPointSize: { value: this.config.initialSize },
        uColor: { value: this.config.color },
      },
      vertexShader: starBurstVertexShader,
      fragmentShader: starBurstFragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }

  /**
   * Trigger a new star burst at the specified position
   *
   * @param position - 3D world position for burst origin
   * @returns Burst ID for tracking (or -1 if pool is full)
   */
  trigger(position: THREE.Vector3): number {
    // Find an inactive burst slot or reuse oldest completed burst
    let slot = this.findAvailableSlot();

    if (slot === -1) {
      // All slots are active - find oldest one to recycle
      slot = this.findOldestBurstSlot();
      if (slot !== -1) {
        this.deactivateBurst(this.bursts[slot]);
      } else {
        console.warn('[StarBurstEffect] No available burst slots');
        return -1;
      }
    }

    const burstId = this.nextBurstId++;

    // Randomize particle count for variation (50% to 150% of base count)
    const particleCountVariation = 0.5 + Math.random();
    const actualParticleCount = Math.floor(
      this.config.particleCount * particleCountVariation
    );

    const startIndex = slot * this.config.particleCount;
    const currentTime = performance.now() / 1000;

    // Create burst instance
    const burst: BurstInstance = {
      id: burstId,
      startTime: currentTime,
      particleStartIndex: startIndex,
      particleCount: actualParticleCount,
      origin: position.clone(),
      isActive: true,
    };

    // Initialize particles for this burst with random velocity multiplier
    const velocityMultiplier = 0.6 + Math.random() * 0.8; // 60% to 140% of base
    this.initializeBurstParticles(burst, velocityMultiplier);

    // Store burst
    if (this.bursts.length <= slot) {
      this.bursts.push(burst);
    } else {
      this.bursts[slot] = burst;
    }

    this.isActive = true;

    console.log(
      `[StarBurstEffect] Triggered burst ${burstId} at (${position.x.toFixed(
        2
      )}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`
    );

    return burstId;
  }

  /**
   * Find an available (inactive) burst slot
   */
  private findAvailableSlot(): number {
    for (let i = 0; i < this.maxConcurrentBursts; i++) {
      if (!this.bursts[i] || !this.bursts[i].isActive) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Find the oldest active burst slot for recycling
   */
  private findOldestBurstSlot(): number {
    let oldestIndex = -1;
    let oldestTime = Infinity;

    for (let i = 0; i < this.bursts.length; i++) {
      if (this.bursts[i] && this.bursts[i].startTime < oldestTime) {
        oldestTime = this.bursts[i].startTime;
        oldestIndex = i;
      }
    }

    return oldestIndex;
  }

  /**
   * Initialize particle data for a new burst
   */
  private initializeBurstParticles(
    burst: BurstInstance,
    velocityMultiplier: number = 1.0
  ): void {
    const positions = this.positionAttribute.array as Float32Array;
    const alphas = this.alphaAttribute.array as Float32Array;
    const sizes = this.sizeAttribute.array as Float32Array;

    for (let i = 0; i < burst.particleCount; i++) {
      const particleIndex = burst.particleStartIndex + i;
      const i3 = particleIndex * 3;

      // Set initial position at origin
      positions[i3] = burst.origin.x;
      positions[i3 + 1] = burst.origin.y;
      positions[i3 + 2] = burst.origin.z;

      // Generate random spherical velocity direction
      const theta = Math.random() * Math.PI * 2; // Azimuthal angle
      const phi = Math.acos(2 * Math.random() - 1); // Polar angle (uniform on sphere)

      // Convert to Cartesian with highly varied speed (30% to 180% variation)
      const speedVariation = 0.3 + Math.random() * 1.5;
      const speed =
        this.config.initialVelocity * speedVariation * velocityMultiplier;

      this.particleData.velocities[i3] =
        Math.sin(phi) * Math.cos(theta) * speed;
      this.particleData.velocities[i3 + 1] =
        Math.sin(phi) * Math.sin(theta) * speed;
      this.particleData.velocities[i3 + 2] = Math.cos(phi) * speed;

      // Set initial alpha with more variation (0.5 to 1.0)
      alphas[particleIndex] = 0.5 + Math.random() * 0.5;
      this.particleData.initialAlphas[particleIndex] = alphas[particleIndex];

      // Random lifetime offset for more variation
      this.particleData.lifetimeOffsets[particleIndex] =
        (Math.random() - 0.5) * 0.4;

      // Much more varied particle sizes (40% to 160% of base)
      sizes[particleIndex] =
        this.config.initialSize * (0.4 + Math.random() * 1.2);
    }

    // Mark attributes for update
    this.positionAttribute.needsUpdate = true;
    this.alphaAttribute.needsUpdate = true;
    this.sizeAttribute.needsUpdate = true;
  }

  /**
   * Update all active bursts
   *
   * @param deltaTime - Time since last frame (seconds)
   */
  update(deltaTime: number): void {
    if (!this.isActive) return;

    const currentTime = performance.now() / 1000;
    const positions = this.positionAttribute.array as Float32Array;
    const alphas = this.alphaAttribute.array as Float32Array;

    let hasActiveBurst = false;
    let hasChanges = false; // Track if we need to update GPU buffers

    for (const burst of this.bursts) {
      if (!burst || !burst.isActive) continue;

      const elapsed = currentTime - burst.startTime;
      const progress = elapsed / this.config.duration;

      if (progress >= 1.0) {
        // Burst complete - deactivate
        this.deactivateBurst(burst);
        hasChanges = true; // Particles were hidden
        continue;
      }

      hasActiveBurst = true;
      hasChanges = true; // We're updating particle positions

      // Update each particle in this burst
      for (let i = 0; i < burst.particleCount; i++) {
        const particleIndex = burst.particleStartIndex + i;
        const i3 = particleIndex * 3;

        // Get velocity
        const vx = this.particleData.velocities[i3];
        const vy = this.particleData.velocities[i3 + 1];
        const vz = this.particleData.velocities[i3 + 2];

        // Apply velocity decay
        const decay = Math.pow(this.config.velocityDecay, deltaTime * 60); // Frame-rate independent
        this.particleData.velocities[i3] *= decay;
        this.particleData.velocities[i3 + 1] *= decay;
        this.particleData.velocities[i3 + 2] *= decay;

        // Update position
        positions[i3] += vx * deltaTime;
        positions[i3 + 1] += vy * deltaTime;
        positions[i3 + 2] += vz * deltaTime;

        // Calculate alpha fade with individual variation
        const lifetimeOffset = this.particleData.lifetimeOffsets[particleIndex];
        const adjustedProgress = Math.max(
          0,
          Math.min(1, progress + lifetimeOffset)
        );

        // Smooth fade out (ease-out curve)
        const fadeProgress = 1.0 - adjustedProgress;
        alphas[particleIndex] =
          this.particleData.initialAlphas[particleIndex] *
          fadeProgress *
          fadeProgress; // Quadratic ease-out
      }
    }

    // Only mark buffers for GPU update if we made changes
    if (hasChanges) {
      this.positionAttribute.needsUpdate = true;
      this.alphaAttribute.needsUpdate = true;
    }

    // Update shader time uniform
    this.material.uniforms.uTime.value = currentTime;

    this.isActive = hasActiveBurst;
  }

  /**
   * Deactivate a burst and hide its particles
   */
  private deactivateBurst(burst: BurstInstance): void {
    burst.isActive = false;

    // Set all particles to invisible
    const alphas = this.alphaAttribute.array as Float32Array;
    for (let i = 0; i < burst.particleCount; i++) {
      alphas[burst.particleStartIndex + i] = 0;
    }
  }

  /**
   * Set burst color
   */
  setColor(color: THREE.Color): void {
    this.config.color = color;
    this.material.uniforms.uColor.value = color;
  }

  /**
   * Set burst duration
   */
  setDuration(duration: number): void {
    this.config.duration = duration;
  }

  /**
   * Set particle count for new bursts
   */
  setParticleCount(count: number): void {
    // Note: This only affects new bursts, not pre-allocated pool size
    this.config.particleCount = Math.min(
      count,
      this.totalParticles / this.maxConcurrentBursts
    );
  }

  /**
   * Check if any bursts are currently active
   */
  hasActiveBursts(): boolean {
    return this.isActive;
  }

  /**
   * Get count of active bursts
   */
  getActiveBurstCount(): number {
    return this.bursts.filter((b) => b && b.isActive).length;
  }

  /**
   * Clear all active bursts immediately
   */
  clear(): void {
    for (const burst of this.bursts) {
      if (burst) {
        this.deactivateBurst(burst);
      }
    }
    this.isActive = false;
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.bursts = [];
    console.log('[StarBurstEffect] Disposed');
  }
}
