# Gesture Lab

A laboratory for fun experiments with movement tracking and interactive visuals.

Live Demo: https://gesturelab.icu

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)
![Three.js](https://img.shields.io/badge/Three.js-0.160-purple)

> [!NOTE]
> **Disclaimer:** This is a fully vibe-coded project by Opus 4.5, Sonnet 4.5, and Gemini 3, and may not follow strict best practices. Use at your own discretion.

## 🛠️ Tech Stack

- [TypeScript](https://www.typescriptlang.org/) - Type-safe development
- [Three.js](https://threejs.org/) - 3D rendering engine
- [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker) - Real-time hand tracking
- [Vite](https://vitejs.dev/) - Next Generation Frontend Tooling

## 🧪 Experiments

### 1. Iron Man Workshop

Inspect and assemble the Iron Man Mk. III armor in a premium, holographic environment.

- **Gestures**: Open palm for exploded view, closed fist to assemble. Pinch to manipulate parts.
- [Design Document](docs/DESIGN-IRON-MAN-WORKSHOP.md)

https://github.com/user-attachments/assets/4b61baac-f71e-478a-bd0a-2509a7c9e2be

### 2. Cosmic Slash

Slice through cosmic objects with lightsaber hands in this high-energy arcade mode.

- **Gestures**: Slash with hands to destroy objects, build combos, and defeat bosses.
- [Design Document](docs/DESIGN-COSMIC-SLASH.md)

https://github.com/user-attachments/assets/6410fd2d-ea70-4f16-8bf9-df84b9cc1e59

### 3. Interactive Galaxy

Manipulate a universe of particles with your hands.

- **Gestures**: Move hands apart/together to resize, pinch for star bursts, close hands for Big Bang.
- [Design Document](docs/DESIGN-INTERACTIVE-GALAXY.md)

https://github.com/user-attachments/assets/70340864-a81a-4012-8bae-8f440271bbf7

### 4. Foggy Mirror

Clear the mist to reveal reality.

- **Gestures**: Wave hands to wipe the fog off the mirror.
- [Design Document](docs/DESIGN-FOGGY-MIRROR.md)

https://github.com/user-attachments/assets/65dfe3ac-6dc1-4339-be15-adaa11671228

### 5. Stellar Wave

Manipulate the fabric of space-time with an elegant, spring-based dot grid.

- **Gestures**:
  - **Cosmic Pulse**: Right hand pinch to trigger ripples.
  - **Force Field**: Left hand pinch for repulsion.
  - **Gravity Well**: Both hands middle pinch for attraction.
  - **Nebula Vortex**: Both hands ring pinch for rotation.
  - **Quasar Surge**: Fist to charge, release for massive burst.
  - **Cosmic Strings**: Both hands pinky pinch to pluck the grid.
- [Design Document](docs/DESIGN-STELLAR-WAVE.md)

### 6. Light Bulb

A physics-based simulation of an incandescent light bulb with realistic cord dynamics and thermal animation.

- **Gestures**:
  - **Rotate**: Pinch to grab and rotate the bulb View.
  - **Toggle**: Pull the cord to switch on/off.
  - **Break**: Aggressive pulls snap the cord (Material Fatigue).
- [Design Document](docs/DESIGN-LIGHT-BULB.md)


https://github.com/user-attachments/assets/3373c54a-1d47-4bad-a508-3b8aca96e399


### 7. Magnetic Clutter

A satisfyingly chaotic digital toy where magnetic balls form clusters and react to energetic repulsion.

- **Gestures**:
  - **Repulse**: Right hand fist to spawn a bright repulsor sphere and kick balls away.
  - **Grab**: Left hand pinch to grab and manipulate individual balls.
- [Design Document](docs/DESIGN-MAGNETIC-CLUTTER.md)

https://github.com/user-attachments/assets/4e17cbdc-5474-4f81-8400-16b7f9376cb0


## 🚀 Quick Start

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Start preview
bun run build && bun preview

# validate build
bun validate-build
```

## 🎮 Controls

- **I**: Switch to Iron Man Workshop Mode
- **C**: Switch to Cosmic Slash Mode
- **G**: Switch to Galaxy Mode
- **F**: Switch to Foggy Mirror Mode
- **S**: Switch to Stellar Wave Mode
- **L**: Switch to Light Bulb Mode
- **K**: Switch to Magnetic Clutter Mode
- **H**: Toggle Hints
- **D**: Toggle Debug Panel
- **Esc**: Stop/Dispose

---

_Vibed by [@quiet_node](https://x.com/quiet_node)_
