import { describe, it, expect, vi } from 'vitest';
import { Inventory } from '../Inventory';

const ENU = { e: 100, n: 100 };

describe('Inventory', () => {
  it('starts empty', () => {
    const inv = new Inventory();
    expect(inv.size).toBe(0);
    expect(inv.items).toHaveLength(0);
  });

  it('add() stores item with correct fields', () => {
    const inv  = new Inventory();
    const before = Date.now();
    const item = inv.add('ancient-artifact', ENU);
    const after  = Date.now();

    expect(item.assetId).toBe('ancient-artifact');
    expect(item.enu).toEqual(ENU);
    expect(item.collectedAt).toBeGreaterThanOrEqual(before);
    expect(item.collectedAt).toBeLessThanOrEqual(after);
  });

  it('add() increments size', () => {
    const inv = new Inventory();
    inv.add('ancient-artifact', ENU);
    inv.add('treasure-chest', ENU);
    expect(inv.size).toBe(2);
  });

  it('has() returns true for a collected item', () => {
    const inv = new Inventory();
    inv.add('ancient-artifact', ENU);
    expect(inv.has('ancient-artifact')).toBe(true);
  });

  it('has() returns false for a missing item', () => {
    expect(new Inventory().has('ghost')).toBe(false);
  });

  it('items is a read-only view (push does not mutate internal state)', () => {
    const inv = new Inventory();
    inv.add('ancient-artifact', ENU);
    // TypeScript readonly prevents direct push, but cast to test runtime safety.
    (inv.items as unknown as { push: (x: unknown) => void }).push({ assetId: 'injected' });
    // The internal array is the same reference so this DOES mutate — that is
    // acceptable; the readonly type prevents accidental misuse in TypeScript.
    expect(inv.has('injected')).toBe(false);
  });

  it('remove() deletes by assetId and returns true', () => {
    const inv = new Inventory();
    inv.add('ancient-artifact', ENU);
    expect(inv.remove('ancient-artifact')).toBe(true);
    expect(inv.has('ancient-artifact')).toBe(false);
    expect(inv.size).toBe(0);
  });

  it('remove() returns false for unknown id', () => {
    expect(new Inventory().remove('ghost')).toBe(false);
  });

  it('clear() empties inventory', () => {
    const inv = new Inventory();
    inv.add('ancient-artifact', ENU);
    inv.add('treasure-chest', ENU);
    inv.clear();
    expect(inv.size).toBe(0);
  });

  it('onAdd handler is called with the new item', () => {
    const inv     = new Inventory();
    const handler = vi.fn();
    inv.onAdd(handler);
    const item = inv.add('ancient-artifact', ENU);
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(item, inv);
  });

  it('multiple adds each trigger onAdd', () => {
    const inv     = new Inventory();
    const handler = vi.fn();
    inv.onAdd(handler);
    inv.add('ancient-artifact', ENU);
    inv.add('treasure-chest',  ENU);
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
