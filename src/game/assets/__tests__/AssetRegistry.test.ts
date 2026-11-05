import { describe, it, expect, beforeEach } from 'vitest';
import {
  AssetRegistry,
  AssetNotFoundError,
  type AssetEntry,
} from '../AssetRegistry';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ARTIFACT: AssetEntry = {
  id:       'ancient-artifact',
  name:     'Ancient Artifact',
  category: 'collectible',
  url:      '/assets/vi3w/artifact/ancient_artifact.glb',
  scale:    1.0,
  tags:     ['collectible', 'artifact', 'cultural'],
};

const CHEST: AssetEntry = {
  id:       'treasure-chest',
  name:     'Treasure Chest',
  category: 'collectible',
  url:      '/assets/vi3w/treasure/treasure_chest.glb',
  scale:    1.0,
  tags:     ['reward', 'collectible', 'chest'],
};

const SIGN: AssetEntry = {
  id:       'signboard',
  name:     'Signboard',
  category: 'prop',
  url:      '/assets/vi3w/signboard/signboard.glb',
  scale:    1.0,
  tags:     ['prop', 'waypoint', 'label'],
};

// ── getAsset ──────────────────────────────────────────────────────────────────

describe('AssetRegistry.getAsset', () => {
  it("returns metadata for 'ancient-artifact'", () => {
    const entry = AssetRegistry.default.getAsset('ancient-artifact');
    expect(entry.id).toBe('ancient-artifact');
    expect(entry.name).toBe('Ancient Artifact');
    expect(entry.category).toBe('collectible');
    expect(entry.url).toBe('/assets/vi3w/artifact/ancient_artifact.glb');
  });

  it("returns metadata for 'treasure-chest'", () => {
    const entry = AssetRegistry.default.getAsset('treasure-chest');
    expect(entry.id).toBe('treasure-chest');
    expect(entry.category).toBe('collectible');
  });

  it("returns metadata for 'signboard'", () => {
    const entry = AssetRegistry.default.getAsset('signboard');
    expect(entry.id).toBe('signboard');
    expect(entry.category).toBe('prop');
  });

  it('throws AssetNotFoundError for an unknown id', () => {
    expect(() => AssetRegistry.default.getAsset('nonexistent'))
      .toThrow(AssetNotFoundError);
  });

  it('error message contains the missing id', () => {
    expect(() => AssetRegistry.default.getAsset('ghost-asset'))
      .toThrow('"ghost-asset"');
  });

  it('returns a defensive copy (mutation does not affect registry)', () => {
    const a = AssetRegistry.default.getAsset('ancient-artifact');
    a.name = 'MUTATED';
    const b = AssetRegistry.default.getAsset('ancient-artifact');
    expect(b.name).toBe('Ancient Artifact');
  });
});

// ── register / has / size ─────────────────────────────────────────────────────

describe('AssetRegistry register / unregister', () => {
  let reg: AssetRegistry;
  beforeEach(() => { reg = new AssetRegistry(); });

  it('registers a new entry and makes it retrievable', () => {
    reg.register(ARTIFACT);
    expect(reg.has('ancient-artifact')).toBe(true);
    expect(reg.getAsset('ancient-artifact').name).toBe('Ancient Artifact');
  });

  it('overwrites an existing entry on re-register', () => {
    reg.register(ARTIFACT);
    reg.register({ ...ARTIFACT, name: 'Relic' });
    expect(reg.getAsset('ancient-artifact').name).toBe('Relic');
  });

  it('size reflects current count', () => {
    expect(reg.size).toBe(0);
    reg.register(ARTIFACT);
    expect(reg.size).toBe(1);
    reg.register(CHEST);
    expect(reg.size).toBe(2);
  });

  it('unregister removes the entry', () => {
    reg.register(ARTIFACT);
    reg.unregister('ancient-artifact');
    expect(reg.has('ancient-artifact')).toBe(false);
    expect(() => reg.getAsset('ancient-artifact')).toThrow(AssetNotFoundError);
  });

  it('unregister is a no-op for unknown id', () => {
    expect(() => reg.unregister('ghost')).not.toThrow();
  });

  it('register returns this for chaining', () => {
    const result = reg.register(ARTIFACT).register(CHEST);
    expect(result).toBe(reg);
    expect(reg.size).toBe(2);
  });
});

// ── findByCategory ────────────────────────────────────────────────────────────

describe('AssetRegistry.findByCategory', () => {
  it('returns only collectibles', () => {
    const results = AssetRegistry.default.findByCategory('collectible');
    expect(results.length).toBe(2);
    results.forEach(e => expect(e.category).toBe('collectible'));
  });

  it('returns only props', () => {
    const results = AssetRegistry.default.findByCategory('prop');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('signboard');
  });
});

// ── findByTags ────────────────────────────────────────────────────────────────

describe('AssetRegistry.findByTags', () => {
  it('finds by a single tag', () => {
    const results = AssetRegistry.default.findByTags('collectible');
    expect(results.length).toBe(2);
  });

  it('finds by multiple tags (AND logic)', () => {
    const results = AssetRegistry.default.findByTags('collectible', 'artifact');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('ancient-artifact');
  });

  it('returns empty for a tag that matches nothing', () => {
    expect(AssetRegistry.default.findByTags('dragon')).toHaveLength(0);
  });
});

// ── all ───────────────────────────────────────────────────────────────────────

describe('AssetRegistry.all', () => {
  it('default registry has exactly 3 entries', () => {
    expect(AssetRegistry.default.all()).toHaveLength(3);
  });

  it('returned array is a defensive copy', () => {
    const list = AssetRegistry.default.all();
    list.push({ ...CHEST, id: 'injected' });
    expect(AssetRegistry.default.size).toBe(3);
  });
});
