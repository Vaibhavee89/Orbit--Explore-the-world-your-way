import * as THREE from 'three';
import { GameLoop } from './GameLoop';
import { GameRenderer } from '../rendering/Renderer';
import { SceneManager } from '../rendering/SceneManager';
import { WorldLoader } from '../world/WorldLoader';
import { BuildingLoader } from '../world/BuildingLoader';
import { RoadLoader } from '../world/RoadLoader';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import type { PhysicsBodyHandle } from '../physics/PhysicsWorld';
import type { WorldManifest } from '../../geospatial/WorldBuilderClient';

export class Game {
  private _loop     = new GameLoop();
  private _renderer: GameRenderer | null = null;
  private _scene:    SceneManager | null = null;
  private _camera:   THREE.PerspectiveCamera | null = null;
  private _cube:     THREE.Mesh | null = null;
  private _angle    = 0;
  private _resizeObs: ResizeObserver | null = null;

  // Physics
  private _physics: PhysicsWorld | null = null;
  private _testBox: { mesh: THREE.Mesh; body: PhysicsBodyHandle } | null = null;

  get running(): boolean { return this._loop.running; }

  start(canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth  || canvas.width  || 800;
    const h = canvas.clientHeight || canvas.height || 600;

    this._renderer = new GameRenderer(canvas);
    this._scene    = new SceneManager();

    this._camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    this._camera.position.set(0, 1.5, 4);
    this._camera.lookAt(0, 0, 0);

    // Spinning demo cube
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.4, metalness: 0.2 });
    this._cube = new THREE.Mesh(geo, mat);
    this._cube.castShadow = true;
    this._scene.add(this._cube);

    // Floor grid so the cube has a reference plane
    this._scene.add(new THREE.GridHelper(10, 10, 0x38bdf833, 0x38bdf811));

    this._resizeObs = new ResizeObserver(() => this._onResize(canvas));
    this._resizeObs.observe(canvas.parentElement ?? canvas);

    this._loop.start(
      (dt) => this._tick(dt),
      (alpha) => this._render(alpha),
    );

    // PhysicsWorld init is synchronous once the WASM module is loaded
    // (vite-plugin-wasm handles the static import).
    this._initPhysics();
  }

  private _initPhysics(): void {
    this._physics = new PhysicsWorld();
    this._physics.timestep = 1 / 60;

    // Hardcoded ground plane (y = 0).
    this._physics.addGroundPlane();

    // Visible ground plane in Three.js.
    const groundGeo = new THREE.PlaneGeometry(20, 20);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x334455, roughness: 0.9 });
    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    this._scene?.add(groundMesh);

    // Dynamic test box dropped from y = 10.
    const handle = this._physics.addDynamicBox(0, 10, 0, 0.5, 0.5, 0.5);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.5 });
    const boxMesh = new THREE.Mesh(boxGeo, boxMat);
    boxMesh.castShadow = true;
    this._scene?.add(boxMesh);
    this._testBox = { mesh: boxMesh, body: handle };
  }

  private _tick(_dt: number): void {
    // Spinning demo cube (present before world loads).
    if (this._cube) {
      this._angle += _dt;
      this._cube.rotation.y = this._angle;
      this._cube.rotation.x = this._angle * 0.4;
    }

    // Physics step + mesh sync.
    if (this._physics && this._testBox) {
      this._physics.step();
      const t = this._testBox.body.rigidBody.translation();
      const r = this._testBox.body.rigidBody.rotation();
      this._testBox.mesh.position.set(t.x, t.y, t.z);
      this._testBox.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  private _render(_alpha: number): void {
    if (this._renderer && this._scene && this._camera) {
      this._renderer.render(this._scene.scene, this._camera);
    }
  }

  private _onResize(canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    this._renderer?.resize(w, h);
    if (this._camera) {
      this._camera.aspect = w / h;
      this._camera.updateProjectionMatrix();
    }
  }

  /**
   * Load the terrain GLB from a compiled WorldManifest.
   * Removes the placeholder cube and repositions the camera for a top-down view.
   */
  async loadWorld(manifest: WorldManifest): Promise<void> {
    if (!this._scene) throw new Error('Game not started');

    // Remove demo cube from scene and tick loop.
    if (this._cube) {
      this._scene.remove(this._cube);
      this._cube.geometry.dispose();
      (this._cube.material as THREE.Material).dispose();
      this._cube = null;
    }

    // Load terrain, buildings, and roads in parallel.
    await Promise.all([
      new WorldLoader().load(manifest, this._scene),
      new BuildingLoader().load(manifest, this._scene),
      new RoadLoader().load(manifest, this._scene),
    ]);

    // Position camera for a bird's-eye view of the terrain (~1 km² region).
    // ENU metres: terrain spans roughly ±500 m in X/Y; camera at (0, 600, 900).
    if (this._camera) {
      this._camera.position.set(0, 600, 900);
      this._camera.lookAt(0, 0, 0);
      this._camera.updateProjectionMatrix();
    }
  }

  stop(): void {
    this._loop.stop();
    this._resizeObs?.disconnect();
  }

  dispose(): void {
    this.stop();
    this._physics?.free();
    this._physics = null;
    this._testBox = null;
    this._scene?.dispose();
    this._renderer?.dispose();
    this._cube = this._camera = this._scene = this._renderer = null;
  }
}
