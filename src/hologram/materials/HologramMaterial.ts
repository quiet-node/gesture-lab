/**
 * HologramMaterial
 * Custom ShaderMaterial for holographic effects with Fresnel glow and scanlines
 */

import * as THREE from 'three';

/**
 * Configuration for the hologram material
 */
export interface HologramMaterialConfig {
  /** Primary color */
  color: THREE.Color;
  /** Opacity (0-1) */
  opacity: number;
  /** Fresnel power (higher = sharper edge glow) */
  fresnelPower: number;
  /** Scanline frequency */
  scanlineFrequency: number;
  /** Scanline speed */
  scanlineSpeed: number;
  /** Enable scanlines */
  enableScanlines: boolean;
}

const DEFAULT_CONFIG: HologramMaterialConfig = {
  color: new THREE.Color(0x00ffff),
  opacity: 0.6,
  fresnelPower: 2.0,
  scanlineFrequency: 100.0,
  scanlineSpeed: 2.0,
  enableScanlines: true,
};

/**
 * Vertex shader for holographic effect
 */
const vertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    
    gl_Position = projectionMatrix * mvPosition;
  }
`;

/**
 * Fragment shader for holographic effect
 */
const fragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uFresnelPower;
  uniform float uTime;
  uniform float uScanlineFrequency;
  uniform float uScanlineSpeed;
  uniform bool uEnableScanlines;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    // Fresnel effect for edge glow
    vec3 viewDir = normalize(vViewPosition);
    float fresnel = pow(1.0 - abs(dot(viewDir, vNormal)), uFresnelPower);
    
    // Base color with fresnel
    vec3 color = uColor;
    float alpha = uOpacity;
    
    // Add fresnel glow to edges
    color += uColor * fresnel * 0.5;
    alpha += fresnel * 0.3;
    
    // Scanlines effect
    if (uEnableScanlines) {
      float scanline = sin(vWorldPosition.y * uScanlineFrequency + uTime * uScanlineSpeed) * 0.5 + 0.5;
      scanline = smoothstep(0.4, 0.6, scanline);
      alpha *= 0.7 + scanline * 0.3;
    }
    
    // Flickering effect (subtle)
    float flicker = sin(uTime * 30.0) * 0.02 + 1.0;
    alpha *= flicker;
    
    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`;

/**
 * Creates a holographic ShaderMaterial
 */
export function createHologramMaterial(
  config: Partial<HologramMaterialConfig> = {}
): THREE.ShaderMaterial {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return new THREE.ShaderMaterial({
    uniforms: {
      // Clone the color so each material has its own instance
      // This prevents mutation in one material from affecting others
      uColor: { value: finalConfig.color.clone() },
      uOpacity: { value: finalConfig.opacity },
      uFresnelPower: { value: finalConfig.fresnelPower },
      uTime: { value: 0 },
      uScanlineFrequency: { value: finalConfig.scanlineFrequency },
      uScanlineSpeed: { value: finalConfig.scanlineSpeed },
      uEnableScanlines: { value: finalConfig.enableScanlines },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
}

/**
 * Creates a wireframe holographic material (for edges/outlines)
 */
export function createWireframeMaterial(
  color: THREE.Color = new THREE.Color(0x00ffff),
  opacity: number = 0.8
): THREE.LineBasicMaterial {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
  });
}
