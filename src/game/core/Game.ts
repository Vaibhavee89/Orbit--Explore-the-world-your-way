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
import { LocalWorldLoader } from '../world/LocalWorldLoader';
import type { LocalWorldDefinition } from '../world/LocalWorldDefinition';
import { DiscoveryManager } from '../exploration/DiscoveryManager';
import { EventBus } from './EventBus';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { HeightfieldLoader } from '../physics/HeightfieldLoader';
import { BuildingColliderLoader } from '../physics/BuildingColliderLoader';
import { CharacterController } from '../physics/CharacterController';
import { AssetPlacer } from '../assets/AssetPlacer';
import { AssetRegistry } from '../assets/AssetRegistry';
import { Inventory } from '../inventory/Inventory';
import { InteractionPrompt } from '../ui/InteractionPrompt';
import { CharacterLibrary } from '../player/CharacterLibrary';
import { getSavedCharacter } from '../ui/AvatarPicker';
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
  private _placer:            AssetPlacer         | null = null;
  private _discovery:         DiscoveryManager    | null = null;
  private _inventory         = new Inventory();
  private _prompt:            InteractionPrompt   | null = null;
  // Initialised in start() from localStorage; falls back to 'soldier'.
  private _activeCharacterId = 'soldier';
  // Bumped by dispose() so in-flight async loads (loadWorld/loadLocalWorld/
  // _loadAvatar) can detect a mid-flight exit and stop touching nulled state
  // instead of throwing or mutating an orphaned SceneManager/PhysicsWorld.
  private _sessionId = 0;

  get running(): boolean { return this._loop.running; }

  start(canvas: HTMLCanvasElement): void {
    // Restore character choice persisted by AvatarPicker.
    this._activeCharacterId = getSavedCharacter();

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

    // HUD prompt — mounts inside the canvas container so it's positioned relative to it.
    const promptContainer = canvas.parentElement ?? document.body;
    this._prompt = new InteractionPrompt(promptContainer);
    this._prompt.onPickup(id => this._pickup(id));

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

    // Edge-triggered UI/camera key bindings. Dispatched as DOM events so the
    // Lit UI layer (AdventureRoot) can react without coupling to Game internals.
    if (input) {
      if (input.wasJustPressed('KeyC')) {
        input.consumeKey('KeyC');
        const mode = camMgr?.toggleMode();
        document.dispatchEvent(new CustomEvent('game:camera-mode', { detail: { mode } }));
      }
      for (const [code, event] of [
        ['KeyI', 'game:toggle-inventory'],
        ['KeyJ', 'game:toggle-journal'],
        ['KeyM', 'game:toggle-map'],
        ['Escape', 'game:toggle-pause'],
      ] as const) {
        if (input.wasJustPressed(code)) {
          input.consumeKey(code);
          document.dispatchEvent(new CustomEvent(event));
        }
      }
    }

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
    if (this._charCtrl && this._discovery) {
      this._discovery.checkDiscoveries(this._charCtrl.collider);
    }

    // Keep prompt in sync with proximity state.
    this._prompt?.update(this._placer?.nearbyAsset ?? null);
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
    const sessionId = this._sessionId;

    // Remove demo cube.
    if (this._cube) {
      this._scene.remove(this._cube);
      this._cube.geometry.dispose();
      (this._cube.material as THREE.Material).dispose();
      this._cube = null;
    }

    // Load visual assets. Terrain is required; buildings/roads are optional
    // decoration — a failed fetch for either shouldn't abort the whole
    // startup and leave the player stuck with a cube-less, uncollidable
    // scene. allSettled so one rejection can't short-circuit the others.
    const [terrainResult, buildingsResult, roadsResult] = await Promise.allSettled([
      new WorldLoader().load(manifest, this._scene),
      new BuildingLoader().load(manifest, this._scene),
      new RoadLoader().load(manifest, this._scene),
    ]);
    if (this._sessionId !== sessionId) return; // dispose() ran during the load — bail, nothing left to touch.
    if (terrainResult.status === 'rejected') {
      console.error('[Game] Terrain load failed — world cannot start:', terrainResult.reason);
      throw terrainResult.reason;
    }
    if (buildingsResult.status === 'rejected') {
      console.warn('[Game] Building load failed, continuing without buildings:', buildingsResult.reason);
    }
    if (roadsResult.status === 'rejected') {
      console.warn('[Game] Road load failed, continuing without roads:', roadsResult.reason);
    }

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

    // Spawn the three P4-01 Vi3W assets around the player's starting area
    // (within walking distance of spawn at ENU origin).
    const spawns: Array<[id: string, e: number, n: number]> = [
      ['ancient-artifact', 100, 100],
      ['treasure-chest', -80, 60],
      ['signboard', 30, -50],
    ];
    for (const [id, e, n] of spawns) {
      try {
        const entry = AssetRegistry.default.getAsset(id);
        await this._placer.place(entry, e, n);
      } catch (err) {
        console.warn(`[Game] Failed to place "${id}":`, err);
      }
    }

    if (this._sessionId !== sessionId) return; // dispose() ran mid-placement — bail.

    // Load GLB avatar using the active character from the library.
    await this._loadAvatar(this._activeCharacterId, spawnY);
  }

  /**
   * Load a hand-authored World Registry environment — procedural terrain +
   * placed props, no backend round-trip. Mirrors loadWorld()'s setup order
   * (terrain/physics → character controller → props → avatar) but builds
   * everything from a LocalWorldDefinition instead of a fetched manifest.
   */
  async loadLocalWorld(def: LocalWorldDefinition): Promise<void> {
    if (!this._scene || !this._physics) throw new Error('Game not started');

    if (this._cube) {
      this._scene.remove(this._cube);
      this._cube.geometry.dispose();
      (this._cube.material as THREE.Material).dispose();
      this._cube = null;
    }

    if (this._groundCollider) {
      this._physics.world.removeCollider(this._groundCollider, false);
      this._groundCollider = null;
    }

    this._placer = new AssetPlacer(this._physics, this._scene);
    this._placer.onInteract((id, placed) => {
      const detail = { assetId: id, enu: placed.enu, worldY: placed.worldY };
      document.dispatchEvent(new CustomEvent('game:interact', { detail, bubbles: true }));
      console.info('[Game] Interaction event:', detail);
    });

    // Terrain + heightfield physics + props (including vi3w collectibles,
    // placed via this._placer so pickup/inventory wiring is unchanged).
    const { spawnY, discoverableZones } = await new LocalWorldLoader().load(
      def, this._scene, this._physics, this._placer,
    );

    // Landmark discovery zones — bridges, viewpoints, temples, etc. Distinct
    // from AssetPlacer: these stay in the world, only the "discovered" state
    // changes (no pickup).
    this._discovery = new DiscoveryManager(this._physics);
    for (const zone of discoverableZones) {
      this._discovery.addZone({ ...zone, xpReward: 100 });
    }
    console.info(`[Game] Registered ${discoverableZones.length} discoverable landmarks`);

    const groundSpawnY = spawnY + 2;
    this._charCtrl = new CharacterController(
      this._physics.world, def.spawn.x, groundSpawnY, def.spawn.z,
    );
    console.info(`[Game] Local world "${def.worldId}" — spawned at y=${groundSpawnY.toFixed(1)}`);

    await this._loadAvatar(this._activeCharacterId, groundSpawnY);
  }

  /**
   * Switch the active player avatar at runtime.
   * The current avatar is disposed and replaced with the requested character.
   * Falls back silently if the GLB is unavailable (character not yet downloaded).
   */
  async setCharacter(id: string): Promise<void> {
    if (!this._scene) throw new Error('Game not started');
    const spawnY = this._charCtrl
      ? this._charCtrl.position.y
      : (this._capsule?.position.y ?? 5);
    this._activeCharacterId = id;
    await this._loadAvatar(id, spawnY);
  }

  /** Current character library entry id. */
  get activeCharacterId(): string { return this._activeCharacterId; }

  private async _loadAvatar(id: string, spawnY: number): Promise<void> {
    const scene = this._scene;
    if (!scene) return;
    const sessionId = this._sessionId;
    let entry;
    try {
      entry = CharacterLibrary.default.getCharacter(id);
    } catch {
      console.warn(`[Game] Unknown character "${id}", keeping current avatar`);
      return;
    }

    try {
      const avatar = await Player.load(entry.url, scene, entry.clipAliases ?? {}, id);
      if (this._sessionId !== sessionId) {
        // dispose() ran while the GLB was loading — this scene is already
        // torn down. Don't touch this._avatar/this._capsule; just free the
        // orphaned load so it doesn't leak GPU resources.
        avatar.dispose(scene);
        return;
      }
      avatar.setPosition(0, spawnY, 0);
      // Dispose old avatar; capsule stays hidden until next loadWorld if avatar fails.
      this._avatar?.dispose(scene);
      this._capsule?.dispose(scene);
      this._capsule = null;
      this._avatar  = avatar;
      console.info(`[Game] Avatar active: "${id}"`);
    } catch (err) {
      if (this._sessionId !== sessionId) return; // stale — game already disposed.
      if (!this._avatar) {
        // No avatar yet — keep the capsule as fallback.
        this._capsule?.setPosition(0, spawnY, 0);
      }
      console.warn(`[Game] Avatar load failed for "${id}":`, err);
    }
  }

  /** Read-only view of the player's collected items. */
  get inventory(): Inventory { return this._inventory; }

  /** Pick up the given asset: remove it from the world and add to inventory. */
  private _pickup(assetId: string): void {
    const placed = this._placer?.pickup(assetId);
    if (!placed) return;
    this._inventory.add(assetId, placed.enu);
    this._prompt?.update(null);
    EventBus.emit('item:collected', { assetId });
    document.dispatchEvent(new CustomEvent('game:pickup', {
      detail: { assetId, enu: placed.enu },
      bubbles: true,
    }));
  }

  stop(): void {
    this._loop.stop();
    this._resizeObs?.disconnect();
  }

  dispose(): void {
    this._sessionId++;
    this.stop();
    this._input?.unbind();
    this._camMgr?.unbind();
    this._prompt?.dispose();
    this._prompt = null;
    this._placer?.dispose();
    this._placer = null;
    // Not calling discovery.dispose() — its colliders live in the same
    // Rapier world freed by physics.free() just below; avoid a double-free.
    this._discovery = null;
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
