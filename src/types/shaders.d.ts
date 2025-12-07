/**
 * Type declarations for shader imports
 * Allows importing .glsl files as raw text strings
 */

declare module '*.glsl?raw' {
  const content: string;
  export default content;
}

declare module '*.vert.glsl?raw' {
  const content: string;
  export default content;
}

declare module '*.frag.glsl?raw' {
  const content: string;
  export default content;
}

declare module '*.glsl' {
  const content: string;
  export default content;
}

declare module '*.vert.glsl' {
  const content: string;
  export default content;
}

declare module '*.frag.glsl' {
  const content: string;
  export default content;
}
