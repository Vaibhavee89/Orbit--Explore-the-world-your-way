import * as THREE from 'three';
import { GameLoop } from './GameLoop';
import { GameRenderer } from '../rendering/Renderer';
import { SceneManager } from '../rendering/SceneManager';
import { CameraManager } from '../camera/CameraManager';
import { InputManager } from '../player/InputManager';
import { PlayerCapsule } from '../player/PlayerCapsule';
import { Player } from '../player/Player';
import { WorldLoader } from '../world/WorldLoader';
import { BuildingLoader } from '../world/BuildingLoader';
import { RoadLoader } from '../world/RoadLoader';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { HeightfieldLoader } from '../physics/HeightfieldLoader';
import { BuildingColliderLoader } from '../physics/BuildingColliderLoader';
import { CharacterController } from '../physics/CharacterController';
import { AssetPlacer } from '../assets/AssetPlacer';
import { AssetRegistry } from '../assets/AssetRegistry';
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
  private _lastRenderTime = 0;

  // Camera + input
  private _camMgr: CameraManager | null = null;
  private _input:  InputManager  | null = null;

  // Player — capsule (pre-world / fallback) and GLB avatar (post-world)
  private _capsule: PlayerCapsule | null = null;
  private _avatar:  Player        | null = null;

  // Physics
  private _physics:        PhysicsWorld        | null = null;
  private _groundCollider: Collider            | null = null;
  private _charCtrl:       CharacterController | null = null;
  private _placer:         AssetPlacer         | null = null;

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

    // Spinning demo cube (removed in loadWorld).
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.4, metalness: 0.2 });
    this._cube = new THREE.Mesh(geo, mat);
    this._cube.castShadow = true;
    this._scene.add(this._cube);
    this._scene.add(new THREE.GridHelper(10, 10, 0x38bdf833, 0x38bdf811));

    // Placeholder capsule — WASD-moved until CharacterController + avatar activate.
    this._capsule = new PlayerCapsule(this._scene, 0, 2, 0);
    this._camMgr.update(this._camera, this._capsule.position);

    this._resizeObs = new ResizeObserver(() => this._onResize(canvas));
    this._resizeObs.observe(canvas.parentElement ?? canvas);

    this._loop.start(
      (dt) => this._tick(dt),
      (alpha) => this._render(alpha),
    );

    this._initPhysics();
  }

  private _initPhysics(): void {
    this._physics = new PhysicsWorld();
    this._physics.timestep = 1 / 60;
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

    if (this._charCtrl && input && camMgr) {
      // Physics-driven movement via KCC.
      const dir  = input.moveDir;
      const jump = input.jumpPressed;
      if (jump) input.consumeJump();

      this._charCtrl.update(dir, camMgr.yaw, jump, input.sprint, dt);

      const pos  = this._charCtrl.position;
      const yaw  = camMgr.yaw;
      const fx   = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx   =  Math.cos(yaw), rz = -Math.sin(yaw);
      const wDx  = dir.z * fx + dir.x * rx;
      const wDz  = dir.z * fz + dir.x * rz;

      if (this._avatar) {
        this._avatar.syncFromPhysics(
          pos, wDx, wDz,
          this._charCtrl.horizontalSpeed,
          this._charCtrl.isGrounded,
          this._charCtrl.verticalVelocity,
        );
        // Tick animation state machine at fixed rate (mixer advances in _render).
      } else if (this._capsule) {
        this._capsule.syncFromPhysics(pos, wDx, wDz);
      }
    } else if (this._capsule && input && camMgr) {
      // Pre-world: direct WASD movement.
      this._capsule.update(input, camMgr.yaw, dt);
    }

    // Camera follows the active visual.
    const targetPos = this._avatar?.position ?? this._capsule?.position;
    if (targetPos && camMgr && camera) {
      camMgr.update(camera, targetPos);
    }

    // Physics step — commits kinematic body position, steps dynamics.
    this._physics?.step();

    // Intersection queries are valid immediately after world.step().
    if (this._charCtrl && this._placer) {
      this._placer.checkInteractions(this._charCtrl.collider);
    }
  }

  private _render(_alpha: number): void {
    const now = performance.now() / 1000;
    if (this._lastRenderTime > 0) {
      // Advance AnimationMixer with real elapsed time for smooth blending.
      this._avatar?.updateMixer(now - this._lastRenderTime);
    }
    this._lastRenderTime = now;

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
   * Installs terrain + building physics, creates the CharacterController,
   * and loads the GLB avatar (falls back to capsule if unavailable).
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

    // Swap flat ground → terrain heightfield + building colliders.
    if (this._groundCollider) {
      this._physics.world.removeCollider(this._groundCollider, false);
      this._groundCollider = null;
    }

    let spawnY = 10; // fallback spawn height
    try {
      const [{ zMax }, buildingCount] = await Promise.all([
        new HeightfieldLoader().load(manifest, this._physics),
        new BuildingColliderLoader().load(manifest, this._physics),
      ]);
      console.info(`[Game] Terrain heightfield + ${buildingCount} building colliders loaded`);
      spawnY = zMax + 5;
    } catch (err) {
      console.error('[Game] Physics load failed, using flat ground:', err);
      this._groundCollider = this._physics.addGroundPlane();
    }

    // Create kinematic character controller.
    this._charCtrl = new CharacterController(this._physics.world, 0, spawnY, 0);
    console.info(`[Game] CharacterController spawned at y=${spawnY.toFixed(0)}`);

    // Create asset placer and spawn a test artifact near world centre.
    this._placer = new AssetPlacer(this._physics, this._scene);
    this._placer.onInteract((id, placed) => {
      // Dispatch a DOM event so UI layers can react without coupling to Game internals.
      const detail = { assetId: id, enu: placed.enu, worldY: placed.worldY };
      document.dispatchEvent(new CustomEvent('game:interact', { detail, bubbles: true }));
      console.info('[Game] Interaction event:', detail);
    });

    // Spawn the ancient-artifact at ENU (100, 100) — visible on the terrain.
    // Uses a placeholder sphere if the GLB has not yet been placed at
    // public/assets/vi3w/artifact/ancient_artifact.glb.
    try {
      const artifactEntry = AssetRegistry.default.getAsset('ancient-artifact');
      await this._placer.place(artifactEntry, 100, 100);
    } catch (err) {
      console.warn('[Game] Failed to place test artifact:', err);
    }

    // Load GLB avatar; fall back to capsule on failure.
    try {
      const avatar = await Player.load('/avatar/player.glb', this._scene);
      avatar.setPosition(0, spawnY, 0);
      // Dispose the capsule — avatar takes over.
      this._capsule?.dispose(this._scene);
      this._capsule = null;
      this._avatar  = avatar;
      console.info('[Game] GLB avatar active');
    } catch (err) {
      this._capsule?.setPosition(0, spawnY, 0);
      console.warn('[Game] Avatar load failed, keeping capsule:', err);
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
    this._placer?.dispose();
    this._placer = null;
    if (this._charCtrl && this._physics) {
      this._charCtrl.free(this._physics.world);
    }
    this._charCtrl = null;
    this._physics?.free();
    this._physics = null;
    this._groundCollider = null;
    if (this._scene) {
      this._avatar?.dispose(this._scene);
      this._capsule?.dispose(this._scene);
    }
    this._avatar = this._capsule = null;
    this._scene?.dispose();
    this._renderer?.dispose();
    this._camMgr = this._input = null;
    this._cube = this._camera = this._scene = this._renderer = null;
  }
}
