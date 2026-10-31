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

export const WorldBuilderClient = {
  /**
   * POST /worlds — compile (or return cached) world for the given SelectedLocation.
   * Returns immediately on a warm cache (same bbox already compiled).
   */
  async buildWorld(location: SelectedLocation): Promise<WorldManifest> {
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
