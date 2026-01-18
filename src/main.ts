/**
 * Main Entry Point
 * Gesture Lab
 */

import { inject } from '@vercel/analytics';
import { App } from './app';
import './styles/main.css';
import './styles/trust-badge.css';

// Import fonts
import '@fontsource/nunito/200.css';
import '@fontsource/nunito/300.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/700.css';

// Initialize Vercel Analytics for deployment tracking
inject();

// Get or create container
const containerElement = document.getElementById('app');

if (!containerElement) {
  throw new Error('Container element #app not found');
}

// Guaranteed non-null after the check above
const container: HTMLElement = containerElement;

// Check if mobile device
const isMobile = window.innerWidth < 768;

// Store app instance globally for HMR cleanup
let app: App | null = null;

// Cleanup function for HMR
function cleanup() {
  if (app) {
    console.log('[Main] Cleaning up previous app instance...');
    app.dispose();
    app = null;
  }
}

// Create and start application
function initApp() {
  // Cleanup any existing instance first
  cleanup();

  app = new App(container, {
    debug: false, // Set to true for debug panel
    particleCount: isMobile ? 8000 : 20000,
  });

  // Start the application
  app.start().catch((error) => {
    console.error('Failed to start application:', error);
  });

  return app;
}

// Initialize the app
initApp();

// Enable keyboard shortcuts
document.addEventListener('keydown', (event) => {
  switch (event.key.toLowerCase()) {
    case 'escape':
      // Clean up on Escape
      app?.dispose();
      break;
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  app?.dispose();
});

// Vite HMR support - critical for preventing MediaPipe WASM OOM errors
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    console.log('[HMR] Disposing app before hot reload...');
    cleanup();
  });

  import.meta.hot.accept(() => {
    console.log('[HMR] Reinitializing app after hot reload...');
    // The module will be re-executed, which calls initApp()
  });
}

// Export for debugging in console
(window as unknown as { app: App | null }).app = app;
