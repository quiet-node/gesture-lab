/**
 * StellarWaveRenderer
 *
 * Three.js-based renderer for the Stellar Wave interactive dot grid visualization.
 * Displays a grid of dots that react to ripple effects with spring physics.
 * Uses hybrid CPU/GPU approach: physics computed on CPU, rendering on GPU via shaders.
 *
 * Visual parameters match the reference SwiftUI implementation for consistency.
 */

import * as THREE from 'three';
import {
  DEFAULT_STELLAR_WAVE_CONFIG,
  QuasarSurgePhase,
  type QuasarSurgeState,
  type MeshPoint,
  type RippleState,
  type StellarWaveConfig,
} from './types';

/**
 * Vertex shader for dot rendering
 * Handles position and size based on ripple and black hole intensity
 */
const vertexShader = /* glsl */ `
  attribute float aRippleIntensity;
  attribute float aQuasarSurgeIntensity;
  attribute float aVelocity;
  
  varying float vRippleIntensity;
  varying float vQuasarSurgeIntensity;
  varying float vZ;
  
  uniform float uTime;
  uniform float uNormalSize;
  uniform float uRippleSize;
  
  void main() {
    vRippleIntensity = aRippleIntensity;
    vQuasarSurgeIntensity = aQuasarSurgeIntensity;
    vZ = position.z;
    
    // Size interpolation based on either ripple or quasar surge activity
    // Use the larger ripple size for both to avoid them looking smaller than regular pulses
    float effectiveIntensity = max(aRippleIntensity, aQuasarSurgeIntensity);
    float baseSize = mix(uNormalSize, uRippleSize, step(0.01, effectiveIntensity));
    
    gl_PointSize = baseSize * 2.0; // Diameter
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader for dot rendering
 * Implements HSL color transitions for ripple (cyan → orange) and black hole effects
 * Black hole charging: deep purple/blue event horizon colors
 * Black hole burst: vibrant cosmic explosion colors (magenta, electric blue, white)
 */
const fragmentShader = /* glsl */ `
  varying float vRippleIntensity;
  varying float vQuasarSurgeIntensity;
  varying float vZ;
  
  uniform float uQuasarSurgePhase; // 0 = inactive, 1 = charging, 2 = bursting
  
  /**
   * Convert HSL to RGB color space
   * Standard algorithm for precise color control
   */
  vec3 hsl2rgb(float h, float s, float l) {
    vec3 rgb = clamp(
      abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0,
      0.0,
      1.0
    );
    return l + s * (rgb - 0.5) * (1.0 - abs(2.0 * l - 1.0));
  }
  
  void main() {
    // Circular dot with anti-aliased edge
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    
    // Discard pixels outside the circle
    if (dist > 0.5) discard;
    
    // Soft edge for anti-aliasing
    float alpha = 1.0 - smoothstep(0.4, 0.5, dist);
    
    vec3 color;
    float finalAlpha;
    
    // Quasar surge effect takes priority when active
    if (vQuasarSurgeIntensity > 0.01) {
      if (uQuasarSurgePhase > 1.5) {
        // Bursting phase: High-Visibility Neon Overdrive
        // Mirrors the charging spectrum but with much higher vibrancy and persistence
        float heat = vQuasarSurgeIntensity;
        
        // 1. Core Hue Spectrum (Cohesive with charging range)
        float burstHue = 0.55 - heat * 0.55; 
        burstHue = mod(burstHue + 1.0, 1.0);
        
        // 2. Vivid Neon Base (Full Saturation)
        // Lightness slightly higher (0.6) for visibility on dark backgrounds
        color = hsl2rgb(burstHue, 1.0, 0.55);
        
        // 3. Incandescent Additive Glow (The "Energy Discharge" feel)
        // Boosted intensity for better visibility
        float energy = pow(heat, 1.5);
        color += color * energy * 6.0; 
        
        // 4. Singularity Core Recall (Vivid Red Peak)
        float redCore = pow(heat, 4.0);
        color = mix(color, vec3(2.5, 0.0, 0.0), redCore);
        
        // 5. Ultimate Energy Pulse (Shockwave peak)
        // Using a light-yellow tint instead of pure white to maintain color presence
        float flash = pow(heat, 12.0);
        color = mix(color, vec3(1.1, 1.0, 0.5), flash * 0.8);
        
        // 6. Alpha presence: making the dots very "visible" 
        finalAlpha = alpha * (0.95 + heat * 0.05);
      } else {
        // Charging phase: Concentric heat spectrum with a focused HOT RED core
        // Intense focus on the center to create a "solid" mass feel
        float coreFocus = pow(vQuasarSurgeIntensity, 1.2);
        float heat = pow(vQuasarSurgeIntensity, 1.8);
        
        float chargeHue = 0.55 - heat * 0.55; // Cyan (0.55) -> Blue -> Purple -> Pure Red (0.0)
        chargeHue = mod(chargeHue + 1.0, 1.0);
        
        float chargeSat = 1.0; // Max saturation for visibility
        float chargeLight = 0.5; // Balanced lightness for vivid color
        
        color = hsl2rgb(chargeHue, chargeSat, chargeLight);
        
        // Intense centralized heat glow - HOT RED focal point
        // Using an aggressive exponential curve to make the core feel "heavy" and "dense"
        float coreGlowStrength = pow(vQuasarSurgeIntensity, 5.0);
        // Pure deep spectral red spike
        color += vec3(1.2, 0.0, 0.0) * coreGlowStrength * 2.0;
        
        // Inner hot singularity - super-saturated "True Red" glow
        float redHotValue = pow(vQuasarSurgeIntensity, 10.0);
        vec3 hotRed = vec3(1.5, 0.0, 0.0); // Oversaturated red for "emissive" feel
        color = mix(color, hotRed, redHotValue);
        
        // Final color punch for maximum redness
        color.r = max(color.r, pow(vQuasarSurgeIntensity, 3.0) * 1.5);
        
        // Solid core alpha: opacity increases for the dense mass appearance
        finalAlpha = alpha * (0.85 + coreFocus * 0.15);
        
        // Subtle dimensional darkening as particles enter the singularity
        float depthFactor = smoothstep(0.0, -300.0, vZ);
        color *= (1.0 - depthFactor * 0.15);
      }
    } else if (vRippleIntensity > 0.01) {
      // Ripple color: HSL hue from 0.55 (cyan) to -0.05 (orange/red)
      // Saturation 0.95, Lightness 0.5 for vibrant colors
      float hue = 0.55 - vRippleIntensity * 0.6;
      // Wrap negative hue values
      hue = mod(hue + 1.0, 1.0);
      color = hsl2rgb(hue, 0.95, 0.5);
      finalAlpha = alpha;
    } else {
      // Normal state: white at 75% opacity
      color = vec3(1.0);
      finalAlpha = alpha * 0.75;
    }
    
    gl_FragColor = vec4(color, finalAlpha);
  }
`;

/**
 * Shader uniform types for the stellar wave material
 */
interface StellarWaveUniforms {
  [uniform: string]: { value: number };
  uNormalSize: { value: number };
  uRippleSize: { value: number };
  uQuasarSurgePhase: { value: number };
}

/**
 * StellarWaveRenderer - Renders interactive dot grid with ripple effects
 */
export class StellarWaveRenderer {
  private scene: THREE.Scene;
  private camera: THREE.OrthographicCamera;
  private renderer: THREE.WebGLRenderer;
  private points: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private uniforms: StellarWaveUniforms;
  private config: StellarWaveConfig;
  private container: HTMLElement;
  private cameraBasePosition: THREE.Vector3 = new THREE.Vector3();

  // Grid state
  private meshPoints: MeshPoint[] = [];

  // Ripple tracking
  private ripples: RippleState[] = [];
  private animationTime: number = 0;

  // Interaction tracking (Left Index Finger)
  private interactionPoint: { x: number; y: number } | null = null;

  // Attraction tracking (Right Fist)
  private attractionPoint: { x: number; y: number; strength: number } | null = null;

  // Vortex tracking (Left Fist)
  private vortexPoint: { x: number; y: number } | null = null;

  // Quasar Surge state (Right Middle Finger + Thumb Pinch)
  private quasarSurgeState: QuasarSurgeState = {
    phase: QuasarSurgePhase.INACTIVE,
    center: { x: 0, y: 0 },
    chargeStartTime: 0,
    chargeDuration: 0,
    chargeIntensity: 0,
    burstStartTime: 0,
    storedEnergy: 0,
  };

  // Position and intensity buffers (for GPU updates)
  private positionAttribute: THREE.BufferAttribute | null = null;
  private rippleIntensityAttribute: THREE.BufferAttribute | null = null;
  private quasarSurgeIntensityAttribute: THREE.BufferAttribute | null = null;
  private velocityAttribute: THREE.BufferAttribute | null = null;

  constructor(container: HTMLElement, config: Partial<StellarWaveConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_STELLAR_WAVE_CONFIG, ...config };

    // Initialize uniforms
    this.uniforms = {
      uTime: { value: 0 },
      uNormalSize: { value: this.config.normalDotRadius },
      uRippleSize: { value: this.config.rippleDotRadius },
      uQuasarSurgePhase: { value: 0 }, // 0 = inactive, 1 = charging, 2 = bursting
    };

    // Create Three.js scene
    this.scene = new THREE.Scene();

    // Create orthographic camera matching viewport (pixel coordinates)
    const width = container.clientWidth;
    const height = container.clientHeight;
    // Use a wider Z range for 3D displacement effects
    this.camera = new THREE.OrthographicCamera(0, width, 0, height, -1000, 1000);
    this.camera.position.z = 500;
    this.cameraBasePosition.copy(this.camera.position);

    // Create WebGL renderer with transparency for camera overlay
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    container.appendChild(this.renderer.domElement);

    // Position canvas for overlay
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.pointerEvents = 'none';

    // Handle resize
    window.addEventListener('resize', this.handleResize);
  }

  /**
   * Initialize the dot grid and prepare for rendering
   */
  initialize(): void {
    this.createMesh();
  }

  /**
   * Create the mesh grid of dots
   * Grid is centered in the viewport with edge dots pinned
   */
  private createMesh(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    const { spacing } = this.config;

    // Calculate grid dimensions
    const cols = Math.floor(width / spacing) + 3;
    const rows = Math.floor(height / spacing) + 3;

    // Center the grid
    const totalWidth = (cols - 1) * spacing;
    const totalHeight = (rows - 1) * spacing;
    const startX = (width - totalWidth) / 2;
    const startY = (height - totalHeight) / 2;

    // Reset state
    this.meshPoints = [];

    // Create points
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = startX + col * spacing;
        const y = startY + row * spacing;

        // Edge points are pinned (don't move)
        const isPinned = row === 0 || row === rows - 1 || col === 0 || col === cols - 1;

        this.meshPoints.push({
          position: { x, y },
          restPosition: { x, y },
          velocity: { dx: 0, dy: 0 },
          pinned: isPinned,
          rippleIntensity: 0,
        });
      }
    }

    // Create Three.js geometry
    this.createGeometry();
  }

  /**
   * Create BufferGeometry from mesh points
   */
  private createGeometry(): void {
    // Clean up previous geometry
    if (this.points) {
      this.scene.remove(this.points);
      this.geometry?.dispose();
      this.material?.dispose();
    }

    const count = this.meshPoints.length;

    // Create typed arrays
    const positions = new Float32Array(count * 3);
    const rippleIntensities = new Float32Array(count);
    const quasarSurgeIntensities = new Float32Array(count);

    // Fill initial positions
    for (let i = 0; i < count; i++) {
      const point = this.meshPoints[i];
      positions[i * 3] = point.position.x;
      positions[i * 3 + 1] = point.position.y;
      positions[i * 3 + 2] = 0;
      rippleIntensities[i] = point.rippleIntensity;
      quasarSurgeIntensities[i] = 0;
    }

    // Create geometry
    this.geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(positions, 3);
    this.rippleIntensityAttribute = new THREE.BufferAttribute(rippleIntensities, 1);
    this.quasarSurgeIntensityAttribute = new THREE.BufferAttribute(quasarSurgeIntensities, 1);
    this.velocityAttribute = new THREE.BufferAttribute(new Float32Array(this.meshPoints.length), 1);

    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('aRippleIntensity', this.rippleIntensityAttribute);
    this.geometry.setAttribute('aQuasarSurgeIntensity', this.quasarSurgeIntensityAttribute);
    this.geometry.setAttribute('aVelocity', this.velocityAttribute);

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
    });

    // Create Points mesh
    this.points = new THREE.Points(this.geometry, this.material);
    this.scene.add(this.points);
  }

  /**
   * Trigger a Cosmic Pulse (Ripple) effect at the specified screen coordinates
   * @param x - X position in normalized coordinates (0-1)
   * @param y - Y position in normalized coordinates (0-1)
   */
  triggerCosmicPulse(x: number, y: number): void {
    // Convert normalized coordinates to screen pixels
    // Mirror X axis to match the flipped video display (transform: scaleX(-1))
    const screenX = (1 - x) * this.container.clientWidth;
    const screenY = y * this.container.clientHeight;

    // Limit concurrent ripples
    const activeRipples = this.ripples.filter((r) => r.active);
    if (activeRipples.length >= this.config.maxRipples) {
      // Deactivate oldest ripple
      const oldest = this.ripples.find((r) => r.active);
      if (oldest) oldest.active = false;
    }

    // Add new ripple
    this.ripples.push({
      center: { x: screenX, y: screenY },
      startTime: this.animationTime,
      active: true,
    });
  }

  /**
   * Update the Force Field interaction point (Left Index Finger)
   * @param x - X position in normalized coordinates (0-1), or null to clear
   * @param y - Y position in normalized coordinates (0-1), or null to clear
   */
  setForceField(x: number | null, y: number | null): void {
    if (x === null || y === null) {
      this.interactionPoint = null;
      return;
    }

    // Convert normalized coordinates to screen pixels
    // Mirror X axis to match the flipped video display (transform: scaleX(-1))
    const screenX = (1 - x) * this.container.clientWidth;
    const screenY = y * this.container.clientHeight;

    this.interactionPoint = { x: screenX, y: screenY };
  }

  /**
   * Set the Gravity Well attraction point
   * @param x - X position in normalized coordinates (0-1), or null to clear
   * @param y - Y position in normalized coordinates (0-1), or null to clear
   * @param strength - Attraction strength (default 5.0)
   */
  setGravityWell(x: number | null, y: number | null, strength: number = 5.0): void {
    if (x === null || y === null) {
      this.attractionPoint = null;
      return;
    }

    // Convert normalized coordinates to screen pixels
    // Mirror X axis to match video
    const screenX = (1 - x) * this.container.clientWidth;
    const screenY = y * this.container.clientHeight;

    this.attractionPoint = { x: screenX, y: screenY, strength };
  }

  /**
   * Set the Nebula Vortex interaction point
   * @param x - X position in normalized coordinates (0-1), or null to clear
   * @param y - Y position in normalized coordinates (0-1), or null to clear
   */
  setVortex(x: number | null, y: number | null): void {
    if (x === null || y === null) {
      this.vortexPoint = null;
      return;
    }

    // Convert normalized coordinates to screen pixels
    const screenX = (1 - x) * this.container.clientWidth;
    const screenY = y * this.container.clientHeight;

    this.vortexPoint = { x: screenX, y: screenY };
  }

  /**
   * Start or update the Quasar Surge charging effect
   * Particles spiral inward toward the pinch point with gravitational attraction
   *
   * @param x - X position in normalized coordinates (0-1)
   * @param y - Y position in normalized coordinates (0-1)
   * @param chargeIntensity - Charge intensity based on hold duration (0-1)
   */
  startQuasarSurgeCharge(x: number, y: number, chargeIntensity: number): void {
    // Convert normalized coordinates to screen pixels
    const screenX = (1 - x) * this.container.clientWidth;
    const screenY = y * this.container.clientHeight;

    if (this.quasarSurgeState.phase === QuasarSurgePhase.INACTIVE) {
      // Initialize new quasar surge
      this.quasarSurgeState = {
        phase: QuasarSurgePhase.CHARGING,
        center: { x: screenX, y: screenY },
        chargeStartTime: this.animationTime,
        chargeDuration: 0,
        chargeIntensity: 0,
        burstStartTime: 0,
        storedEnergy: 0,
      };
    }

    // Update position and intensity
    this.quasarSurgeState.center = { x: screenX, y: screenY };
    this.quasarSurgeState.chargeIntensity = Math.min(1, chargeIntensity);
    this.quasarSurgeState.chargeDuration =
      this.animationTime - this.quasarSurgeState.chargeStartTime;

    // Update shader uniform
    this.uniforms.uQuasarSurgePhase.value = 1; // Charging phase
  }

  /**
   * Trigger the Quasar Surge burst (supernova explosion)
   * Called when the pinch gesture is released
   */
  triggerQuasarSurgeBurst(): number {
    if (this.quasarSurgeState.phase !== QuasarSurgePhase.CHARGING) {
      return 0;
    }

    // Calculate stored energy based on charge duration and intensity
    const chargeTime = this.quasarSurgeState.chargeDuration;
    const maxChargeTime = this.config.quasarSurgeMaxChargeTime / 1000;
    const normalizedCharge = Math.min(1, chargeTime / maxChargeTime);

    this.quasarSurgeState.phase = QuasarSurgePhase.BURSTING;
    this.quasarSurgeState.burstStartTime = this.animationTime;
    // Trip the power for a massive explosion
    // Scale velocity based on charge
    this.quasarSurgeState.storedEnergy =
      normalizedCharge * this.config.quasarSurgeBurstVelocity * 3.5;

    // Update shader uniform
    this.uniforms.uQuasarSurgePhase.value = 2; // Bursting phase

    return normalizedCharge;
  }

  /**
   * Clear the Quasar Surge effect
   */
  clearQuasarSurge(): void {
    this.quasarSurgeState.phase = QuasarSurgePhase.INACTIVE;
    this.uniforms.uQuasarSurgePhase.value = 0;
  }

  /**
   * Get the current quasar surge phase
   */
  getQuasarSurgePhase(): QuasarSurgePhase {
    return this.quasarSurgeState.phase;
  }

  /**
   * Update physics simulation and ripple propagation
   * @param deltaTime - Time elapsed since last frame in seconds
   */
  update(deltaTime: number): void {
    this.animationTime += deltaTime;
    this.uniforms.uTime.value = this.animationTime;

    // Update ripple effects
    this.updateRipples();

    // Update quasar surge effect (charging or bursting)
    this.updateQuasarSurge(deltaTime);

    // Update spring physics for all points
    this.updatePhysics();

    // Sync CPU state to GPU buffers
    this.syncBuffers();
  }

  /**
   * Update ripple wave propagation and apply effects to points
   */
  private updateRipples(): void {
    const { rippleSpeed, rippleWidth, rippleDuration } = this.config;

    // Decay all ripple intensities
    for (const point of this.meshPoints) {
      point.rippleIntensity *= 0.92;
    }

    // Process each active ripple
    for (const ripple of this.ripples) {
      if (!ripple.active) continue;

      const rippleAge = this.animationTime - ripple.startTime;

      // Deactivate expired ripples
      if (rippleAge >= rippleDuration) {
        ripple.active = false;
        continue;
      }

      // Current ripple ring radius
      const rippleRadius = rippleAge * rippleSpeed;

      // Apply ripple effect to points within the ring
      for (const point of this.meshPoints) {
        if (point.pinned) continue;

        // Distance from ripple center to point's rest position
        const dx = point.restPosition.x - ripple.center.x;
        const dy = point.restPosition.y - ripple.center.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Check if point is within the ripple ring
        const distFromRing = Math.abs(distance - rippleRadius);
        if (distFromRing < rippleWidth) {
          // Calculate ripple strength (fades with age and distance from ring center)
          const ringFade = 1 - distFromRing / rippleWidth;
          const ageFade = 1 - rippleAge / rippleDuration;
          const rippleStrength = ringFade * ageFade;

          // Update ripple intensity for color effect
          point.rippleIntensity = Math.max(point.rippleIntensity, rippleStrength * 0.8);

          // Apply outward velocity push
          if (distance > 1) {
            const pushStrength = rippleStrength * 6;
            point.velocity.dx += (dx / distance) * pushStrength;
            point.velocity.dy += (dy / distance) * pushStrength;
          }
        }
      }
    }

    // Clean up inactive ripples (keep array from growing indefinitely)
    this.ripples = this.ripples.filter(
      (r) => r.active || this.animationTime - r.startTime < rippleDuration + 0.5
    );
  }

  /**
   * Update Quasar Surge physics simulation
   * Handles both charging (spiral inward) and bursting (explosion outward) phases
   *
   * @param deltaTime - Time elapsed since last frame in seconds
   */
  private updateQuasarSurge(deltaTime: number): void {
    if (this.quasarSurgeState.phase === QuasarSurgePhase.INACTIVE) {
      // Gradually return particles to Z=0 when effect ends
      for (const point of this.meshPoints) {
        if (point.position.z && point.position.z !== 0) {
          point.position.z *= 0.85;
          if (Math.abs(point.position.z) < 0.05) point.position.z = 0;
        }
      }
      return;
    }

    const {
      quasarSurgeRadius,
      quasarSurgeStrength,
      quasarSurgeSpiralSpeed,
      quasarSurgeBurstDuration,
    } = this.config;
    const centerX = this.quasarSurgeState.center.x;
    const centerY = this.quasarSurgeState.center.y;

    if (this.quasarSurgeState.phase === QuasarSurgePhase.CHARGING) {
      // CHARGING PHASE: Particles spiral inward toward the quasar surge center
      const chargeIntensity = this.quasarSurgeState.chargeIntensity;

      for (const point of this.meshPoints) {
        if (point.pinned) continue;

        const dx = point.position.x - centerX;
        const dy = point.position.y - centerY;
        const distSq = dx * dx + dy * dy;
        const distance = Math.sqrt(distSq + 1);

        // 0. Gradual ordered sequence that grows with charge time/intensity
        // The longer the hold, the further out the gravitational pull reaches
        const growthRange = quasarSurgeRadius * (0.4 + chargeIntensity * 2.5);
        const localInfluence = Math.max(0, Math.min(1, (growthRange - distance) / 250 + 0.5));

        // Ensure minimum visual feedback immediately
        const baseCharge = Math.max(0.1, chargeIntensity);
        const effectiveCharge = baseCharge * localInfluence;
        if (effectiveCharge < 0.01) continue;

        // Normalized distance for physics falloff
        const proximity = 1.0 - Math.min(1.0, distance / (quasarSurgeRadius * 1.5));

        // 1. Gravitational Pull (Inward Attraction)
        // Highly condensed core using very low softening and aggressive exponential acceleration
        const acceleration = 1.0 + Math.pow(proximity, 4.0) * 25.0;
        const softeningSq = 49; // Extreme core interaction (7px softening)
        const pullStrength =
          (quasarSurgeStrength * 12000 * effectiveCharge * acceleration) / (distSq + softeningSq);

        // Core trapping: pull significantly harder when very close to ensure a dense center mass
        const coreTrapFactor = distance < 25.0 ? 6.0 : 1.0;
        const attractX = (-dx / distance) * pullStrength * coreTrapFactor;
        const attractY = (-dy / distance) * pullStrength * coreTrapFactor;

        // 2. Spiral Rotation (Transverse Force)
        // Tighten the spiral by reducing tangential velocity relative to attraction near the core
        // This ensures particles collapse into the center rather than maintaining wide orbits
        const orbitTightness = Math.max(0.02, 1.0 - Math.pow(proximity, 0.7) * 0.98);
        const spiralSpeedMult = (1.0 + Math.pow(proximity, 2.5) * 15.0) * orbitTightness;
        const spiralStrength = quasarSurgeSpiralSpeed * effectiveCharge * spiralSpeedMult;

        const rotateX = (-dy / distance) * spiralStrength;
        const rotateY = (dx / distance) * spiralStrength;

        // 3. Dimensional Depth (Z-axis deformation)
        const targetZ = -proximity * 400 * effectiveCharge;
        point.position.z = (point.position.z || 0) + (targetZ - (point.position.z || 0)) * 0.25;

        // 4. Update Velocity and Position
        const timeStep = deltaTime * 60;
        point.velocity.dx += (attractX + rotateX) * timeStep;
        point.velocity.dy += (attractY + rotateY) * timeStep;

        // Stronger damping at the very center to lock particles into the singularity
        const dynamicDamping = 0.9 - Math.pow(proximity, 1.2) * 0.12;
        point.velocity.dx *= dynamicDamping;
        point.velocity.dy *= dynamicDamping;
      }
    } else if (this.quasarSurgeState.phase === QuasarSurgePhase.BURSTING) {
      // BURSTING PHASE: Supernova-like explosion
      const burstAge = this.animationTime - this.quasarSurgeState.burstStartTime;

      // Check if burst has completed
      if (burstAge >= quasarSurgeBurstDuration) {
        this.clearQuasarSurge();
        return;
      }

      // Burst intensity decays over time (explosive ease-out)
      const burstProgress = burstAge / quasarSurgeBurstDuration;
      const burstIntensity = Math.pow(1 - burstProgress, 0.5); // Fast start, gradual decay

      // Only apply impulse during the initial burst frames
      const isInitialBurst = burstAge < 0.1; // First 100ms

      for (const point of this.meshPoints) {
        if (point.pinned) continue;

        const dx = point.position.x - centerX;
        const dy = point.position.y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 0.1) {
          if (isInitialBurst) {
            // Initial explosive impulse
            const storedEnergy = this.quasarSurgeState.storedEnergy;
            const explosionRadius = quasarSurgeRadius * 1.5;

            // Particles closer to center get more velocity (they were "compressed" more)
            const compressionFactor = Math.max(0, 1 - distance / explosionRadius);
            const explosionStrength = storedEnergy * (0.5 + compressionFactor * 0.5);

            // Add some chaos/variation to trajectories
            const chaosAngle = (Math.random() - 0.5) * 0.3;
            const cosAngle = Math.cos(chaosAngle);
            const sinAngle = Math.sin(chaosAngle);

            // Base outward direction
            const dirX = dx / distance;
            const dirY = dy / distance;

            // Apply rotation for chaos
            const chaosDirX = dirX * cosAngle - dirY * sinAngle;
            const chaosDirY = dirX * sinAngle + dirY * cosAngle;

            point.velocity.dx += chaosDirX * explosionStrength;
            point.velocity.dy += chaosDirY * explosionStrength;
          }

          // Continuous shockwave effect (secondary wave)
          const shockwaveRadius = burstAge * quasarSurgeRadius * 3.5; // Fast expanding ring
          const shockwaveWidth = 150; // Wide visual band
          const distFromShockwave = Math.abs(distance - shockwaveRadius);

          if (distFromShockwave < shockwaveWidth && shockwaveRadius < quasarSurgeRadius * 2.5) {
            // Sharper shockwave front
            const normalizedDist = distFromShockwave / shockwaveWidth;
            const shockStrength = Math.pow(1.0 - normalizedDist, 3.0) * burstIntensity * 5.0;

            // Push outward
            point.velocity.dx += (dx / distance) * shockStrength;
            point.velocity.dy += (dy / distance) * shockStrength;

            // "Vacuum" effect: If inside the shockwave radius, push HARDER to clear the center
            if (distance < shockwaveRadius) {
              point.velocity.dx += (dx / distance) * shockStrength * 0.5;
              point.velocity.dy += (dy / distance) * shockStrength * 0.5;
            }
          }
        }
      }
    }
  }

  /**
   * Update spring physics for all non-pinned points
   */
  private updatePhysics(): void {
    const { stiffness, damping } = this.config;
    // Pre-calculate attraction constants if active
    const attractionActive = !!this.attractionPoint;
    const attrX = this.attractionPoint?.x || 0;
    const attrY = this.attractionPoint?.y || 0;
    const attrStrength = (this.attractionPoint?.strength || 0) * 2000; // Scale up for noticeable effect
    const softeningSq = 2500; // 50^2 softening radius

    for (const point of this.meshPoints) {
      if (point.pinned) continue;

      // 1. Apply Gravity Well (Attraction)
      if (attractionActive) {
        const dx = attrX - point.position.x;
        const dy = attrY - point.position.y;
        const distSq = dx * dx + dy * dy;

        // Softened Gravity Formula: F = G * M / (d^2 + softening^2)
        const force = attrStrength / (distSq + softeningSq);

        point.velocity.dx += dx * force * 0.05; // 0.05 time step adjustment
        point.velocity.dy += dy * force * 0.05;

        // Visual Feedback: Darken/Purple shift for points under high gravity
        // We use negative ripple intensity to signal "compression" to the shader (optional, if supported)
        // For now, let's just make them glow intensely (positive)
        if (force > 0.5) {
          point.rippleIntensity = Math.min(1.0, point.rippleIntensity + force * 0.02);
        }
      }

      // 2. Spring force toward rest position
      const dx = point.restPosition.x - point.position.x;
      const dy = point.restPosition.y - point.position.y;

      point.velocity.dx += dx * stiffness;
      point.velocity.dy += dy * stiffness;

      // Apply damping
      point.velocity.dx *= damping;
      point.velocity.dy *= damping;

      // Update position
      point.position.x += point.velocity.dx;
      point.position.y += point.velocity.dy;
    }

    // Apply Force Field repulsion (Left Pinch - Legacy/Alternative)
    if (this.interactionPoint) {
      const { interactionRadius, repulsionStrength } = this.config;

      for (const point of this.meshPoints) {
        if (point.pinned) continue;

        const dx = point.position.x - this.interactionPoint.x;
        const dy = point.position.y - this.interactionPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < interactionRadius) {
          // Calculate repulsion force (stronger when closer)
          const force = (1 - distance / interactionRadius) * repulsionStrength;

          // Apply force away from interaction point
          if (distance > 0.01) {
            point.velocity.dx += (dx / distance) * force;
            point.velocity.dy += (dy / distance) * force;

            // Also add a bit of ripple intensity for visual feedback
            point.rippleIntensity = Math.max(point.rippleIntensity, force * 0.1);
          }
        }
      }
    }

    // Apply Nebula Vortex (Left Fist)
    if (this.vortexPoint) {
      const { vortexRadius, vortexStrength } = this.config;

      for (const point of this.meshPoints) {
        if (point.pinned) continue;

        const dx = point.position.x - this.vortexPoint.x;
        const dy = point.position.y - this.vortexPoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < vortexRadius) {
          // Calculate vortex force (strongest near center, fades at edge)
          // Use a smooth bell curve-like falloff for better looking spiral
          const normalizedDist = distance / vortexRadius;
          const force = (1 - normalizedDist) * vortexStrength;

          // Perpendicular vector (-dy, dx) creates rotation
          // Clockwise rotation: (dy, -dx)
          // Counter-clockwise: (-dy, dx)
          if (distance > 1.0) {
            const rotDx = -dy / distance; // Perpendicular X
            const rotDy = dx / distance; // Perpendicular Y

            point.velocity.dx += rotDx * force;
            point.velocity.dy += rotDy * force;

            // Slight attraction to center to keep the spiral tight (Optional)
            point.velocity.dx -= (dx / distance) * force * 0.2;
            point.velocity.dy -= (dy / distance) * force * 0.2;

            // Add intense ripple visual
            point.rippleIntensity = Math.max(point.rippleIntensity, force * 0.15);
          }
        }
      }
    }
  }

  /**
   * Sync CPU mesh state to GPU buffer attributes
   */
  private syncBuffers(): void {
    if (
      !this.positionAttribute ||
      !this.rippleIntensityAttribute ||
      !this.quasarSurgeIntensityAttribute
    ) {
      return;
    }

    const positions = this.positionAttribute.array as Float32Array;
    const intensities = this.rippleIntensityAttribute.array as Float32Array;
    const quasarSurgeIntensities = this.quasarSurgeIntensityAttribute.array as Float32Array;
    const velocities = this.velocityAttribute!.array as Float32Array;

    const isQuasarSurgeActive = this.quasarSurgeState.phase !== QuasarSurgePhase.INACTIVE;
    const centerX = this.quasarSurgeState.center.x;
    const centerY = this.quasarSurgeState.center.y;
    const quasarSurgeRadius = this.config.quasarSurgeRadius;

    for (let i = 0; i < this.meshPoints.length; i++) {
      const point = this.meshPoints[i];
      positions[i * 3] = point.position.x;
      positions[i * 3 + 1] = point.position.y;
      positions[i * 3 + 2] = point.position.z || 0;
      intensities[i] = point.rippleIntensity;
      velocities[i] = Math.sqrt(
        point.velocity.dx * point.velocity.dx + point.velocity.dy * point.velocity.dy
      );

      // Calculate quasar surge intensity based on distance from center
      if (isQuasarSurgeActive) {
        const dx = point.position.x - centerX;
        const dy = point.position.y - centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Visual influence range grows as the surge charges up
        const chargeIntensity = this.quasarSurgeState.chargeIntensity;
        const visualMultiplier = Math.max(0.15, chargeIntensity);
        const visualInfluenceRange = quasarSurgeRadius * (0.4 + visualMultiplier * 2.5);
        const normalizedDist = Math.min(1.0, distance / (visualInfluenceRange + 0.1));

        // Intensity is higher and more "focused" near the center to create a hotter, dense core
        const baseIntensity = Math.pow(1.0 - normalizedDist, 3.5);

        if (this.quasarSurgeState.phase === QuasarSurgePhase.BURSTING) {
          // BURST MODE: Combined intensity for smooth handover
          const burstAge = this.animationTime - this.quasarSurgeState.burstStartTime;
          const shockwaveRadius = burstAge * quasarSurgeRadius * 3.5;
          const shockwaveWidth = 200; // Visual glow width
          const distFromShockwave = Math.abs(distance - shockwaveRadius);

          let burstIntensity = 0;

          if (distFromShockwave < shockwaveWidth) {
            const normalizedDist = distFromShockwave / shockwaveWidth;
            // Glow peaks at the shockwave edge
            burstIntensity = Math.pow(1.0 - normalizedDist, 1.5);
          }

          // Also keep some velocity-based glow for the chaos particles
          const velocityMag = Math.sqrt(
            point.velocity.dx * point.velocity.dx + point.velocity.dy * point.velocity.dy
          );
          burstIntensity = Math.max(burstIntensity, Math.min(1.0, velocityMag / 20.0));

          // PERSISTENCE FIX: Include the base "charged" intensity but decay it
          // This prevents dots from turning white before the shockwave reaches them
          const visualMultiplier = Math.max(0.15, this.quasarSurgeState.chargeIntensity);
          const chargingInfluenceRange = quasarSurgeRadius * (0.4 + visualMultiplier * 2.5);
          const normalizedDistCharging = Math.min(1.0, distance / (chargingInfluenceRange + 0.1));
          const residualBaseIntensity =
            Math.pow(1.0 - normalizedDistCharging, 3.5) * visualMultiplier;

          // Exponential decay of the residual glow
          const residualDecay = Math.max(0, 1.0 - burstAge * 1.5);
          const finalIntensity = Math.max(burstIntensity, residualBaseIntensity * residualDecay);

          const chargeScale = 0.3 + this.quasarSurgeState.chargeIntensity * 0.7;
          quasarSurgeIntensities[i] = finalIntensity * chargeScale;
        } else {
          // Combined intensity for coloring
          quasarSurgeIntensities[i] = baseIntensity * visualMultiplier;
        }
      } else {
        // Decay quasar surge intensity when inactive
        quasarSurgeIntensities[i] *= 0.9;
      }
    }

    this.positionAttribute.needsUpdate = true;
    this.rippleIntensityAttribute.needsUpdate = true;
    this.quasarSurgeIntensityAttribute.needsUpdate = true;
    this.velocityAttribute!.needsUpdate = true;
  }

  /**
   * Render the scene
   */
  render(): void {
    // Apply camera shake if quasar surge is charging or recently burst
    if (this.quasarSurgeState.phase === QuasarSurgePhase.CHARGING) {
      const intensity = this.quasarSurgeState.chargeIntensity;
      if (intensity > 0.3) {
        // Higher charge = more intense, higher frequency tremor
        const shakeAmount = (intensity - 0.3) * 6.0;
        const speed = 20.0 + intensity * 40.0;

        this.camera.position.x =
          this.cameraBasePosition.x + Math.sin(Date.now() * 0.05 * speed) * shakeAmount;
        this.camera.position.y =
          this.cameraBasePosition.y + Math.cos(Date.now() * 0.04 * speed) * shakeAmount;
      } else {
        this.camera.position.copy(this.cameraBasePosition);
      }
    } else if (this.quasarSurgeState.phase === QuasarSurgePhase.BURSTING) {
      // Impact shake that decays after burst
      // Shake strength depends on how fully charged it was
      const burstAge = (Date.now() - this.quasarSurgeState.burstStartTime) / 1000;
      if (burstAge < 0.5) {
        const decay = 1.0 - burstAge / 0.5;
        const baseShake = 15.0;
        // Scale shake by charge intensity (min 20% shake)
        const intensityScale = 0.2 + this.quasarSurgeState.chargeIntensity * 0.8;
        const shakeAmount = decay * baseShake * intensityScale;

        this.camera.position.x = this.cameraBasePosition.x + (Math.random() - 0.5) * shakeAmount;
        this.camera.position.y = this.cameraBasePosition.y + (Math.random() - 0.5) * shakeAmount;
      } else {
        this.camera.position.copy(this.cameraBasePosition);
      }
    } else {
      this.camera.position.copy(this.cameraBasePosition);
    }

    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Get the number of dots in the grid
   */
  getDotCount(): number {
    return this.meshPoints.length;
  }

  /**
   * Get the number of active ripples
   */
  getActiveRippleCount(): number {
    return this.ripples.filter((r) => r.active).length;
  }

  /**
   * Clear all active ripples and reset dot positions to their resting state.
   */
  clearRipples(): void {
    this.ripples = [];
    for (const point of this.meshPoints) {
      point.rippleIntensity = 0;
      point.velocity = { dx: 0, dy: 0 };
      point.position.x = point.restPosition.x;
      point.position.y = point.restPosition.y;
    }
    this.syncBuffers();
  }

  /**
   * Updates rendering dimensions and recreates the grid when the window size changes.
   */
  private handleResize = (): void => {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    // Update camera
    this.camera.right = width;
    this.camera.bottom = height;
    this.camera.updateProjectionMatrix();
    this.cameraBasePosition.copy(this.camera.position);

    // Update renderer
    this.renderer.setSize(width, height);

    // Recreate mesh for new dimensions
    this.createMesh();
  };

  /**
   * Clean up resources
   */
  dispose(): void {
    window.removeEventListener('resize', this.handleResize);

    if (this.points) {
      this.scene.remove(this.points);
    }

    this.geometry?.dispose();
    this.material?.dispose();
    this.renderer.dispose();

    // Remove canvas element
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    this.meshPoints = [];
    this.ripples = [];
  }
}
