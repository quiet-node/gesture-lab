/**
 * Main Entry Point
 * Gesture Lab
 */

import { inject } from '@vercel/analytics';
import { App } from './app';
import './styles/main.css';

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
const container = document.getElementById('app');

if (!container) {
  throw new Error('Container element #app not found');
}

// Check if mobile device
const isMobile = window.innerWidth < 768;

// Create and start application
const app = new App(container, {
  debug: false, // Set to true for debug panel
  particleCount: isMobile ? 8000 : 20000,
});

// Start the application
app.start().catch((error) => {
  console.error('Failed to start application:', error);
});

// Enable keyboard shortcuts
document.addEventListener('keydown', (event) => {
  switch (event.key.toLowerCase()) {
    case 'escape':
      // Clean up on Escape
      app.dispose();
      break;
  }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  app.dispose();
});

// Export for debugging in console
(window as unknown as { app: App }).app = app;
