import RAPIER from '@dimforge/rapier3d';
import type { Collider } from '@dimforge/rapier3d';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { EventBus } from '../core/EventBus';

export interface DiscoverableZone {
  id: string;
  name: string;
  /** World-space position (Three.js coords, same frame as props/terrain). */
  x: number;
  y: number;
  z: number;
  radius: number;
  xpReward: number;
}

/**
 * Detects when the player enters a landmark's discovery radius and fires a
 * one-time 'landmark:discovered' event (+ XP) via the EventBus.
 *
 * Distinct from AssetPlacer: landmarks stay in the world (a bridge, a
 * temple, a viewpoint isn't picked up) — only collectibles use AssetPlacer's
 * pickup flow. A single world can register both.
 */
export class DiscoveryManager {
  private _zones: Map<string, { zone: DiscoverableZone; sensor: Collider }> = new Map();
  private _discovered: Set<string> = new Set();
  private _activeOverlaps: Set<string> = new Set();

  constructor(private readonly _physics: PhysicsWorld) {}

  /** Register a discoverable landmark zone. */
  addZone(zone: DiscoverableZone): void {
    // KINEMATIC_FIXED required: the sensor has no parent body (= fixed), and
    // the player belongs to a kinematicPositionBased body. Without this,
    // intersectionPair() never returns true for a kinematic-vs-fixed pair —
    // see the identical issue/fix in AssetPlacer.ts.
    const sensorDesc = RAPIER.ColliderDesc
      .ball(zone.radius)
      .setSensor(true)
      .setActiveCollisionTypes(
        RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_FIXED,
      )
      .setTranslation(zone.x, zone.y, zone.z);
    const sensor = this._physics.world.createCollider(sensorDesc);
    this._zones.set(zone.id, { zone, sensor });
  }

  /** Call once per physics step (after world.step()) with the player's collider. */
  checkDiscoveries(playerCollider: Collider): void {
    const nowOverlapping = new Set<string>();

    for (const [id, { zone, sensor }] of this._zones) {
      if (!this._physics.world.intersectionPair(playerCollider, sensor)) continue;
      nowOverlapping.add(id);
      if (this._activeOverlaps.has(id)) continue; // already overlapping last frame
      if (this._discovered.has(id)) continue;     // already discovered this session

      this._discovered.add(id);
      console.info(`[DiscoveryManager] Discovered "${zone.name}" (+${zone.xpReward} XP)`);
      EventBus.emit('landmark:discovered', { id: zone.id, name: zone.name, xpReward: zone.xpReward });
    }

    this._activeOverlaps = nowOverlapping;
  }

  get discoveredIds(): ReadonlySet<string> { return this._discovered; }
  get totalZones(): number { return this._zones.size; }

  dispose(): void {
    for (const { sensor } of this._zones.values()) {
      this._physics.world.removeCollider(sensor, false);
    }
    this._zones.clear();
    this._activeOverlaps.clear();
  }
}
