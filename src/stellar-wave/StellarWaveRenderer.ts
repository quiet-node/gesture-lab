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
  type MeshPoint,
  type RippleState,
  type StellarWaveConfig,
} from './types';

/**
 * Vertex shader for dot rendering
 * Handles position and size based on ripple intensity
 */
const vertexShader = /* glsl */ `
  attribute float aRippleIntensity;
  
  varying float vRippleIntensity;
  
  uniform float uNormalSize;
  uniform float uRippleSize;
  
  void main() {
    vRippleIntensity = aRippleIntensity;
    
    // Size interpolation based on ripple intensity
    float size = mix(uNormalSize, uRippleSize, step(0.01, aRippleIntensity));
    gl_PointSize = size * 2.0; // Diameter
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader for dot rendering
 * Implements HSL color transition for ripple effect (cyan → orange)
 */
const fragmentShader = /* glsl */ `
  varying float vRippleIntensity;
  
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
    
    if (vRippleIntensity > 0.01) {
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

  // Grid state
  private meshPoints: MeshPoint[] = [];

  // Ripple tracking
  private ripples: RippleState[] = [];
  private animationTime: number = 0;

  // Position and intensity buffers (for GPU updates)
  private positionAttribute: THREE.BufferAttribute | null = null;
  private rippleIntensityAttribute: THREE.BufferAttribute | null = null;

  constructor(container: HTMLElement, config: Partial<StellarWaveConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_STELLAR_WAVE_CONFIG, ...config };

    // Initialize uniforms
    this.uniforms = {
      uNormalSize: { value: this.config.normalDotRadius },
      uRippleSize: { value: this.config.rippleDotRadius },
    };

    // Create Three.js scene
    this.scene = new THREE.Scene();

    // Create orthographic camera matching viewport (pixel coordinates)
    const width = container.clientWidth;
    const height = container.clientHeight;
    this.camera = new THREE.OrthographicCamera(0, width, 0, height, 0.1, 10);
    this.camera.position.z = 1;

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

    // Fill initial positions
    for (let i = 0; i < count; i++) {
      const point = this.meshPoints[i];
      positions[i * 3] = point.position.x;
      positions[i * 3 + 1] = point.position.y;
      positions[i * 3 + 2] = 0;
      rippleIntensities[i] = point.rippleIntensity;
    }

    // Create geometry
    this.geometry = new THREE.BufferGeometry();
    this.positionAttribute = new THREE.BufferAttribute(positions, 3);
    this.rippleIntensityAttribute = new THREE.BufferAttribute(rippleIntensities, 1);

    this.geometry.setAttribute('position', this.positionAttribute);
    this.geometry.setAttribute('aRippleIntensity', this.rippleIntensityAttribute);

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
   * Trigger a ripple effect at the specified screen coordinates
   * @param x - X position in normalized coordinates (0-1)
   * @param y - Y position in normalized coordinates (0-1)
   */
  triggerRipple(x: number, y: number): void {
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
   * Update physics simulation and ripple propagation
   * @param deltaTime - Time elapsed since last frame in seconds
   */
  update(deltaTime: number): void {
    this.animationTime += deltaTime;

    // Update ripple effects
    this.updateRipples();

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
   * Update spring physics for all non-pinned points
   */
  private updatePhysics(): void {
    const { stiffness, damping } = this.config;

    for (const point of this.meshPoints) {
      if (point.pinned) continue;

      // Spring force toward rest position
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
  }

  /**
   * Sync CPU mesh state to GPU buffer attributes
   */
  private syncBuffers(): void {
    if (!this.positionAttribute || !this.rippleIntensityAttribute) return;

    const positions = this.positionAttribute.array as Float32Array;
    const intensities = this.rippleIntensityAttribute.array as Float32Array;

    for (let i = 0; i < this.meshPoints.length; i++) {
      const point = this.meshPoints[i];
      positions[i * 3] = point.position.x;
      positions[i * 3 + 1] = point.position.y;
      intensities[i] = point.rippleIntensity;
    }

    this.positionAttribute.needsUpdate = true;
    this.rippleIntensityAttribute.needsUpdate = true;
  }

  /**
   * Render the scene
   */
  render(): void {
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
