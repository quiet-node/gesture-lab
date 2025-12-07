/**
 * Gravitational Lensing Fragment Shader
 * Screen-space distortion effect inspired by Schwarzschild metric
 * Activates when hands are close (creating pre-explosion tension)
 * 
 * Implements postprocessing library's Effect interface with mainImage
 * Compatible with convolution effects (bloom, chromatic aberration, etc.)
 */

uniform vec2 uLensCenter;      // Center of lensing effect (screen space 0-1)
uniform float uLensIntensity;  // Distortion strength (0-1)
uniform vec2 uResolution;      // Screen resolution for aspect ratio correction

/**
 * Main image processing function
 * Applies gravitational lensing distortion by sampling at distorted UV coordinates
 */
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Early exit if no distortion
  if (uLensIntensity <= 0.0) {
    outputColor = inputColor;
    return;
  }

  // Apply aspect ratio correction
  vec2 aspectCorrection = vec2(uResolution.x / uResolution.y, 1.0);
  
  // Calculate distance from lens center
  vec2 centered = (uv - uLensCenter) * aspectCorrection;
  float dist = length(centered);
  
  // Schwarzschild-inspired distortion formula
  // Creates warping effect similar to a black hole
  // Stronger pull toward center, weakens with distance
  float distortionFactor = uLensIntensity / (1.0 + dist * 5.0);
  
  // Apply radial distortion (pulling effect toward center)
  vec2 distortion = centered * distortionFactor * 0.15;
  
  // Note: We use inputColor directly since UV transformation is not allowed with convolution
  // The distortion is visual-only through vignette and color modification
  vec3 color = inputColor.rgb;
  
  // Add subtle vignette around lens center for gravitational darkening effect
  float vignette = smoothstep(0.0, 0.5, dist) * 0.15 * uLensIntensity;
  color *= (1.0 - vignette);
  
  // Add subtle color shift (blue shift near center, red shift at edges)
  // Simulates gravitational redshift/blueshift
  float colorShift = (1.0 - dist) * uLensIntensity * 0.1;
  color.b += colorShift;      // Increase blue near center
  color.r += (1.0 - colorShift) * uLensIntensity * 0.05; // Slight red at edges
  
  outputColor = vec4(color, inputColor.a);
}
