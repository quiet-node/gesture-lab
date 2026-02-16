# Voxel Builder — Technical Design & Educational Wiki

> **Status**: Implemented (v1.0)
> **Module**: `src/voxel-builder`

This document serves as both a **technical specification** for the Voxel Builder module and an **educational wiki** explaining the underlying Computer Graphics and Computer Vision concepts. It assumes **zero prior knowledge** of 3D programming.

---

## 1. Introduction: What is this?

The **Voxel Builder** is a "Spatial Computing" application. This means it treats the empty air in front of your computer screen as a canvas.

- **Voxel**: Short for **Vo**lumetric **Pi**xel. Just as a 2D image is made of squares called pixels, a 3D digital object is made of cubes called voxels. (Think: _Minecraft_ blocks).
- **Computer Vision**: The ability of a computer to "see" and understand images. We use this to track your hands.
- **WebGL**: A technology that lets web browsers draw high-performance 3D graphics using your computer's Graphics Processing Unit (GPU).

**The Goal**: To let you sculpt 3D objects with your bare hands, as if you were molding digital clay.

---

## 2. System Architecture (The "Brain")

The code maps physical hand movements to digital actions. It follows a pattern called **MVC** (Model-View-Controller).

### 2.1 The Data Model (`VoxelGrid`)

- **Concept**: A 3D infinite checkerboard.
- **How it works**: We don't store "empty" air. We only store the cubes that exist. This is called a **Sparse Data Structure**.
- **Implementation**: We use a `Set` (a list of unique items) containing strings like `"5,10,-3"`. This means "There is a block at X=5, Y=10, Z=-3".
  - **Why?**: Checking if a block exists is instant ($O(1)$ complexity). We don't need to search through a million items; we just calculate the hash of the string and look it up directly.

### 2.2 The View (`VoxelRenderer`)

- **Concept**: The visual output.
- **Technology**: **Three.js** (a library that makes WebGL easier).
- **Role**: It takes the list of blocks and draws them on the screen 60 times per second.

### 2.3 The Controller (`VoxelController`)

- **Concept**: The conductor of the orchestra.
- **Role**:
  1.  Get hand positions from the **Hand Tracker**.
  2.  Decide "Is the user pinching? making a fist?".
  3.  Update the **Data Model** (add/remove blocks).
  4.  Tell the **View** to update the screen.

---

## 3. Rendering Techniques (How we draw it)

Drawing 3D objects is computationally expensive. If we drew 1,000 separate cubes, the computer would choke. We use advanced optimization techniques.

### 3.1 Instanced Rendering (`THREE.InstancedMesh`)

- **The Problem**: Telling the GPU "Draw a cube" takes time (CPU Overhead). Doing it 1,000 times per frame causes lag.
- **The Solution**: We tell the GPU: "Here is the shape of a cube. Here is a list of 1,000 positions. Draw them all at once."
- **Analogy**: Instead of a teacher (CPU) handing out 1,000 sheets of paper one by one, they put a stack of 1,000 sheets on the desk and say "Take these."
- **Result**: We can draw thousands of blocks with the performance cost of drawing just _one_.

### 3.2 Lighting (How we see it)

3D objects need light to look 3D. Without light, a cube looks like a flat hexagon. We use a **Three-Point Lighting Setup**, a standard technique from photography and cinema.

1.  **Key Light** (`THREE.DirectionalLight`):
    - **What is it?**: A light that shines from a specific direction, like the sun. Rays are parallel.
    - **Role**: The main light source. It's bright, white, and casts the primary shadows.
    - **Settings**: White color, High intensity (1.2), placed top-right.
2.  **Fill Light** (`THREE.DirectionalLight`):
    - **What is it?**: A secondary, dimmer light from the opposite side.
    - **Role**: It "fills in" the shadows created by the Key Light. Without it, the shadowed side of the cube would be pitch black. We use a **Blue-Violet** color to give a "cyberpunk" or "scientific" atmosphere.
3.  **Ambient Light** (`THREE.AmbientLight`):
    - **What is it?**: A light that comes from _everywhere_ equally. It has no direction.
    - **Role**: Raises the base brightness level of the whole scene.

### 3.3 Tone Mapping (The "Film Look")

- **Concept**: Computer screens have a limited range of brightness (Standard Dynamic Range). Real light has an infinite ranges (High Dynamic Range).
- **Technique**: **ACES Filmic Tone Mapping**.
- **What it does**: It takes "super bright" values (like the brightness of the sun) and squashes them down so they fit on your screen without looking completely "blown out" (white). It mimics how physical film cameras capture light, creating a cinematic, high-contrast look.

---

## 4. Interaction Logic (How you control it)

### 4.1 Coordinate Spaces (The "Turntable" Problem)

Imagine you have a clay sculpture on a lazy susan (rotating table).

- **World Space**: The room you are standing in. "Forward" is toward the window.
- **Local Space**: The sculpture itself. If you rotate the table 90 degrees, "Forward" relative to the sculpture is now "Left" relative to the room.

**The Challenge**: The camera (your eyes) sees **World Space**. Your hands move in **World Space**. But we want to add a block to the _back_ of the sculpture, which is currently rotated to face you.

**The Solution**: **Inverse Quaternions**.

1.  **Quaternion**: A complex 4D number system used to represent rotation without errors (like "Gimbal Lock").
2.  **The Math**:
    $$ Position*{local} = Position*{world} \times Rotation\_{inverse} $$
3.  **Meaning**: We mathematically "un-rotate" your hand position to find out where it lands on the original sculpture grid. This allows you to sculpt naturally from any angle.

### 4.2 Depth Estimation (Reaching into the screen)

Webcams are 2D sensors. They produce a flat image. They don't know how far away your hand is.

- **The Trick**: **Perspective Scale**.
- **Logic**: Things look smaller when they are far away.
- **Algorithm**:
  1.  Measure the distance between your **Wrist** and your **Middle Finger Knuckle** in the camera image.
  2.  If that distance gets _smaller_, we assume your hand is moving _away_ from the camera (deeper into the screen).
  3.  If it gets _larger_, you are moving _closer_.
- **Result**: We create a "Virtual Z-Axis" that lets you reach behind foreground blocks.

### 4.3 Gestures

We use geometric rules to detect intent:

- **Pinch**: Is the distance between Thumb Tip and Index Tip < 2cm? -> **Draw**.
- **Fist**: Are all fingertips close to the wrist? -> **Erase Mode**.
- **Pinky Pinch**: Is Thumb touching Pinky? -> **Cycle Color Palette**.

### 4.4 The Feedback Loop (Ghost Box & Placement)

How does a "Ghost" become a real block?

#### 1. The Ghost Box (Preview)

- **What is it?**: A semi-transparent, holographic cube that follows your hand.
- \*\*Why??: Depth perception on a 2D screen is difficult. You might think you are aiming at $(0,0,0)$ but actually be at $(0,0,5)$. The Ghost shows you exactly where the computer _thinks_ you are pointing.
- **Snapping**: The Ghost always jumps to the nearest integer coordinate. If your hand is at `X=5.7`, the Ghost snaps to `X=6`. This ensures all blocks align perfectly.

#### 2. "Locking It In" (Placement) & Spacing Rules

- **Trigger 1 (Start)**: When you first pinch (`STARTED`), we place a block immediately at the Ghost's location.
- **Trigger 2 (Drag)**: As you move your hand (`ACTIVE`), we don't just spray blocks like a firehose. We measure the distance from the _last_ block you placed.
- **The Rule**: You must move your hand at least **One Voxel Width** (0.45 units) to spawn the next block.
- **Result**: This creates a clean, continuous line of blocks (like a beaded necklace) rather than a messy clump of overlapping cubes.
- **Collision**: The system also checks: "Is there already a block here?" If yes, it does nothing. This prevents z-fighting (flickering graphics).

#### 3. Deletion (Erase Mode)

- **The Switch**: When you hold a **Left Fist**, the controller enters "Destructive Mode".
- **Visual Cue**: The Ghost Box turns **RED** (`0xff0000`) to warn you.
- **Mechanism**: If you pinch now, instead of creating a box, the system looks up the grid index (`"5,2,3"`).
- **Swap-and-Pop**: To remove it efficiently:
  1.  We find the box you want to kill.
  2.  We take the _very last_ box in the memory list and move it into the empty spot.
  3.  We shrink the list size by 1.
  4.  _Analogy_: Imagine a bookshelf. Instead of sliding every book over to fill a gap (slow), you just take the book from the very end of the shelf and plug the hole (fast).

---

## 5. Technical Glossary for Beginners

| Term          | Definition                                                                 | Used In                      |
| :------------ | :------------------------------------------------------------------------- | :--------------------------- |
| **Material**  | Defines how surface looks (shiny, rough, metallic).                        | `THREE.MeshStandardMaterial` |
| **Roughness** | How microscopic bumps scatter light. 0 = Mirror, 1 = Matte.                | Voxel appearance             |
| **Metalness** | How much the object reflects its environment.                              | Voxel appearance             |
| **FPS**       | Frames Per Second. 60 is smooth; 30 is playable.                           | Performance Monitoring       |
| **Matrix4**   | A 4x4 grid of numbers that encodes Position, Rotation, and Scale combined. | Instanced Rendering          |
| **Lerp**      | "Linear Interpolation". Smoothly blending from value A to B.               | Smooth rotation              |

---

## 6. Future Roadmap

1.  **Serialization**: Saving your sculpture to a file (JSON) so you can load it later.
2.  **Marching Cubes**: An algorithm that "smooths" the blocky voxels into organic shapes (like real clay).
3.  **Physics**: Adding gravity so blocks fall if they aren't supported.
