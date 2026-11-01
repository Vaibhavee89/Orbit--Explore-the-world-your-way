import type { SelectedLocation } from './types';

export interface WorldManifest {
  id: string;
  created_at: string;
  bbox: { north: number; south: number; east: number; west: number };
  assets: Record<string, string>;
  asset_urls: Record<string, string>;
  stats: Record<string, unknown>;
}

export class WorldBuilderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'WorldBuilderError';
  }
}

const DEFAULT_BASE_URL = 'http://localhost:8000';
const USE_MOCK = false; // Real backend is running on :8000

function _baseUrl(): string {
  const url =
    (typeof process !== 'undefined' && process.env.VITE_WORLDBUILDER_API_URL) || '';
  return url || DEFAULT_BASE_URL;
}

async function _request<T>(url: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(url, init);
  } catch (err) {
    throw new WorldBuilderError(`Network error: ${String(err)}`);
  }
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      const body = await resp.json();
      if (typeof body?.detail === 'string') detail = body.detail;
    } catch { /* non-JSON error body */ }
    throw new WorldBuilderError(detail, resp.status);
  }
  return resp.json() as Promise<T>;
}

function _mockWorldManifest(location: SelectedLocation): WorldManifest {
  const worldId = crypto.randomUUID();
  return {
    id: worldId,
    created_at: new Date().toISOString(),
    bbox: location.box,
    assets: {
      terrain: 'terrain.glb',
      buildings: 'buildings.glb',
      roads: 'roads.json',
    },
    asset_urls: {
      // Point to real backend paths if backend is running,
      // otherwise point to public assets
      terrain: `/worlds/${worldId}/terrain.glb`,
      buildings: `/worlds/${worldId}/buildings.glb`,
      roads: `/worlds/${worldId}/roads.json`,
    },
    stats: {
      terrain_tiles: 128,
      building_count: 42,
      road_length_m: 5230,
      poi_count: 15,
    },
  };
}

export const WorldBuilderClient = {
  /**
   * POST /worlds — compile (or return cached) world for the given SelectedLocation.
   * Returns immediately on a warm cache (same bbox already compiled).
   */
  async buildWorld(location: SelectedLocation): Promise<WorldManifest> {
    if (USE_MOCK) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 800));
      return _mockWorldManifest(location);
    }
    return _request<WorldManifest>(`${_baseUrl()}/worlds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(location),
    });
  },

  /** GET /worlds/{id} — fetch the manifest for an already-compiled world. */
  async getWorld(id: string): Promise<WorldManifest> {
    return _request<WorldManifest>(`${_baseUrl()}/worlds/${encodeURIComponent(id)}`);
  },
};
