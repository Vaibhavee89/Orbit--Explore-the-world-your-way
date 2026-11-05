import type { Quest } from './Quest';
import { EventBus } from '../core/EventBus';
import { XpManager } from '../progression/XpManager';

/**
 * Manages active quests, tracks completion, and rewards XP.
 */
export class QuestManager {
  private _activeQuests: Quest[] = [];
  private _completedQuests: Set<string> = new Set();
  private _xpManager: XpManager;

  constructor(xpManager: XpManager) {
    this._xpManager = xpManager;
  }

  /** Add a quest to the active list. */
  addQuest(quest: Quest): void {
    if (!this._activeQuests.find(q => q.id === quest.id)) {
      this._activeQuests.push(quest);
      console.info(`[QuestManager] Added quest: ${quest.title}`);
    }
  }

  /** Complete a quest and award XP. */
  completeQuest(questId: string): boolean {
    const quest = this._activeQuests.find(q => q.id === questId);
    if (!quest) return false;

    if (this._completedQuests.has(questId)) return false;

    // Award XP
    const xpEvent = this._xpManager.addXp(quest.reward.xp);

    // Emit events
    EventBus.emit('quest:completed', { quest });
    EventBus.emit('xp:gained', xpEvent);

    // Mark as completed
    this._completedQuests.add(questId);
    this._activeQuests = this._activeQuests.filter(q => q.id !== questId);

    console.info(`[QuestManager] Quest completed: ${quest.title} (+${quest.reward.xp} XP)`);
    return true;
  }

  get activeQuests(): readonly Quest[] {
    return [...this._activeQuests];
  }

  get completedCount(): number {
    return this._completedQuests.size;
  }

  clear(): void {
    this._activeQuests = [];
    this._completedQuests.clear();
  }
}
