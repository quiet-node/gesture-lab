import { defineConfig } from 'vite';

export default defineConfig({
  // Development server configuration
  server: {
    port: 3000,
    open: true,
    // Required for camera access - HTTPS in development
    // Note: For production, ensure proper HTTPS is configured
    host: true,
  },

  // Asset handling
  assetsInclude: ['**/*.glsl'],

  // Build configuration
  build: {
    target: 'ES2020',
    outDir: 'dist',
    sourcemap: true,
    minify: 'esbuild', // Use esbuild (built-in) instead of terser
    rollupOptions: {
      output: {
        // Chunk splitting for better caching
        manualChunks: {
          three: ['three'],
          mediapipe: ['@mediapipe/tasks-vision'],
        },
      },
    },
  },

  // Optimize dependencies
  optimizeDeps: {
    include: ['three', '@mediapipe/tasks-vision'],
  },

  // Define environment variables
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
});
