import * as THREE from 'three';
import { CordSimulator } from '../physics/CordSimulator';

/**
 * Renders the physics cord as a metallic beaded chain using InstancedMesh.
 */
export class CordMesh {
  private simulator: CordSimulator;
  private mesh: THREE.InstancedMesh;
  private handleMesh: THREE.Mesh;
  private group: THREE.Group;

  // Reusable objects for matrix calculation
  private dummy: THREE.Object3D = new THREE.Object3D();

  constructor(
    simulator: CordSimulator,
    options: {
      radius: number; // Bead radius
      color: number;
      roughness?: number;
      metalness?: number;
    }
  ) {
    this.simulator = simulator;

    this.group = new THREE.Group();
    this.group.name = 'cord_group';

    const particles = this.simulator.getParticlePositions();
    const beadCount = particles.length;

    // 1. Create Beaded Chain (InstancedMesh)
    // Geometry: Sphere for each bead
    const beadGeometry = new THREE.SphereGeometry(options.radius, 16, 16);
    const beadMaterial = new THREE.MeshStandardMaterial({
      color: options.color,
      roughness: options.roughness ?? 0.3,
      metalness: options.metalness ?? 1.0, // High metalness for chain
    });

    this.mesh = new THREE.InstancedMesh(beadGeometry, beadMaterial, beadCount);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    // 2. Create Handle (Cylinder/Capsule at the end)
    // A bit larger than beads, mimicking a pull-cord handle
    const handleGeometry = new THREE.CapsuleGeometry(
      options.radius * 2.5,
      options.radius * 6,
      4,
      8
    );
    // Align capsule to Y axis (default)

    const handleMaterial = new THREE.MeshStandardMaterial({
      color: options.color, // Same material or wooden? User asked for "same exact cord", usually metal or wood. Let's stick to metal for now to match chain.
      roughness: 0.4,
      metalness: 0.8,
    });

    this.handleMesh = new THREE.Mesh(handleGeometry, handleMaterial);
    this.handleMesh.castShadow = true;
    this.handleMesh.receiveShadow = true;
    this.group.add(this.handleMesh);

    // Initial update
    this.update();
  }

  getMesh(): THREE.Group {
    return this.group;
  }

  // Helper for raycasting
  getRaycastObject(): THREE.Object3D {
    // Raycast against the handle is easier, or the whole group?
    // Group raycast works but InstancedMesh raycast is optimized in Three.js
    return this.group;
  }

  update(): void {
    const particles = this.simulator.getParticlePositions();

    // Update Beads
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      this.dummy.position.copy(p);
      this.dummy.scale.setScalar(1.0);
      this.dummy.updateMatrix();

      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;

    // Update Handle
    // Handle is attached to the last particle
    if (particles.length > 0) {
      const lastP = particles[particles.length - 1];
      // Maybe also orientation? For now just position.
      // Ideally it follows the vector of the last segment.
      this.handleMesh.position.copy(lastP);

      // Orientation: Look at prev particle to align?
      if (particles.length > 1) {
        const prevP = particles[particles.length - 2];
        // Vector from prev to last
        // We want handle Y axis to align with this vector
        // handleMesh.lookAt(prevP) would point Z axis.
        // Capsule is Y-aligned. We need to rotate X by 90?
        // Quaternions are cleaner.

        // Simple approach: lookAt, then rotateX(90)
        this.handleMesh.lookAt(prevP);
        this.handleMesh.rotateX(Math.PI / 2);
      }
    }
  }
}
