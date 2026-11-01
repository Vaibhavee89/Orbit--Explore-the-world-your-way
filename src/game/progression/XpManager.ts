/**
 * XP and level progression system.
 * Uses exponential level curve: XP_for_level(n) = 100 * n^1.5
 */

export type XpChangeHandler = (data: XpChangeEvent) => void;

export interface XpChangeEvent {
  xpGained: number;
  totalXp: number;
  level: number;
  leveledUp: boolean;
  previousLevel?: number;
}

export class XpManager {
  private _totalXp = 0;
  private _level = 1;
  private _handlers: XpChangeHandler[] = [];

  /** XP required to reach each level. */
  static xpForLevel(level: number): number {
    return Math.floor(100 * Math.pow(level, 1.5));
  }

  /** Current level based on total XP. */
  static levelFromXp(totalXp: number): number {
    let level = 1;
    while (XpManager.xpForLevel(level + 1) <= totalXp) {
      level++;
    }
    return level;
  }

  get totalXp(): number { return this._totalXp; }
  get level(): number { return this._level; }

  /** XP needed to reach next level. */
  get xpToNextLevel(): number {
    return XpManager.xpForLevel(this._level + 1) - this._totalXp;
  }

  /** Progress to next level (0-1). */
  get progressToNextLevel(): number {
    const current = this._totalXp;
    const nextLevelXp = XpManager.xpForLevel(this._level + 1);
    const currentLevelXp = this._level === 1 ? 0 : XpManager.xpForLevel(this._level);
    return (current - currentLevelXp) / (nextLevelXp - currentLevelXp);
  }

  /** Add XP and trigger level-up if applicable. */
  addXp(amount: number): XpChangeEvent {
    const previousLevel = this._level;
    this._totalXp += amount;
    this._level = XpManager.levelFromXp(this._totalXp);

    const event: XpChangeEvent = {
      xpGained: amount,
      totalXp: this._totalXp,
      level: this._level,
      leveledUp: this._level > previousLevel,
      previousLevel: this._level > previousLevel ? previousLevel : undefined,
    };

    if (this._level > previousLevel) {
      console.info(`[XpManager] Level up! ${previousLevel} → ${this._level}`);
    }

    this._handlers.forEach(h => h(event));
    return event;
  }

  /** Subscribe to XP changes. */
  onChange(handler: XpChangeHandler): void {
    this._handlers.push(handler);
  }

  /** Unsubscribe from XP changes. */
  offChange(handler: XpChangeHandler): void {
    const idx = this._handlers.indexOf(handler);
    if (idx !== -1) this._handlers.splice(idx, 1);
  }

  /** Reset to level 1, 0 XP. */
  reset(): void {
    this._totalXp = 0;
    this._level = 1;
  }
}
