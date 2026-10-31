export interface InventoryItem {
  assetId:     string;
  collectedAt: number;              // Date.now() ms
  enu:         { e: number; n: number }; // world position where it was picked up
}

export type InventoryChangeHandler = (item: InventoryItem, inventory: Inventory) => void;

/**
 * In-memory inventory — tracks items picked up during an Adventure Mode session.
 *
 * Items persist for the lifetime of the Inventory instance (one per game session).
 * Wire the onAdd handler for UI updates; read .items for the full list.
 */
export class Inventory {
  private _items:   InventoryItem[] = [];
  private _handler: InventoryChangeHandler | null = null;

  /** Called each time an item is added. */
  onAdd(handler: InventoryChangeHandler): void {
    this._handler = handler;
  }

  add(assetId: string, enu: { e: number; n: number }): InventoryItem {
    const item: InventoryItem = { assetId, collectedAt: Date.now(), enu };
    this._items.push(item);
    console.info(`[Inventory] +${assetId} (total: ${this._items.length})`);
    this._handler?.(item, this);
    return item;
  }

  remove(assetId: string): boolean {
    const idx = this._items.findIndex(i => i.assetId === assetId);
    if (idx === -1) return false;
    this._items.splice(idx, 1);
    return true;
  }

  has(assetId: string): boolean {
    return this._items.some(i => i.assetId === assetId);
  }

  /** All collected items (defensive copy). */
  get items(): readonly InventoryItem[] { return [...this._items]; }

  get size(): number { return this._items.length; }

  clear(): void { this._items = []; }
}
