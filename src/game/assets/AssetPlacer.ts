import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d';
import type { Collider } from '@dimforge/rapier3d';
import { Vi3WAssetImporter } from '../../integrations/vi3w/Vi3WAssetImporter';
import type { AssetEntry } from './AssetRegistry';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import type { SceneManager } from '../rendering/SceneManager';

/** Default radius (metres) of the spherical sensor zone around a placed asset. */
const DEFAULT_INTERACTION_RADIUS = 2.5;

/** Y-height from which the terrain-snap raycast fires downward. */
const RAY_ORIGIN_Y = 99_999;

export interface PlacedAsset {
  /** Asset registry id. */
  id:     string;
  /** ENU footprint coordinates (same space as the terrain). */
  enu:    { e: number; n: number };
  /** Actual Y (elevation) after snapping to terrain surface. */
  worldY: number;
  /** Three.js root of the placed mesh. */
  mesh:   THREE.Object3D;
  /** Rapier sensor collider for proximity detection. */
  sensor: Collider;
}

export type InteractHandler = (assetId: string, placed: PlacedAsset) => void;

/**
 * Places Vi3W GLB assets at ENU world coordinates.
 *
 * Each placed asset gets:
 *   1. A mesh in the Three.js scene, Y-snapped to the terrain surface.
 *   2. A Rapier sensor ball collider for proximity detection.
 *
 * Call checkInteractions(playerCollider) once per physics step (after
 * world.step()) to fire the onInteract callback on zone entry.
 *
 * Coordinate mapping (ENU Z-up → Three.js Y-up):
 *   mesh.position = (east, worldY + halfHeight, -north)
 */
export class AssetPlacer {
  private _placed:         PlacedAsset[]  = [];
  private _activeOverlaps: Set<string>    = new Set();
  private _handler:        InteractHandler | null = null;

  constructor(
    private readonly _physics: PhysicsWorld,
    private readonly _scene:   SceneManager,
  ) {}

  /** Register a callback fired once each time the player enters an asset's zone. */
  onInteract(handler: InteractHandler): void {
    this._handler = handler;
  }

  /**
   * Load and place a single asset.
   *
   * @param entry  AssetRegistry entry (id, url, scale …).
   * @param e      ENU east coordinate (metres from world centre).
   * @param n      ENU north coordinate (metres from world centre).
   * @param interactionRadius  Sensor sphere radius in metres.
   *
   * Falls back to a golden placeholder sphere if the GLB fails to load.
   */
  async place(
    entry:               AssetEntry,
    e:                   number,
    n:                   number,
    interactionRadius = DEFAULT_INTERACTION_RADIUS,
  ): Promise<PlacedAsset> {
    // ── 1. Snap Y to terrain surface ────────────────────────────────────────
    const worldY = this._snapToTerrain(e, n);
    const threeZ  = -n; // ENU north → Three.js -Z

    // ── 2. Load mesh (GLB or placeholder) ───────────────────────────────────
    let mesh: THREE.Object3D;
    let halfH = 0.5; // half-height used to sit the mesh on the ground

    try {
      const { model, size } = await new Vi3WAssetImporter().load(entry.url);
      model.scale.setScalar(entry.scale);
      halfH = (size.y * entry.scale) / 2;
      mesh  = model;
    } catch {
      console.warn(`[AssetPlacer] GLB unavailable for "${entry.id}" — using placeholder`);
      mesh = this._makePlaceholder(entry.id);
      halfH = 0.4;
    }

    mesh.position.set(e, worldY + halfH, threeZ);
    this._scene.add(mesh);

    // ── 3. Sensor collider (non-solid, triggers intersection queries) ────────
    const sensorDesc = RAPIER.ColliderDesc
      .ball(interactionRadius)
      .setSensor(true)
      .setTranslation(e, worldY + halfH, threeZ);
    const sensor = this._physics.world.createCollider(sensorDesc);

    const placed: PlacedAsset = { id: entry.id, enu: { e, n }, worldY, mesh, sensor };
    this._placed.push(placed);
    console.info(`[AssetPlacer] "${entry.id}" placed at ENU (${e.toFixed(1)}, ${n.toFixed(1)}), Y=${worldY.toFixed(1)}`);
    return placed;
  }

  /**
   * Check which assets the player is currently inside, fire onInteract
   * for any newly-entered zone. Call this AFTER world.step() so intersection
   * data is fresh.
   */
  checkInteractions(playerCollider: Collider): void {
    const nowOverlapping = new Set<string>();

    for (const placed of this._placed) {
      if (this._physics.world.intersectionPair(playerCollider, placed.sensor)) {
        nowOverlapping.add(placed.id);
        if (!this._activeOverlaps.has(placed.id)) {
          console.info(`[AssetPlacer] Player entered zone of "${placed.id}"`);
          this._handler?.(placed.id, placed);
        }
      }
    }

    this._activeOverlaps = nowOverlapping;
  }

  /** All currently placed assets (read-only view). */
  get placed(): readonly PlacedAsset[] { return this._placed; }

  dispose(): void {
    for (const p of this._placed) {
      this._physics.world.removeCollider(p.sensor, false);
      this._scene.remove(p.mesh);
    }
    this._placed = [];
    this._activeOverlaps.clear();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Fire a ray straight down from above and return the hit Y elevation.
   * Falls back to 0 when no terrain is found (e.g., before heightfield loads).
   */
  private _snapToTerrain(e: number, n: number): number {
    const ray = new RAPIER.Ray(
      { x: e, y: RAY_ORIGIN_Y, z: -n },
      { x: 0, y: -1,           z:  0 },
    );
    // Exclude sensors so only solid terrain/building colliders are hit.
    const hit = this._physics.world.castRay(
      ray, RAY_ORIGIN_Y * 2, true,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,
    );
    if (hit) return RAY_ORIGIN_Y - hit.timeOfImpact;
    console.warn(`[AssetPlacer] No terrain hit at ENU (${e}, ${n}) — defaulting Y to 0`);
    return 0;
  }

  /** Golden sphere placeholder shown when a GLB asset is not yet available. */
  private _makePlaceholder(id: string): THREE.Mesh {
    const geo = new THREE.SphereGeometry(0.4, 16, 12);
    const mat = new THREE.MeshStandardMaterial({
      color:     0xf59e0b,
      roughness: 0.3,
      metalness: 0.6,
    });
    const mesh       = new THREE.Mesh(geo, mat);
    mesh.castShadow  = true;
    mesh.userData.assetId = id;
    return mesh;
  }
}
