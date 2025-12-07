/**
 * Nebula Vertex Shader
 * Computes ray origin and direction for volumetric rendering
 */

varying vec3 vOrigin;
varying vec3 vDirection;
varying vec3 vWorldPosition;

uniform vec3 uCameraPosition;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  
  // Calculate ray origin (camera position in object space)
  vOrigin = (inverse(modelMatrix) * vec4(uCameraPosition, 1.0)).xyz;
  
  // Calculate ray direction (from camera to vertex in object space)
  vDirection = position - vOrigin;
  
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
