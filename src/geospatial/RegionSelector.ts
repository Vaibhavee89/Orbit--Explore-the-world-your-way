import L from 'leaflet';
import type { BoundingBox } from './types';

// Re-export so existing callers importing BoundingBox from here still work.
export type { BoundingBox } from './types';

export type RegionPhase = 'idle' | 'drawing' | 'drawn';

export interface RegionState {
  phase: RegionPhase;
  box: BoundingBox | null;
}

export class RegionConfirmedEvent extends CustomEvent<BoundingBox> {
  constructor(box: BoundingBox) {
    super('region-confirmed', { detail: box, bubbles: true, composed: true });
  }
}

export class RegionDrawingEvent extends CustomEvent<RegionState> {
  constructor(state: RegionState) {
    super('region-drawing', { detail: state, bubbles: true, composed: true });
  }
}

// ── constants ────────────────────────────────────────────────────────────────

const MAX_M = 500;
const M_PER_DEG_LAT = 111_320;

// ── RegionSelector ───────────────────────────────────────────────────────────

/**
 * Attaches click-and-drag rectangle selection to a Leaflet Map.
 * Snaps the selected region to ≤ 500 m × 500 m.
 */
export class RegionSelector {
  private readonly map: L.Map;
  private readonly onChange: (state: RegionState) => void;

  private rect: L.Rectangle | null = null;
  private startLat: number | null = null;
  private startLon: number | null = null;
  private _box: BoundingBox | null = null;
  private _dragging = false;
  private _phase: RegionPhase = 'idle';

  constructor(map: L.Map, onChange: (state: RegionState) => void) {
    this.map = map;
    this.onChange = onChange;
  }

  get phase() { return this._phase; }
  get box() { return this._box; }

  // ── public API ──────────────────────────────────────────────────────────────

  activate() {
    this._phase = 'idle';
    this._box = null;
    const container = this.map.getContainer();
    container.style.cursor = 'crosshair';

    this.map.on('mousedown', this._onDown, this);
    this.map.on('mousemove', this._onMove, this);
    this.map.on('mouseup', this._onUp, this);
    this.map.dragging.disable();
  }

  deactivate() {
    const container = this.map.getContainer();
    container.style.cursor = '';
    this.map.off('mousedown', this._onDown, this);
    this.map.off('mousemove', this._onMove, this);
    this.map.off('mouseup', this._onUp, this);
    this.map.dragging.enable();
    this._clearRect();
    this.startLat = null;
    this.startLon = null;
    this._dragging = false;
    this._phase = 'idle';
    this._box = null;
  }

  destroy() {
    this.deactivate();
  }

  confirm(): BoundingBox | null {
    return this._box;
  }

  cancel() {
    this._clearRect();
    this._box = null;
    this.startLat = null;
    this.startLon = null;
    this._dragging = false;
    this._phase = 'idle';
    this.onChange({ phase: 'idle', box: null });
  }

  private _onDown = (e: L.LeafletMouseEvent) => {
    const { lat, lng } = e.latlng;
    this._clearRect();
    this.startLat = lat;
    this.startLon = lng;
    this._dragging = true;
    this._phase = 'drawing';
  };

  private _onMove = (e: L.LeafletMouseEvent) => {
    if (!this._dragging || this.startLat === null || this.startLon === null) return;
    const { lat, lng } = e.latlng;
    this._box = this._computeBox(this.startLat, this.startLon, lat, lng);
    this._ensureRect();
    this.onChange({ phase: 'drawing', box: this._box });
  };

  private _onUp = (e: L.LeafletMouseEvent) => {
    if (!this._dragging || this.startLat === null || this.startLon === null) return;
    const { lat, lng } = e.latlng;
    this._box = this._computeBox(this.startLat, this.startLon, lat, lng);
    this._ensureRect();
    this._dragging = false;
    this._phase = 'drawn';
    this.onChange({ phase: 'drawn', box: this._box });
  };

  private _computeBox(startLat: number, startLon: number, endLat: number, endLon: number): BoundingBox {
    const midLat = (startLat + endLat) / 2;
    const mPerDegLon = M_PER_DEG_LAT * Math.cos(midLat * Math.PI / 180);

    const rawLatM = (endLat - startLat) * M_PER_DEG_LAT;
    const rawLonM = (endLon - startLon) * mPerDegLon;

    const clampedLatM = Math.sign(rawLatM || 1) * Math.min(Math.abs(rawLatM), MAX_M);
    const clampedLonM = Math.sign(rawLonM || 1) * Math.min(Math.abs(rawLonM), MAX_M);

    const endLatDeg = startLat + clampedLatM / M_PER_DEG_LAT;
    const endLonDeg = startLon + clampedLonM / mPerDegLon;

    return {
      north: Math.max(startLat, endLatDeg),
      south: Math.min(startLat, endLatDeg),
      east: Math.max(startLon, endLonDeg),
      west: Math.min(startLon, endLonDeg),
      widthM: Math.abs(clampedLonM),
      heightM: Math.abs(clampedLatM),
    };
  }

  private _ensureRect() {
    if (this.rect || !this._box) return;
    const { north, south, east, west } = this._box;
    this.rect = L.rectangle([[south, west], [north, east]], {
      color: '#00FFFF',
      weight: 2,
      opacity: 0.95,
      fillColor: '#00FFFF',
      fillOpacity: 0.18,
    }).addTo(this.map);
  }

  private _clearRect() {
    if (this.rect) {
      this.map.removeLayer(this.rect);
      this.rect = null;
    }
  }
}
