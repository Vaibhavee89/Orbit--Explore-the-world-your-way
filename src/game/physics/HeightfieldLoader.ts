import RAPIER from '@dimforge/rapier3d';
import type { Collider } from '@dimforge/rapier3d';
import type { WorldManifest } from '../../geospatial/WorldBuilderClient';
import type { PhysicsWorld } from './PhysicsWorld';

const DEFAULT_BASE_URL = 'http://localhost:8000';

function _backendBase(): string {
  const url = (typeof process !== 'undefined' && process.env.VITE_WORLDBUILDER_API_URL) || '';
  return url || DEFAULT_BASE_URL;
}

interface HeightmapData {
  nrows:      number;
  ncols:      number;
  /** Row-major heights: heights[r * ncols + c] = elev at (row r, col c). */
  heights:    number[];
  east_min:   number;
  east_max:   number;
  north_min:  number;
  north_max:  number;
  z_min:      number;
  z_max:      number;
}

export interface HeightfieldResult {
  collider: Collider;
  zMin:     number;   // terrain min elevation (Three.js Y lower bound)
  zMax:     number;   // terrain max elevation (Three.js Y upper bound)
}

/**
 * Fetch the heightmap side-channel from the manifest and create a static
 * Rapier heightfield collider that matches the rendered terrain GLB.
 *
 * Coordinate mapping (must match WorldLoader.ts rotation.x = -π/2):
 *   Terrain GLB vertex (east, north, elev) → Three.js (east, elev, -north)
 *   Rapier heightfield: X = east, Y = elev, Z = -north
 */
export class HeightfieldLoader {
  async load(manifest: WorldManifest, physics: PhysicsWorld): Promise<HeightfieldResult> {
    const url = `${_backendBase()}${manifest.asset_urls['heightmap']}`;
    const data: HeightmapData = await fetch(url).then(r => r.json());

    const { nrows, ncols, heights, east_min, east_max, north_min, north_max } = data;

    // Rapier heightfield expects column-major order: heights[r + c * nrows].
    // The JSON stores row-major: heights[r * ncols + c].
    // Transposing: colMajor[r + c * nrows] = rowMajor[r * ncols + c].
    const colMajor = new Float32Array(nrows * ncols);
    for (let r = 0; r < nrows; r++) {
      for (let c = 0; c < ncols; c++) {
        colMajor[r + c * nrows] = heights[r * ncols + c];
      }
    }

    // Scale = total extent of the field in each axis.
    // Rapier X ↔ Three.js X (east), Rapier Z ↔ Three.js Z (north extent).
    const eastExtent  = east_max  - east_min;
    const northExtent = north_max - north_min;
    const scale = { x: eastExtent, y: 1.0, z: northExtent };

    const desc = RAPIER.ColliderDesc.heightfield(nrows, ncols, colMajor, scale);
    // Heightfield is centered at origin by default — terrain mesh is also
    // centered at ENU origin (0, 0, 0).
    const collider = physics.world.createCollider(desc);

    return { collider, zMin: data.z_min, zMax: data.z_max };
  }
}
