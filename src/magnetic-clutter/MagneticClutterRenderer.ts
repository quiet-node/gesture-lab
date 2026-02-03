import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import {
  EffectComposer,
  RenderPass,
  EffectPass,
  BloomEffect,
  BlendFunction,
  KernelSize,
} from 'postprocessing';
import { MagneticClutterConfig, DEFAULT_MAGNETIC_CLUTTER_CONFIG } from './types';

/**
 * Interface to store Physics Body information
 */
interface PhysicsBody {
  rigidBody: RAPIER.RigidBody;
  isGrabbable: boolean;
  size: number;
}

/**
 * MagneticClutterRenderer
 * Replicates the "Magnetic balls and light cursor" CodePen behavior.
 * Uses Rapier3D for physics and Three.js with InstancedMesh for high performance.
 */
export class MagneticClutterRenderer {
  private container: HTMLElement;
  private config: MagneticClutterConfig;

  // Three.js
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private bloomEffect: BloomEffect | null = null;

  // Instancing
  private ballInstancedMesh: THREE.InstancedMesh | null = null;
  private wireInstancedMesh: THREE.InstancedMesh | null = null;

  // Physics
  private world: RAPIER.World | null = null;
  private bodies: PhysicsBody[] = [];
  private repulsorBody: RAPIER.RigidBody | null = null;
  private repulsorMesh: THREE.Mesh | null = null;

  // Interaction State
  private repulsorTargetPos: THREE.Vector3 = new THREE.Vector3();
  private isRepulsorActive: boolean = false;

  // Grab State
  private grabTargetId: number | null = null; // RigidBody handle
  private grabPosition: THREE.Vector3 = new THREE.Vector3();
  private isGrabbing: boolean = false;

  private sceneMiddle = new THREE.Vector3(0, 0, 0);
  private initialized = false;

  // Pre-allocated objects for performance (reduce GC)
  private tempMatrix = new THREE.Matrix4();
  private tempVector = new THREE.Vector3();
  private tempQuaternion = new THREE.Quaternion();
  private tempScale = new THREE.Vector3();

  constructor(container: HTMLElement, config: Partial<MagneticClutterConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_MAGNETIC_CLUTTER_CONFIG, ...config };

    // Initialize Three.js Scene
    this.scene = new THREE.Scene();

    const width = container.clientWidth;
    const height = container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    this.camera.position.z = 5;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit pixel ratio for performance
    this.renderer.setSize(width, height);
    this.renderer.setClearColor(0x000000, 0);

    this.container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';

    // Lights
    const hemiLight = new THREE.HemisphereLight(0x00bbff, 0xaa00ff, 0.2);
    this.scene.add(hemiLight);

    window.addEventListener('resize', this.handleResize);
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Init Rapier
    await RAPIER.init();

    // Create World (Gravity 0)
    const gravity = { x: 0.0, y: 0.0, z: 0.0 };
    this.world = new RAPIER.World(gravity);

    // Setup Post-processing
    this.setupPostProcessing();

    // Create Metadata/Bodies
    this.createBodies();
    this.createRepulsor();

    this.initialized = true;
  }

  private setupPostProcessing(): void {
    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,
    });

    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    this.bloomEffect = new BloomEffect({
      blendFunction: BlendFunction.ADD,
      luminanceThreshold: 0.005,
      luminanceSmoothing: 0.025,
      intensity: this.config.bloomStrength,
      mipmapBlur: true,
      kernelSize: KernelSize.MEDIUM,
    });

    const effectPass = new EffectPass(this.camera, this.bloomEffect);
    this.composer.addPass(effectPass);
  }

  private createBodies(): void {
    if (!this.world) return;

    const ballCount = this.config.ballCount;

    // Shared Geometry and Materials
    const baseGeometry = new THREE.IcosahedronGeometry(1, 1);

    const ballMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      flatShading: true,
    });

    const wireMaterial = new THREE.MeshBasicMaterial({
      color: 0x990000,
      wireframe: true,
    });

    // Create InstancedMeshes
    this.ballInstancedMesh = new THREE.InstancedMesh(baseGeometry, ballMaterial, ballCount);
    this.wireInstancedMesh = new THREE.InstancedMesh(baseGeometry, wireMaterial, ballCount);

    this.ballInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wireInstancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    this.scene.add(this.ballInstancedMesh);
    this.scene.add(this.wireInstancedMesh);

    for (let i = 0; i < ballCount; i++) {
      this.createBody(i);
    }
  }

  private createBody(index: number): void {
    if (!this.world) return;

    const size = 0.1 + Math.random() * 0.25;
    const range = 6;
    const density = size * 1.0;

    const x = Math.random() * range - range * 0.5;
    const y = Math.random() * range - range * 0.5 + 3;
    const z = Math.random() * range - range * 0.5;

    // Physics
    const rigidBodyDesc = indentRigidBodyDesc(RAPIER.RigidBodyDesc.dynamic())
      .setTranslation(x, y, z)
      .setLinearDamping(0.5) // Add some damping for stability
      .setAngularDamping(0.5);

    const rigidBody = this.world.createRigidBody(rigidBodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(size).setDensity(density);
    this.world.createCollider(colliderDesc, rigidBody);

    this.bodies.push({ rigidBody, isGrabbable: true, size });

    // Initial matrix setup
    this.tempVector.set(x, y, z);
    this.tempQuaternion.identity();
    this.tempScale.setScalar(size);
    this.tempMatrix.compose(this.tempVector, this.tempQuaternion, this.tempScale);

    this.ballInstancedMesh!.setMatrixAt(index, this.tempMatrix);

    // Wireframe is slightly larger
    this.tempScale.setScalar(size * 1.01);
    this.tempMatrix.compose(this.tempVector, this.tempQuaternion, this.tempScale);
    this.wireInstancedMesh!.setMatrixAt(index, this.tempMatrix);
  }

  private createRepulsor(): void {
    if (!this.world) return;

    const mouseSize = 0.25;
    // Lower subdivision (3 instead of 8) for better performance
    const geometry = new THREE.IcosahedronGeometry(mouseSize, 3);
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
    });

    const mouseLight = new THREE.PointLight(0xffffff, 1, 10);

    this.repulsorMesh = new THREE.Mesh(geometry, material);
    this.repulsorMesh.add(mouseLight);

    // RigidBody (Kinematic Position Based)
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, 0, 0);
    const rigidBody = this.world.createRigidBody(bodyDesc);

    const dynamicCollider = RAPIER.ColliderDesc.ball(mouseSize * 3.0);
    this.world.createCollider(dynamicCollider, rigidBody);

    this.scene.add(this.repulsorMesh);
    this.repulsorBody = rigidBody;

    this.repulsorMesh.visible = false;
    rigidBody.setTranslation({ x: 9999, y: 9999, z: 9999 }, true);
  }

  update(_deltaTime: number): void {
    if (!this.initialized || !this.world || !this.composer) return;

    // 1. Update Physics World
    this.world.step();

    // 2. Update Repulsor
    this.updateRepulsor();

    // 3. Update Grabber
    this.updateGrabber();

    // 4. Update Bodies (Forces & Matrix Sync)
    this.updateBodies();

    // 5. Render
    this.composer.render();
  }

  private updateRepulsor(): void {
    if (!this.repulsorBody || !this.repulsorMesh) return;

    if (this.isRepulsorActive) {
      this.repulsorMesh.visible = true;
      this.repulsorBody.setTranslation(this.repulsorTargetPos, true);

      const trans = this.repulsorBody.translation();
      this.repulsorMesh.position.set(trans.x, trans.y, trans.z);
    } else {
      this.repulsorMesh.visible = false;
      this.repulsorBody.setTranslation({ x: 9999, y: 9999, z: 9999 }, true);
    }
  }

  private updateGrabber(): void {
    if (!this.world || !this.isGrabbing || this.grabTargetId === null) return;

    const bodyObj = this.bodies.find((b) => b.rigidBody.handle === this.grabTargetId);
    if (!bodyObj) {
      this.isGrabbing = false;
      this.grabTargetId = null;
      return;
    }

    const body = bodyObj.rigidBody;
    const currentPos = body.translation();
    const target = this.grabPosition;

    const speed = 15.0; // Slightly faster for responsiveness
    body.setLinvel(
      {
        x: (target.x - currentPos.x) * speed,
        y: (target.y - currentPos.y) * speed,
        z: (target.z - currentPos.z) * speed,
      },
      true
    );
  }

  private updateBodies(): void {
    if (!this.ballInstancedMesh || !this.wireInstancedMesh) return;

    for (let i = 0; i < this.bodies.length; i++) {
      const { rigidBody, size } = this.bodies[i];

      rigidBody.resetForces(true);

      const trans = rigidBody.translation();
      const rot = rigidBody.rotation();

      // Skip custom forces if being grabbed
      if (!(this.isGrabbing && rigidBody.handle === this.grabTargetId)) {
        // Gravity towards center (0,0,0)
        // Use tempVector for calculations to avoid GC
        this.tempVector.set(trans.x, trans.y, trans.z);
        this.tempVector.sub(this.sceneMiddle).normalize().multiplyScalar(-0.5);

        rigidBody.addForce(
          { x: this.tempVector.x, y: this.tempVector.y, z: this.tempVector.z },
          true
        );
      }

      // Update InstancedMesh Matrix
      this.tempVector.set(trans.x, trans.y, trans.z);
      this.tempQuaternion.set(rot.x, rot.y, rot.z, rot.w);

      // Ball Matrix
      this.tempScale.setScalar(size);
      this.tempMatrix.compose(this.tempVector, this.tempQuaternion, this.tempScale);
      this.ballInstancedMesh.setMatrixAt(i, this.tempMatrix);

      // Wireframe Matrix (slightly larger)
      this.tempScale.setScalar(size * 1.01);
      this.tempMatrix.compose(this.tempVector, this.tempQuaternion, this.tempScale);
      this.wireInstancedMesh.setMatrixAt(i, this.tempMatrix);
    }

    this.ballInstancedMesh.instanceMatrix.needsUpdate = true;
    this.wireInstancedMesh.instanceMatrix.needsUpdate = true;
  }

  setRepulsor(x: number, y: number, z: number, active: boolean): void {
    this.isRepulsorActive = active;
    if (active) {
      this.repulsorTargetPos.set(x, y, z);
    }
  }

  setGrabber(x: number, y: number, z: number, active: boolean): void {
    if (active) {
      this.grabPosition.set(x, y, z);
      if (!this.isGrabbing) {
        this.findClosestBody(x, y, z);
      }
    } else {
      this.isGrabbing = false;
      this.grabTargetId = null;
    }
  }

  private findClosestBody(x: number, y: number, z: number): void {
    let minDist = Infinity;
    let closestHandle: number | null = null;
    const handPos = new THREE.Vector3(x, y, z);

    for (const bodyObj of this.bodies) {
      const trans = bodyObj.rigidBody.translation();
      this.tempVector.set(trans.x, trans.y, trans.z);
      const dist = handPos.distanceTo(this.tempVector);

      if (dist < 2.0 && dist < minDist) {
        minDist = dist;
        closestHandle = bodyObj.rigidBody.handle;
      }
    }

    if (closestHandle !== null) {
      this.isGrabbing = true;
      this.grabTargetId = closestHandle;
    }
  }

  private handleResize = () => {
    if (!this.renderer || !this.camera || !this.composer) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  };

  projectToWorld(ndcX: number, ndcY: number, targetZ: number = 0): THREE.Vector3 {
    const vector = new THREE.Vector3(ndcX, ndcY, 0.5);
    vector.unproject(this.camera);

    const dir = vector.sub(this.camera.position).normalize();
    const distance = (targetZ - this.camera.position.z) / dir.z;
    const pos = this.camera.position.clone().add(dir.multiplyScalar(distance));

    return pos;
  }

  getStats(): { balls: number; active: boolean } {
    return {
      balls: this.bodies.length,
      active: this.initialized,
    };
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);

    this.scene.clear();
    this.renderer.dispose();
    this.composer?.dispose();
    this.bloomEffect?.dispose();

    if (this.world) {
      this.world.free();
      this.world = null;
    }
  }
}

function indentRigidBodyDesc(desc: RAPIER.RigidBodyDesc): RAPIER.RigidBodyDesc {
  return desc;
}
