/**
 * Nebula Fragment Shader
 * Volumetric rendering with Perlin noise for gas/smoke effect
 * Optimized for performance - no complex raymarching
 */

precision highp float;

varying vec3 vOrigin;
varying vec3 vDirection;
varying vec3 vWorldPosition;

uniform float uTime;
uniform float uOpacity;
uniform float uDensity;
uniform vec3 uColor1;  // Inner nebula color (purple)
uniform vec3 uColor2;  // Outer nebula color (teal)
uniform vec3 uColor3;  // Accent color (magenta)

// 3D Simplex noise function for organic cloud patterns
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

// Fractal Brownian Motion for multi-scale detail
float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  
  // 3 octaves for performance (not 5-6 for full quality)
  for(int i = 0; i < 3; i++) {
    value += amplitude * snoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  
  return value;
}

void main() {
  // Normalize ray direction
  vec3 rayDir = normalize(vDirection);
  
  // Simple volumetric approach: sample at current position
  // This avoids expensive raymarching while still creating depth
  vec3 samplePos = vWorldPosition;
  
  // Animated noise for smoke/gas effect
  float timeScale = uTime * 0.05;
  vec3 animatedPos = samplePos * 0.3 + vec3(timeScale * 0.2, timeScale * 0.3, timeScale * 0.15);
  
  // Multi-scale noise for organic cloud appearance
  float noise1 = fbm(animatedPos);
  float noise2 = fbm(animatedPos * 2.1 + vec3(100.0)); // Offset for variation
  float noise3 = fbm(animatedPos * 0.5 + vec3(200.0)); // Large-scale structure
  
  // Combine noise layers
  float density = noise1 * 0.5 + noise2 * 0.3 + noise3 * 0.2;
  
  // Distance from center for radial falloff
  float distFromCenter = length(samplePos);
  float radialFalloff = smoothstep(0.6, 0.1, distFromCenter);
  
  // Apply density control
  density = density * radialFalloff * uDensity;
  density = smoothstep(0.0, 0.5, density);
  
  // Color mixing based on density and position
  vec3 color = mix(uColor1, uColor2, density);
  color = mix(color, uColor3, noise2 * 0.3); // Add accent color variation
  
  // Add brightness variation for depth and visibility
  float brightness = 1.2 + noise1 * 0.4;
  color *= brightness;
  
  // Final opacity with smooth falloff
  float alpha = density * uOpacity * radialFalloff;
  alpha = clamp(alpha, 0.0, 0.9); // Cap at 0.9 to maintain galaxy visibility
  
  // Discard only very transparent fragments for performance
  if (alpha < 0.005) discard;
  
  gl_FragColor = vec4(color, alpha);
}
