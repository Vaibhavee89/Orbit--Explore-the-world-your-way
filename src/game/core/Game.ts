import * as THREE from 'three';
import { GameLoop } from './GameLoop';
import { GameRenderer } from '../rendering/Renderer';
import { SceneManager } from '../rendering/SceneManager';
import { CameraManager } from '../camera/CameraManager';
import { InputManager } from '../player/InputManager';
import { PlayerCapsule } from '../player/PlayerCapsule';
import { WorldLoader } from '../world/WorldLoader';
import { BuildingLoader } from '../world/BuildingLoader';
import { RoadLoader } from '../world/RoadLoader';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { HeightfieldLoader } from '../physics/HeightfieldLoader';
import { BuildingColliderLoader } from '../physics/BuildingColliderLoader';
import { CharacterController } from '../physics/CharacterController';
import type { Collider } from '@dimforge/rapier3d';
import type { WorldManifest } from '../../geospatial/WorldBuilderClient';

export class Game {
  private _loop     = new GameLoop();
  private _renderer: GameRenderer | null = null;
  private _scene:    SceneManager | null = null;
  private _camera:   THREE.PerspectiveCamera | null = null;
  private _cube:     THREE.Mesh | null = null;
  private _angle    = 0;
  private _resizeObs: ResizeObserver | null = null;

  // Camera + input
  private _camMgr: CameraManager | null = null;
  private _input:  InputManager  | null = null;

  // Player
  private _player:     PlayerCapsule     | null = null;
  private _charCtrl:   CharacterController | null = null;

  // Physics
  private _physics:        PhysicsWorld | null = null;
  private _groundCollider: Collider     | null = null;

  get running(): boolean { return this._loop.running; }

  start(canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth  || canvas.width  || 800;
    const h = canvas.clientHeight || canvas.height || 600;

    this._renderer = new GameRenderer(canvas);
    this._scene    = new SceneManager();

    this._camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 10000);

    this._camMgr = new CameraManager(12, Math.PI / 4, 1.0);
    this._camMgr.bind(canvas);

    this._input = new InputManager();
    this._input.bind(window);

    // Spinning demo cube (removed when loadWorld() is called).
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.4, metalness: 0.2 });
    this._cube = new THREE.Mesh(geo, mat);
    this._cube.castShadow = true;
    this._scene.add(this._cube);
    this._scene.add(new THREE.GridHelper(10, 10, 0x38bdf833, 0x38bdf811));

    // Placeholder capsule — directly WASD-moved until CharacterController activates.
    this._player = new PlayerCapsule(this._scene, 0, 2, 0);
    this._camMgr.update(this._camera, this._player.position);

    this._resizeObs = new ResizeObserver(() => this._onResize(canvas));
    this._resizeObs.observe(canvas.parentElement ?? canvas);

    this._loop.start(
      (dt) => this._tick(dt),
      (_alpha) => this._render(_alpha),
    );

    this._initPhysics();
  }

  private _initPhysics(): void {
    this._physics = new PhysicsWorld();
    this._physics.timestep = 1 / 60;
    // Flat ground plane until the real terrain heightfield is loaded.
    this._groundCollider = this._physics.addGroundPlane();
  }

  private _tick(dt: number): void {
    // Demo cube spins until world loads.
    if (this._cube) {
      this._angle += dt;
      this._cube.rotation.y = this._angle;
      this._cube.rotation.x = this._angle * 0.4;
    }

    const input  = this._input;
    const camMgr = this._camMgr;
    const camera = this._camera;
    const player = this._player;

    if (this._charCtrl && input && camMgr && camera && player) {
      // Physics-driven movement via KCC.
      const dir  = input.moveDir;
      const jump = input.jumpPressed;
      if (jump) input.consumeJump();

      this._charCtrl.update(dir, camMgr.yaw, jump, input.sprint, dt);

      // Sync mesh from physics body, with facing direction.
      const pos  = this._charCtrl.position;
      const yaw  = camMgr.yaw;
      const fx   = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx   =  Math.cos(yaw), rz = -Math.sin(yaw);
      const worldDx = (dir.z * fx + dir.x * rx);
      const worldDz = (dir.z * fz + dir.x * rz);
      player.syncFromPhysics(pos, worldDx, worldDz);
    } else if (player && input && camMgr && camera) {
      // Pre-world: direct mesh movement.
      player.update(input, camMgr.yaw, dt);
    }

    // Camera follows player after either movement path.
    if (player && camMgr && camera) {
      camMgr.update(camera, player.position);
    }

    // Physics step — applies staged kinematic body positions, steps dynamics.
    this._physics?.step();
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
   * Load the world from a compiled WorldManifest.
   * Removes the demo cube, installs terrain + building colliders,
   * creates the CharacterController, and places the player on terrain.
   */
  async loadWorld(manifest: WorldManifest): Promise<void> {
    if (!this._scene || !this._physics) throw new Error('Game not started');

    // Remove demo cube.
    if (this._cube) {
      this._scene.remove(this._cube);
      this._cube.geometry.dispose();
      (this._cube.material as THREE.Material).dispose();
      this._cube = null;
    }

    // Load visual assets in parallel.
    await Promise.all([
      new WorldLoader().load(manifest, this._scene),
      new BuildingLoader().load(manifest, this._scene),
      new RoadLoader().load(manifest, this._scene),
    ]);

    // Swap flat ground plane → terrain heightfield + building colliders.
    if (this._groundCollider) {
      this._physics.world.removeCollider(this._groundCollider, false);
      this._groundCollider = null;
    }

    try {
      const [{ zMax }, buildingCount] = await Promise.all([
        new HeightfieldLoader().load(manifest, this._physics),
        new BuildingColliderLoader().load(manifest, this._physics),
      ]);
      console.info(`[Game] Terrain heightfield + ${buildingCount} building colliders loaded`);

      // Spawn CharacterController above the highest terrain point.
      const spawnY = zMax + 5;
      this._charCtrl = new CharacterController(
        this._physics.world, 0, spawnY, 0,
      );
      this._player?.setPosition(0, spawnY, 0);
      console.info(`[Game] CharacterController spawned at y=${spawnY.toFixed(0)}`);
    } catch (err) {
      console.error('[Game] Physics load failed, falling back to flat ground:', err);
      this._groundCollider = this._physics.addGroundPlane();
    }
  }

  stop(): void {
    this._loop.stop();
    this._resizeObs?.disconnect();
  }

  dispose(): void {
    this.stop();
    this._input?.unbind();
    this._camMgr?.unbind();
    if (this._charCtrl && this._physics) {
      this._charCtrl.free(this._physics.world);
    }
    this._charCtrl = null;
    this._physics?.free();
    this._physics = null;
    this._groundCollider = null;
    this._scene?.dispose();
    this._renderer?.dispose();
    this._player = this._camMgr = this._input = null;
    this._cube = this._camera = this._scene = this._renderer = null;
  }
}
