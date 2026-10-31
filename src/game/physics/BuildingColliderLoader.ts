import RAPIER from '@dimforge/rapier3d';
import type { WorldManifest } from '../../geospatial/WorldBuilderClient';
import type { PhysicsWorld } from './PhysicsWorld';

const DEFAULT_BASE_URL = 'http://localhost:8000';

function _backendBase(): string {
  const url = (typeof process !== 'undefined' && process.env.VITE_WORLDBUILDER_API_URL) || '';
  return url || DEFAULT_BASE_URL;
}

interface BuildingAABB {
  /** ENU east coordinate of AABB centre (metres). */
  center_e: number;
  /** ENU north coordinate of AABB centre (metres). */
  center_n: number;
  /** ENU up (elevation) coordinate of AABB centre = height / 2 (metres). */
  center_z: number;
  /** Half-extent in the east direction (metres). */
  half_e: number;
  /** Half-extent in the north direction (metres). */
  half_n: number;
  /** Half-extent in the up direction = height / 2 (metres). */
  half_z: number;
}

/**
 * Fetches buildings_physics.json and creates one static Rapier cuboid
 * collider per building.
 *
 * Coordinate mapping (must match WorldLoader.ts / BuildingLoader.ts rotation.x = -π/2):
 *   ENU centre  (e,  n,  z) → Rapier translation (e,  z, -n)
 *   ENU extents (he, hn, hz) → Rapier cuboid     (he, hz, hn)
 */
export class BuildingColliderLoader {
  async load(manifest: WorldManifest, physics: PhysicsWorld): Promise<number> {
    const physicsUrl = manifest.asset_urls['buildings_physics'];
    if (!physicsUrl) {
      console.warn('[BuildingColliderLoader] buildings_physics asset missing from manifest');
      return 0;
    }

    const url = `${_backendBase()}${physicsUrl}`;
    const buildings: BuildingAABB[] = await fetch(url).then(r => r.json());

    for (const b of buildings) {
      // ENU Z-up → Rapier Y-up:  (east, north, up) → (east, up, -north)
      const desc = RAPIER.ColliderDesc
        .cuboid(b.half_e, b.half_z, b.half_n)
        .setTranslation(b.center_e, b.center_z, -b.center_n);
      physics.world.createCollider(desc);
    }

    return buildings.length;
  }
}
