import type { Quest } from '../quest/Quest';
import type { XpChangeEvent } from '../progression/XpManager';

export interface EventMap {
  'quest:completed': { quest: Quest };
  'xp:gained': XpChangeEvent;
  'player:died': { reason: string };
  'item:collected': { assetId: string };
  'landmark:discovered': { id: string; name: string; xpReward: number };
}

type EventHandler<K extends keyof EventMap> = (data: EventMap[K]) => void;

/**
 * Global event bus for game events.
 * Usage: EventBus.emit('quest:completed', { quest });
 *        EventBus.on('xp:gained', (data) => console.log(data));
 */
export class EventBus {
  private static _listeners: Map<keyof EventMap, EventHandler<any>[]> = new Map();

  static on<K extends keyof EventMap>(event: K, handler: EventHandler<K>): void {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event)!.push(handler);
  }

  static off<K extends keyof EventMap>(event: K, handler: EventHandler<K>): void {
    const handlers = this._listeners.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx !== -1) handlers.splice(idx, 1);
    }
  }

  static emit<K extends keyof EventMap>(event: K, data: EventMap[K]): void {
    const handlers = this._listeners.get(event);
    if (handlers) {
      handlers.forEach(h => h(data));
    }
  }

  static clear(): void {
    this._listeners.clear();
  }
}
