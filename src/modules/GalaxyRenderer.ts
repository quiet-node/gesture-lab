/**
 * GalaxyRenderer Module
 * Creates a STUNNING realistic galaxy with millions of tiny white stars
 * Features: differential rotation (inner stars faster), twinkling, proper spiral arms
 * Designed for dark background with high contrast white/subtle-colored stars
 */

import * as THREE from 'three';
import {
  DEFAULT_GALAXY_CONFIG,
  ExplosionState,
  type GalaxyConfig,
  type GalaxyUniforms,
} from './types/GalaxyTypes';
import { PostProcessingManager } from './PostProcessingManager';
// import { NebulaRenderer } from './NebulaRenderer';

// Vertex shader: differential rotation + turbulence + twinkling + EXPLOSION
const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aDistance;    // Distance from center (0-1 normalized)
  attribute float aBrightness;  // Base brightness
  attribute float aSeed;        // Random seed for variation
  
  uniform float uTime;
  uniform float uScale;
  uniform float uSize;
  uniform float uExplosionState; // 0=normal, 1=imploding, 2=singularity, 3=exploding, 4=fading
  uniform float uExplosionTime;  // Time since explosion started
  
  varying float vBrightness;
  varying float vTemperature;  // For subtle color variation (cool/warm stars)
  varying float vAlpha;
  
  // 3D Simplex noise function for organic turbulence
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    
    vec3 i  = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    
    i = mod289(i);
    vec4 p = permute(permute(permute(
              i.z + vec4(0.0, i1.z, i2.z, 1.0))
            + i.y + vec4(0.0, i1.y, i2.y, 1.0))
            + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    
    vec4 x = x_ *ns.x + ns.yyyy;
    vec4 y = y_ *ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    
    vec4 s0 = floor(b0)*2.0 + 1.0;
    vec4 s1 = floor(b1)*2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    
    vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
    
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    
    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    
    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
  }
  
  void main() {
    vTemperature = aSeed;
    
    // Store original position for rotation calculation
    vec3 pos = position;
    
    // TURBULENCE: Add organic flowing motion using 3D noise
    // Sample noise at different scales for multi-layered turbulence
    float timeScale = uTime * 0.08;
    vec3 noisePos = pos * 0.4 + vec3(timeScale, timeScale * 0.5, 0.0);
    
    // Multi-octave noise for detailed turbulence
    float turbulence1 = snoise(noisePos) * 0.08;
    float turbulence2 = snoise(noisePos * 2.0 + vec3(100.0)) * 0.04;
    float turbulence3 = snoise(noisePos * 4.0 + vec3(200.0)) * 0.02;
    float totalTurbulence = turbulence1 + turbulence2 + turbulence3;
    
    // Apply turbulence as spiral flow (vortex effect)
    float dist2D = length(pos.xz);
    float angle = atan(pos.z, pos.x);
    float turbulentAngle = angle + totalTurbulence * (1.0 - aDistance * 0.5);
    
    // Turbulent offset (stronger near core, creates swirling motion)
    vec3 turbulentOffset = vec3(
      cos(turbulentAngle) * dist2D - pos.x,
      totalTurbulence * 0.3,
      sin(turbulentAngle) * dist2D - pos.z
    ) * 0.15 * (1.0 - aDistance * 0.6);
    
    pos += turbulentOffset;
    
    // DIFFERENTIAL ROTATION: Inner stars orbit faster (like real galaxies)
    // Keplerian-like: angular velocity ~ 1/sqrt(r)
    float orbitalSpeed = 0.15 / (aDistance + 0.12);
    float rotationAngle = uTime * orbitalSpeed;
    
    // Rotate around Y axis (galaxy plane)
    float cosA = cos(rotationAngle);
    float sinA = sin(rotationAngle);
    vec3 rotatedPos = vec3(
      pos.x * cosA - pos.z * sinA,
      pos.y,
      pos.x * sinA + pos.z * cosA
    );
    
    // === BIG BANG EXPLOSION EFFECTS ===
    vec3 explosionPos = rotatedPos;
    float explosionBrightness = 1.0;
    
    if (uExplosionState >= 1.0) {
      // Direction from center to particle
      vec3 centerToParticle = normalize(rotatedPos + vec3(0.001)); // avoid zero
      float distFromCenter = length(rotatedPos);
      
      // IMPLODING (hands closing): particles pulled toward center
      if (uExplosionState >= 1.0 && uExplosionState < 2.0) {
        float implosionStrength = (2.0 - uExplosionState); // 1.0 → 0.0
        explosionPos *= (1.0 - implosionStrength * 0.5); // shrink toward center
        explosionBrightness *= (1.0 + implosionStrength * 0.8); // get brighter
      }
      
      // SINGULARITY (at threshold): vibrating bright point
      if (uExplosionState >= 2.0 && uExplosionState < 3.0) {
        // Intense vibration
        float vibrationFreq = 25.0 + aSeed * 15.0;
        float vibrationAmp = 0.03 * (1.0 + aSeed);
        vec3 vibration = centerToParticle * sin(uExplosionTime * vibrationFreq) * vibrationAmp;
        explosionPos = vec3(0.0) + vibration; // collapse to vibrating point
        explosionBrightness *= 3.0; // extremely bright
      }
      
      // EXPLODING (Big Bang!): particles shoot outward
      if (uExplosionState >= 3.0 && uExplosionState < 4.0) {
        float explosionSpeed = 8.0 + aSeed * 8.0; // vary speed per particle
        float explosionProgress = uExplosionTime; // 0→∞ seconds
        
        // Deceleration over time (v = v0 * decay)
        float decayFactor = 0.25;
        float velocity = explosionSpeed * exp(-decayFactor * explosionProgress);
        
        // Radial explosion offset
        vec3 explosionOffset = centerToParticle * velocity * explosionProgress;
        explosionPos = vec3(0.0) + explosionOffset;
        
        // Brightness fades as particles disperse
        explosionBrightness *= max(0.2, 1.0 - explosionProgress * 0.4);
      }
      
      // FADING: drifting and disappearing
      if (uExplosionState >= 4.0) {
        float fadeSpeed = 3.0 + aSeed * 4.0;
        float fadeProgress = uExplosionTime;
        
        // Slow drift outward
        vec3 driftOffset = centerToParticle * fadeSpeed * fadeProgress * 0.3;
        explosionPos = vec3(0.0) + driftOffset;
        
        // Exponential fade to zero
        float fadeOut = exp(-fadeProgress * 1.5);
        explosionBrightness *= fadeOut;
        vAlpha *= fadeOut;
      }
    }
    
    // Apply scale
    vec3 scaledPos = explosionPos * uScale;
    
    vec4 mvPosition = modelViewMatrix * vec4(scaledPos, 1.0);
    
    // TWINKLING: Dramatic brightness variation for sparkling stars
    float twinkleSpeed = 1.5 + aSeed * 5.0;
    float twinklePhase = aSeed * 6.28318;
    float twinkle = 0.4 + 0.6 * sin(uTime * twinkleSpeed + twinklePhase);
    
    // Add secondary slower twinkle for more complex animation
    float slowTwinkle = 0.8 + 0.2 * sin(uTime * 0.5 + aSeed * 3.14159);
    twinkle *= slowTwinkle;
    
    // Brightness based on distance (brighter at center) + twinkle + explosion
    vBrightness = aBrightness * twinkle * 2.5 * explosionBrightness;
    
    // Alpha for depth fade
    vAlpha = 1.0 - aDistance * 0.2;
    
    // Size: MICRO-TINY stars for 2 MILLION particle density
    float perspectiveSize = aSize * uSize * (200.0 / -mvPosition.z);
    gl_PointSize = perspectiveSize * uScale * (0.65 + twinkle * 0.25);
    gl_PointSize = clamp(gl_PointSize, 0.25, 2.5); // MICRO-stars for 2M density!
    
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// Fragment shader: VIBRANT COSMIC COLOR PALETTE
const fragmentShader = /* glsl */ `
  varying float vBrightness;
  varying float vTemperature;
  varying float vAlpha;
  
  void main() {
    // Circular point with soft gaussian-like falloff
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    
    // Discard outside circle
    if (dist > 0.5) discard;
    
    // ULTRA INTENSE GLOW: Maximum brightness for brilliant stars
    float alpha = exp(-dist * dist * 7.0);
    
    // Extra POWERFUL halo for maximum luminous glow
    float halo = exp(-dist * 2.0) * 0.6;
    alpha = alpha + halo;
    
    // Apply brightness and depth alpha with BOOST
    alpha *= vBrightness * vAlpha * 1.3; // Strong brightness boost!
    
    // Discard very faint pixels
    if (alpha < 0.015) discard;
    
    // COLOR: VIBRANT COSMIC PALETTE based on temperature and brightness
    // Create dramatic color variation for maximum wow factor
    vec3 starColor;
    
    // Map vTemperature (0-1 from aSeed) to cosmic colors
    if (vTemperature < 0.25) {
      // Hot blue-white stars (O/B type)
      starColor = mix(
        vec3(0.7, 0.85, 1.0),  // Bright cyan-blue
        vec3(0.85, 0.92, 1.0), // Blue-white
        vTemperature * 4.0
      );
    } else if (vTemperature < 0.5) {
      // Purple-magenta stars
      starColor = mix(
        vec3(0.85, 0.7, 1.0),  // Light purple
        vec3(1.0, 0.6, 1.0),   // Bright magenta
        (vTemperature - 0.25) * 4.0
      );
    } else if (vTemperature < 0.75) {
      // Cyan-teal stars
      starColor = mix(
        vec3(0.6, 1.0, 1.0),   // Bright cyan
        vec3(0.7, 0.95, 1.0),  // Cyan-white
        (vTemperature - 0.5) * 4.0
      );
    } else {
      // Violet-blue stars
      starColor = mix(
        vec3(0.75, 0.8, 1.0),  // Pale blue
        vec3(0.8, 0.7, 1.0),   // Violet
        (vTemperature - 0.75) * 4.0
      );
    }
    
    // Boost color saturation for vibrant cosmic look
    vec3 white = vec3(1.0);
    starColor = mix(white, starColor, 0.7); // 70% color, 30% white for luminosity
    
    // Brightest stars get extra white glow (HDR-like effect)
    if (vBrightness > 0.85) {
      starColor = mix(starColor, white, (vBrightness - 0.85) / 0.15 * 0.4);
    }
    
    // Boost brightness for ULTRA-BRILLIANT stars
    starColor *= (1.0 + vBrightness * 0.5);
    
    gl_FragColor = vec4(starColor, alpha);
  }
`;

/**
 * GalaxyRenderer - Renders a stunning animated spiral galaxy
 */
export class GalaxyRenderer {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private postProcessing: PostProcessingManager | null = null;
  private galaxy: THREE.Points | null = null;
  private geometry: THREE.BufferGeometry | null = null;
  private material: THREE.ShaderMaterial | null = null;
  private uniforms: GalaxyUniforms;
  private config: GalaxyConfig;
  private container: HTMLElement;
  private animationId: number | null = null;

  // Hand distance tracking for gravitational lensing
  private currentHandDistance: number = 1.0;

  // Explosion state tracking
  private explosionState: ExplosionState = ExplosionState.NORMAL;
  private explosionStartTime: number = 0;
  private explosionInitialScale: number = 1.0; // Capture scale when explosion triggers
  private singularityDuration: number = 0.2; // seconds to hold singularity (auto-trigger)
  private explosionDuration: number = 2.0; // seconds for explosion phase
  private fadeDuration: number = 2.5; // seconds to fade away

  constructor(container: HTMLElement, config: Partial<GalaxyConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_GALAXY_CONFIG, ...config };

    // Initialize uniforms
    this.uniforms = {
      uTime: { value: 0 },
      uScale: { value: 0 },
      uSize: { value: this.config.particleSize },
      uExplosionState: { value: 0 }, // ExplosionState.NORMAL
      uExplosionTime: { value: 0 },
    };

    // Create Three.js scene
    this.scene = new THREE.Scene();

    // Create camera (closer for bigger galaxy appearance)
    this.camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.z = 6; // Closer (was 8) for bigger galaxy

    // Create WebGL renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Transparent background for video overlay
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    // Position canvas for overlay
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.pointerEvents = 'none';

    // Handle resize
    window.addEventListener('resize', this.handleResize.bind(this));
  }

  /**
   * Initialize and generate the galaxy particles
   */
  initialize(): void {
    this.generateGalaxy();

    // Initialize post-processing (Phase 1 enhancement)
    this.postProcessing = new PostProcessingManager(
      this.renderer,
      this.scene,
      this.camera,
      {
        enableBloom: true,
        bloomIntensity: 1.5,
        bloomLuminanceThreshold: 0.4,
        bloomRadius: 0.8,
        enableChromaticAberration: true,
        chromaticAberrationOffset: 0.001,
        enableColorGrading: true,
        colorGradingIntensity: 0.8,
        enableGravitationalLensing: true,
      }
    );
  }

  /**
   * Generate galaxy particle geometry - REALISTIC SPIRAL with white stars
   */
  private generateGalaxy(): void {
    // Clean up previous galaxy if exists
    if (this.galaxy) {
      this.scene.remove(this.galaxy);
      this.geometry?.dispose();
      this.material?.dispose();
    }

    const { particleCount, radius, randomness } = this.config;

    // Create geometry
    this.geometry = new THREE.BufferGeometry();

    // Total particles = bright core (20%) + core halo (15%) + arms (65%)
    const coreParticles = Math.floor(particleCount * 0.2);
    const coreHaloParticles = Math.floor(particleCount * 0.15);
    const armParticles = particleCount - coreParticles - coreHaloParticles;
    const totalParticles = particleCount;

    // Create typed arrays for attributes
    const positions = new Float32Array(totalParticles * 3);
    const sizes = new Float32Array(totalParticles);
    const distances = new Float32Array(totalParticles); // normalized 0-1
    const brightnesses = new Float32Array(totalParticles);
    const seeds = new Float32Array(totalParticles); // for randomness

    let particleIndex = 0;

    // === GENERATE CLASSIC LOGARITHMIC SPIRAL ===
    for (let i = 0; i < armParticles; i++) {
      const i3 = particleIndex * 3;

      // Radial distribution: STRONGER exponential concentration (r^0.25 for denser inner regions)
      const radiusRatio = Math.pow(Math.random(), 0.25);
      const r = radiusRatio * radius;

      // CIRCULAR RINGS: Perfectly round, evenly spaced
      const angle = Math.random() * Math.PI * 2;

      // Simple radial scatter for natural appearance
      const baseRadialScatter =
        (Math.random() - 0.5) * randomness * 0.05 * radiusRatio;
      const finalRadius = r + baseRadialScatter;

      // Position on circular ring
      const x = Math.cos(angle) * finalRadius;
      const z = Math.sin(angle) * finalRadius;

      // ULTRA-FLAT PLANAR disk: minimal vertical scatter for classic 2D spiral
      const diskThickness = 0.02 * (1.0 - radiusRatio * 0.9); // Nearly flat
      const y = (Math.random() - 0.5) * diskThickness;

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      // UNIFORM SIZE: tiny particles (size variation comes from density, not individual size)
      const uniformSize = 0.25 + Math.random() * 0.6; // Very small, mostly uniform
      sizes[particleIndex] = uniformSize;

      // Distance (normalized 0-1)
      distances[particleIndex] = radiusRatio;

      // Brightness: STRONG BOOST for inner regions, especially around core
      const innerBoost = radiusRatio < 0.3 ? 1.8 : 1.0; // Extra bright within 30% of radius
      const densityBrightness = (1.0 - radiusRatio * 0.3) * innerBoost; // Less falloff + inner boost
      const variation = 0.95 + Math.random() * 0.25; // Very high base brightness
      brightnesses[particleIndex] = densityBrightness * variation;

      // Random seed for animation
      seeds[particleIndex] = Math.random();

      particleIndex++;
    }

    // === GENERATE DENSE CORE/BULGE ===
    for (let i = 0; i < coreParticles; i++) {
      const i3 = particleIndex * 3;

      // ULTRA-DENSE CORE: very tight packing (0.12 radius) for glowing luminous nucleus
      const coreRadius = Math.pow(Math.random(), 1.0) * radius * 0.12;
      const angle = Math.random() * Math.PI * 2;

      const x = Math.cos(angle) * coreRadius;
      const z = Math.sin(angle) * coreRadius;

      // Nearly zero vertical scatter in core (perfect planar nucleus)
      const y = (Math.random() - 0.5) * 0.015;

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      // Core: UNIFORM TINY stars with MAXIMUM brightness (glowing nucleus)
      sizes[particleIndex] = 0.4 + Math.random() * 0.5; // Small uniform
      distances[particleIndex] = coreRadius / radius;
      brightnesses[particleIndex] = 0.95 + Math.random() * 0.05; // Maximum brightness
      seeds[particleIndex] = Math.random();

      particleIndex++;
    }

    // === GENERATE CORE HALO (transition zone around dense core) ===
    for (let i = 0; i < coreHaloParticles; i++) {
      const i3 = particleIndex * 3;

      // Core halo: 0.12 to 0.25 radius (just outside ultra-dense core)
      const haloRadiusRatio = 0.12 + Math.pow(Math.random(), 0.8) * 0.13;
      const haloRadius = haloRadiusRatio * radius;
      const angle = Math.random() * Math.PI * 2;

      const x = Math.cos(angle) * haloRadius;
      const z = Math.sin(angle) * haloRadius;

      // Slightly more vertical scatter than core, but still very flat
      const y = (Math.random() - 0.5) * 0.025;

      positions[i3] = x;
      positions[i3 + 1] = y;
      positions[i3 + 2] = z;

      // Halo: bright stars, slightly smaller than core
      sizes[particleIndex] = 0.35 + Math.random() * 0.4;
      distances[particleIndex] = haloRadiusRatio;
      // High brightness (0.8-0.95) to visually connect to core
      brightnesses[particleIndex] = 0.8 + Math.random() * 0.15;
      seeds[particleIndex] = Math.random();

      particleIndex++;
    }

    // Set geometry attributes
    this.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3)
    );
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute(
      'aDistance',
      new THREE.BufferAttribute(distances, 1)
    );
    this.geometry.setAttribute(
      'aBrightness',
      new THREE.BufferAttribute(brightnesses, 1)
    );
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    // Create shader material
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      blending: THREE.AdditiveBlending, // Stars glow and add together
      depthWrite: false,
    });

    // Create Points mesh
    this.galaxy = new THREE.Points(this.geometry, this.material);
    this.galaxy.visible = false; // Start hidden
    this.scene.add(this.galaxy);
  }

  /**
   * Set galaxy scale (0-1)
   */
  setScale(scale: number): void {
    this.uniforms.uScale.value = Math.max(0, Math.min(1, scale));
  }

  /**
   * Set galaxy position in 3D space
   */
  setPosition(x: number, y: number, z: number): void {
    if (this.galaxy) {
      this.galaxy.position.set(x, y, z);
    }
  }

  /**
   * Set galaxy rotation using Euler angles
   */
  setRotation(euler: THREE.Euler): void {
    if (this.galaxy) {
      this.galaxy.rotation.copy(euler);
    }
  }

  /**
   * Set galaxy visibility
   */
  setVisible(visible: boolean): void {
    if (this.galaxy) {
      this.galaxy.visible = visible;
    }
  }

  /**
   * Check if galaxy is currently visible
   */
  isVisible(): boolean {
    return this.galaxy?.visible ?? false;
  }

  /**
   * Set current hand distance for gravitational lensing effect
   * Called by HandGalaxyController with normalized distance (0-1)
   */
  setHandDistance(distance: number): void {
    this.currentHandDistance = distance;
  }

  /**
   * Update gravitational lensing effect based on hand distance
   * Activates when hands are very close (0.06-0.08 range per design)
   * @private
   */
  private updateGravitationalLensing(): void {
    const lensingEffect = this.postProcessing?.getGravitationalLensingEffect();
    if (!lensingEffect) return;

    // Lensing activation range (per DESIGN-v2.md Phase 2.2)
    const minDistance = 0.06; // Below this: explosion triggers
    const maxDistance = 0.08; // Above this: no lensing

    let intensity = 0.0;

    if (
      this.currentHandDistance >= minDistance &&
      this.currentHandDistance <= maxDistance
    ) {
      // Map distance to intensity (closer hands = stronger lensing)
      const normalizedDist =
        (this.currentHandDistance - minDistance) / (maxDistance - minDistance);
      intensity = 1.0 - normalizedDist; // Invert: close = 1.0, far = 0.0
    }

    lensingEffect.setIntensity(intensity);

    // Set lens center to screen center (where galaxy appears)
    lensingEffect.setLensCenter(new THREE.Vector2(0.5, 0.5));
  }

  /**
   * Update animation time
   */
  updateTime(deltaTime: number): void {
    this.uniforms.uTime.value += deltaTime;

    // Update explosion state machine
    const currentTime = performance.now() / 1000;
    this.updateExplosion(currentTime);
  }

  /**
   * Render the scene
   */
  render(): void {
    const currentTime = performance.now() / 1000;
    this.updateExplosion(currentTime);

    // Update gravitational lensing based on hand distance
    this.updateGravitationalLensing();

    // Use post-processing if available, otherwise fallback to standard render
    if (this.postProcessing) {
      this.postProcessing.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Handle window resize
   */
  private handleResize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);

    // Resize post-processing composer
    if (this.postProcessing) {
      this.postProcessing.resize(width, height);

      // Update gravitational lensing resolution
      const lensingEffect = this.postProcessing.getGravitationalLensingEffect();
      if (lensingEffect) {
        lensingEffect.setResolution(
          this.renderer.domElement.width,
          this.renderer.domElement.height
        );
      }
    }
  }

  /**
   * Update particle count (regenerates galaxy)
   */
  setParticleCount(count: number): void {
    this.config.particleCount = count;
    this.generateGalaxy();
  }

  /**
   * Get current scale value
   */
  getScale(): number {
    return this.uniforms.uScale.value;
  }

  /**
   * Get the Three.js scene
   * Used by HandGalaxyController to initialize Phase 3 effects
   */
  getScene(): THREE.Scene {
    return this.scene;
  }

  /**
   * Get the Three.js camera
   * Used by HandGalaxyController to initialize Phase 3 effects
   */
  getCamera(): THREE.Camera {
    return this.camera;
  }

  /**
   * Trigger Big Bang explosion effect
   */
  triggerExplosion(): void {
    if (
      this.explosionState === ExplosionState.NORMAL ||
      this.explosionState === ExplosionState.IMPLODING
    ) {
      console.log('[GalaxyRenderer] Big Bang explosion triggered!');

      // Capture current scale for smooth collapse animation
      this.explosionInitialScale = this.uniforms.uScale.value;

      // Ensure galaxy is visible
      this.setVisible(true);

      this.explosionState = ExplosionState.SINGULARITY;
      this.explosionStartTime = performance.now() / 1000;
      this.uniforms.uExplosionState.value = ExplosionState.SINGULARITY;
      this.uniforms.uExplosionTime.value = 0;
    }
  }

  /**
   * Reset explosion state back to normal
   */
  resetExplosion(): void {
    this.explosionState = ExplosionState.NORMAL;
    this.explosionStartTime = 0;
    this.uniforms.uExplosionState.value = ExplosionState.NORMAL;
    this.uniforms.uExplosionTime.value = 0;
  }

  /**
   * Update explosion state machine (call every frame)
   */
  updateExplosion(currentTime: number): void {
    if (this.explosionState === ExplosionState.NORMAL) {
      return;
    }

    const explosionElapsed = currentTime - this.explosionStartTime;
    this.uniforms.uExplosionTime.value = explosionElapsed;

    // State transitions
    switch (this.explosionState) {
      case ExplosionState.SINGULARITY:
        // Animate scale from initial value to 0 for smooth collapse
        const collapseProgress = Math.min(
          explosionElapsed / this.singularityDuration,
          1.0
        );
        const currentScale =
          this.explosionInitialScale * (1.0 - collapseProgress);
        this.setScale(currentScale);

        if (explosionElapsed >= this.singularityDuration) {
          console.log('[GalaxyRenderer] BOOM! Explosion started');
          this.explosionState = ExplosionState.EXPLODING;
          this.uniforms.uExplosionState.value = ExplosionState.EXPLODING;
          this.explosionStartTime = currentTime; // reset timer for explosion phase
          this.uniforms.uExplosionTime.value = 0;
        }
        break;

      case ExplosionState.EXPLODING:
        // Animate scale from 0 to larger for visual expansion
        const explosionProgress = Math.min(
          explosionElapsed / this.explosionDuration,
          1.0
        );
        // Expand from 0 to 3.0 (3x larger for dramatic effect)
        this.setScale(explosionProgress * 3.0);

        if (explosionElapsed >= this.explosionDuration) {
          console.log('[GalaxyRenderer] Explosion fading...');
          this.explosionState = ExplosionState.FADING;
          this.uniforms.uExplosionState.value = ExplosionState.FADING;
          this.explosionStartTime = currentTime; // reset timer for fade phase
          this.uniforms.uExplosionTime.value = 0;
        }
        break;

      case ExplosionState.FADING:
        if (explosionElapsed >= this.fadeDuration) {
          console.log('[GalaxyRenderer] Explosion complete, clearing screen');
          this.setVisible(false); // Hide galaxy for clean screen
          this.resetExplosion();
        }
        break;
    }
  }

  /**
   * Get current explosion state
   */
  getExplosionState(): ExplosionState {
    return this.explosionState;
  }

  /**
   * Clean up all resources
   */
  dispose(): void {
    // Remove resize listener
    window.removeEventListener('resize', this.handleResize.bind(this));

    // Cancel any pending animation
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }

    // Dispose post-processing
    if (this.postProcessing) {
      this.postProcessing.dispose();
      this.postProcessing = null;
    }

    // Dispose Three.js objects
    this.geometry?.dispose();
    this.material?.dispose();
    this.renderer.dispose();

    // Remove canvas from DOM
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    console.log('[GalaxyRenderer] Disposed');
  }
}
