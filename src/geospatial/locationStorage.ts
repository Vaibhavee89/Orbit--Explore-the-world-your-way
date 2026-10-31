import type { SelectedLocation, BoundingBox } from './types';

const STORAGE_KEY = 'orbit_selected_locations_v1';
const MAX_SAVED = 5;

function readRaw(): SelectedLocation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRaw(items: SelectedLocation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Storage quota exceeded or private-browsing block — silently ignore.
  }
}

/** Return all saved locations, newest first. */
export function loadLocations(): SelectedLocation[] {
  return readRaw();
}

/** Return the most recently saved location, or null. */
export function loadLastLocation(): SelectedLocation | null {
  const items = readRaw();
  return items[0] ?? null;
}

/** Prepend a new location; keeps only the last MAX_SAVED entries. */
export function saveLocation(
  box: BoundingBox,
  label: string,
): SelectedLocation {
  const location: SelectedLocation = {
    id: crypto.randomUUID(),
    label,
    box,
    center: {
      lat: (box.north + box.south) / 2,
      lon: (box.east + box.west) / 2,
    },
    savedAt: Date.now(),
  };

  const existing = readRaw().filter(l => l.id !== location.id);
  writeRaw([location, ...existing].slice(0, MAX_SAVED));
  return location;
}

/** Remove a location by id. */
export function removeLocation(id: string): void {
  writeRaw(readRaw().filter(l => l.id !== id));
}

/** Clear all saved locations. */
export function clearLocations(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
