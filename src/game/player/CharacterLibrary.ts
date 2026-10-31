import type { AnimState } from './AnimationController';

/**
 * Per-character clip name overrides.
 * Each state maps to a prioritised list of clip names to try (case-insensitive).
 * Missing states fall back to the global CLIP_CANDIDATES table in Player.ts.
 */
export type ClipAliases = Partial<Record<AnimState, string[]>>;

export interface CharacterEntry {
  /** Stable id used for selection and persistence. */
  id:   string;
  /** Display name shown in character selection UI. */
  name: string;
  /** Path relative to the web root, e.g. "/assets/characters/xbot.glb". */
  url:  string;
  /**
   * Clip name overrides for this rig.
   * Only provide states where the default candidates (in Player.ts) would not match.
   */
  clipAliases?: ClipAliases;
}

export class CharacterNotFoundError extends Error {
  constructor(id: string) {
    super(`Character "${id}" not found in the library`);
    this.name = 'CharacterNotFoundError';
  }
}

/**
 * Catalogue of available player avatars.
 *
 * Adding a new character:
 *   1. Export the rigged GLB to public/assets/characters/<id>.glb
 *   2. Add an entry here with any clip name overrides required.
 *
 * Clip alias notes per source:
 *   Mixamo:      clips named by the Mixamo animation name you selected when exporting.
 *                Typical: "Idle", "Walking", "Running", "Jump", "Falling Idle"
 *   Quaternius:  clips named "Idle", "Walk", "Run", "Jump" — default candidates cover these.
 *   Ready Player Me (static free): same bone structure as Mixamo; same clip naming.
 */
export class CharacterLibrary {
  private _entries: Map<string, CharacterEntry> = new Map();

  constructor(entries: CharacterEntry[]) {
    for (const e of entries) this._entries.set(e.id, e);
  }

  getCharacter(id: string): CharacterEntry {
    const entry = this._entries.get(id);
    if (!entry) throw new CharacterNotFoundError(id);
    return { ...entry };
  }

  has(id: string): boolean {
    return this._entries.has(id);
  }

  all(): readonly CharacterEntry[] {
    return [...this._entries.values()];
  }

  get size(): number { return this._entries.size; }

  // ── Default library ────────────────────────────────────────────────────────

  /**
   * Pre-populated library of free CC0/CC-BY characters.
   *
   * Download sources (all free, no account required unless noted):
   *
   *   soldier      — public/avatar/player.glb (already bundled — Three.js Soldier CC0)
   *
   *   xbot         — Mixamo X Bot (requires free Adobe account)
   *                  mixamo.com → Characters → "X Bot"
   *                  Download as GLB with skin + ALL animations embedded.
   *                  Save as: public/assets/characters/xbot.glb
   *
   *   ybot         — Mixamo Y Bot (requires free Adobe account)
   *                  mixamo.com → Characters → "Y Bot"
   *                  Same export settings as xbot.
   *                  Save as: public/assets/characters/ybot.glb
   *
   *   adventurer   — Quaternius "Animated Characters Pack" (CC0, no account)
   *                  quaternius.com/packs/animated-characters
   *                  Take the "Adventurer" GLB; it ships with idle/walk/run/jump embedded.
   *                  Save as: public/assets/characters/adventurer.glb
   *
   *   explorer     — Quaternius "Ultimate Animated Characters" (CC0)
   *                  quaternius.com/packs/ultimate-animated-character-pack
   *                  Take any "Explorer" or "Soldier" variant.
   *                  Save as: public/assets/characters/explorer.glb
   *
   * Animation clip verification (run `npx gltf-transform inspect <file>.glb`):
   *   Each GLB must have clips for at least idle + walk. Jump/fall are optional —
   *   the AnimationController falls back through [fall → jump → run → walk → idle].
   */
  static readonly default: CharacterLibrary = new CharacterLibrary([
    {
      id:   'soldier',
      name: 'Soldier',
      url:  '/avatar/player.glb',
      // Three.js Soldier ships with "Idle", "Walk", "Run" — all match defaults.
    },
    {
      id:   'xbot',
      name: 'X Bot',
      url:  '/assets/characters/xbot.glb',
      // Mixamo X Bot clips when exported with animations:
      // jump clip is often "Jump" (covered) but fall may differ.
      clipAliases: {
        fall: ['Falling Idle', 'Falling Back Idle', 'fall', 'Fall'],
      },
    },
    {
      id:   'ybot',
      name: 'Y Bot',
      url:  '/assets/characters/ybot.glb',
      clipAliases: {
        fall: ['Falling Idle', 'Falling Back Idle', 'fall', 'Fall'],
      },
    },
    {
      id:   'adventurer',
      name: 'Adventurer',
      url:  '/assets/characters/adventurer.glb',
      // Quaternius clip names are short and match the default candidates exactly.
    },
    {
      id:   'explorer',
      name: 'Explorer',
      url:  '/assets/characters/explorer.glb',
    },
  ]);
}
