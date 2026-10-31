// Shared geospatial types used across Adventure Mode modules.

/** Axis-aligned bounding box in geographic degrees plus metric dimensions. */
export interface BoundingBox {
  north: number;
  south: number;
  east: number;
  west: number;
  widthM: number;
  heightM: number;
}

/**
 * A location the user has confirmed on the 3D map.
 * Stored in localStorage; keep fields JSON-serialisable and additive-only.
 */
export interface SelectedLocation {
  /** Stable identifier (crypto.randomUUID). */
  id: string;
  /** Human-readable label — may be the geocoded address or a user-supplied name. */
  label: string;
  /** Geographic bounding box of the selected region. */
  box: BoundingBox;
  /** Centre point derived from the box. */
  center: { lat: number; lon: number };
  /** Unix timestamp (ms) when the user confirmed this selection. */
  savedAt: number;
}
