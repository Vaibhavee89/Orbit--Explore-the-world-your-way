import { describe, it, expect } from 'vitest';
import { CharacterLibrary, CharacterNotFoundError } from '../CharacterLibrary';

const VALID_STATES = ['idle', 'walk', 'run', 'jump', 'fall'] as const;

describe('CharacterLibrary (catalog integrity)', () => {
  it('default library has at least 5 characters', () => {
    expect(CharacterLibrary.default.size).toBeGreaterThanOrEqual(5);
  });

  it('every entry has a non-empty id, name, and url', () => {
    for (const entry of CharacterLibrary.default.all()) {
      expect(entry.id.trim().length,  `"${entry.id}" id is empty`).toBeGreaterThan(0);
      expect(entry.name.trim().length, `"${entry.id}" name is empty`).toBeGreaterThan(0);
      expect(entry.url.trim().length,  `"${entry.id}" url is empty`).toBeGreaterThan(0);
    }
  });

  it('all ids are unique', () => {
    const ids = CharacterLibrary.default.all().map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all urls start with /', () => {
    for (const entry of CharacterLibrary.default.all()) {
      expect(entry.url, `"${entry.id}" url should be absolute`).toMatch(/^\//);
    }
  });

  it('clipAliases keys are valid AnimState values', () => {
    for (const entry of CharacterLibrary.default.all()) {
      if (!entry.clipAliases) continue;
      for (const key of Object.keys(entry.clipAliases)) {
        expect(VALID_STATES, `"${entry.id}" has unknown alias key "${key}"`).toContain(key);
      }
    }
  });

  it('clipAliases values are non-empty string arrays', () => {
    for (const entry of CharacterLibrary.default.all()) {
      if (!entry.clipAliases) continue;
      for (const [state, names] of Object.entries(entry.clipAliases)) {
        expect(Array.isArray(names), `"${entry.id}.${state}" aliases not an array`).toBe(true);
        expect((names as string[]).length, `"${entry.id}.${state}" aliases empty`).toBeGreaterThan(0);
        for (const n of names as string[]) {
          expect(typeof n).toBe('string');
          expect(n.trim().length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('soldier entry points to the bundled player.glb', () => {
    const soldier = CharacterLibrary.default.getCharacter('soldier');
    expect(soldier.url).toBe('/avatar/player.glb');
  });

  it('getCharacter() returns a defensive copy (mutation does not affect library)', () => {
    const e1 = CharacterLibrary.default.getCharacter('soldier');
    e1.name = 'mutated';
    const e2 = CharacterLibrary.default.getCharacter('soldier');
    expect(e2.name).toBe('Soldier');
  });

  it('has() returns true for known characters', () => {
    expect(CharacterLibrary.default.has('soldier')).toBe(true);
    expect(CharacterLibrary.default.has('xbot')).toBe(true);
  });

  it('has() returns false for unknown ids', () => {
    expect(CharacterLibrary.default.has('__nonexistent__')).toBe(false);
  });

  it('getCharacter() throws CharacterNotFoundError for unknown id', () => {
    expect(() => CharacterLibrary.default.getCharacter('__nonexistent__'))
      .toThrow(CharacterNotFoundError);
  });

  it('all() length matches size', () => {
    const lib = CharacterLibrary.default;
    expect(lib.all().length).toBe(lib.size);
  });

  it('custom library can be constructed with arbitrary entries', () => {
    const lib = new CharacterLibrary([
      { id: 'custom', name: 'Custom', url: '/assets/characters/custom.glb' },
    ]);
    expect(lib.size).toBe(1);
    expect(lib.getCharacter('custom').name).toBe('Custom');
  });
});
