/**
 * World Registry — catalog of pre-built, persistent game environments.
 *
 * Unlike the on-demand region builder (WorldBuilderClient → backend OSM
 * pipeline), a registry world is either:
 *   - 'local'   — fully defined in code/data, loaded instantly, no network
 *                 round-trip (procedural terrain + hand-placed props).
 *   - 'backend' — still resolved through the existing WorldBuilderClient /
 *                 FastAPI pipeline (real OSM + elevation data), but treated
 *                 as a fixed catalog entry rather than a free-drawn region.
 *
 * This lets ORBIT present "worlds" as a curated list (Manali, Kyoto, ...)
 * while keeping both content pipelines (hand-authored and real-data) behind
 * one interface the game/UI layer doesn't need to distinguish.
 */

import type { BoundingBox } from '../../geospatial/types';
import type { LocalWorldDefinition } from './LocalWorldDefinition';

export type EnvironmentType =
  | 'mountain'
  | 'urban'
  | 'cultural'
  | 'arctic'
  | 'desert';

export interface WorldRegistryEntry {
  id: string;
  name: string;
  tagline: string;
  environment: EnvironmentType;
  /** Short description shown on the world-selection card. */
  description: string;

  /** 'local' = instant, code-defined world. 'backend' = built via OSM pipeline. */
  source: 'local' | 'backend';

  /** Required when source === 'local'. */
  local?: LocalWorldDefinition;

  /** Required when source === 'backend' (center + fixed 500m bbox). */
  backend?: { lat: number; lon: number; box: BoundingBox };
}

export class WorldRegistry {
  private static _entries = new Map<string, WorldRegistryEntry>();

  static register(entry: WorldRegistryEntry): void {
    this._entries.set(entry.id, entry);
  }

  static get(id: string): WorldRegistryEntry | undefined {
    return this._entries.get(id);
  }

  static all(): WorldRegistryEntry[] {
    return [...this._entries.values()];
  }
}
