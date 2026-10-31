/**
 * Registry of game assets (props and collectibles).
 *
 * Each entry describes a single GLB asset: its identity, category, URL
 * (served statically by Vite), display scale, and searchable tags.
 *
 * Usage
 * -----
 *   const entry = AssetRegistry.default.getAsset('ancient-artifact');
 *   const glb   = await new Vi3WAssetImporter().load(entry.url);
 */

export type AssetCategory = 'prop' | 'collectible';

export interface AssetEntry {
  /** Kebab-case unique identifier. */
  id:       string;
  /** Human-readable display name. */
  name:     string;
  category: AssetCategory;
  /** URL path served by Vite (relative to the public root). */
  url:      string;
  /** Uniform scale applied when the asset is placed in the world (default 1). */
  scale:    number;
  /** Searchable tags for filtering / discovery. */
  tags:     string[];
}

export class AssetNotFoundError extends Error {
  constructor(id: string) {
    super(`AssetRegistry: no entry found for id "${id}"`);
    this.name = 'AssetNotFoundError';
  }
}

export class AssetRegistry {
  private _entries = new Map<string, AssetEntry>();

  // ── Mutation ──────────────────────────────────────────────────────────────

  /** Add or replace an asset entry. Returns `this` for chaining. */
  register(entry: AssetEntry): this {
    this._entries.set(entry.id, { ...entry });
    return this;
  }

  /** Remove an entry by id. No-op if it does not exist. */
  unregister(id: string): this {
    this._entries.delete(id);
    return this;
  }

  // ── Query ─────────────────────────────────────────────────────────────────

  /**
   * Return the entry for the given id.
   * @throws {AssetNotFoundError} if the id is not registered.
   */
  getAsset(id: string): AssetEntry {
    const entry = this._entries.get(id);
    if (!entry) throw new AssetNotFoundError(id);
    return { ...entry }; // defensive copy
  }

  /** Return true if an entry with this id is registered. */
  has(id: string): boolean {
    return this._entries.has(id);
  }

  /** Return all entries matching the given category. */
  findByCategory(category: AssetCategory): AssetEntry[] {
    return [...this._entries.values()]
      .filter(e => e.category === category)
      .map(e => ({ ...e }));
  }

  /** Return all entries whose tags include every supplied tag. */
  findByTags(...tags: string[]): AssetEntry[] {
    return [...this._entries.values()]
      .filter(e => tags.every(t => e.tags.includes(t)))
      .map(e => ({ ...e }));
  }

  /** Return all registered entries (defensive copies). */
  all(): AssetEntry[] {
    return [...this._entries.values()].map(e => ({ ...e }));
  }

  /** Number of registered entries. */
  get size(): number { return this._entries.size; }

  // ── Shared default registry ───────────────────────────────────────────────

  /** Pre-populated registry with the three P4-01 Vi3W assets. */
  static readonly default: AssetRegistry = new AssetRegistry()
    .register({
      id:       'treasure-chest',
      name:     'Treasure Chest',
      category: 'collectible',
      url:      '/assets/vi3w/treasure/treasure_chest.glb',
      scale:    1.0,
      tags:     ['reward', 'collectible', 'chest'],
    })
    .register({
      id:       'ancient-artifact',
      name:     'Ancient Artifact',
      category: 'collectible',
      url:      '/assets/vi3w/artifact/ancient_artifact.glb',
      scale:    1.0,
      tags:     ['collectible', 'artifact', 'cultural'],
    })
    .register({
      id:       'signboard',
      name:     'Signboard',
      category: 'prop',
      url:      '/assets/vi3w/signboard/signboard.glb',
      scale:    1.0,
      tags:     ['prop', 'waypoint', 'label'],
    });
}
