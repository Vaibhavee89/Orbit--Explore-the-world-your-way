import {
  Viewer,
  Cartesian2,
  Cartographic,
  Rectangle,
  Entity,
  Color,
  ColorMaterialProperty,
  CallbackProperty,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  Math as CesiumMath,
} from 'cesium';
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
 * Attaches click-and-drag rectangle selection to a Cesium Viewer.
 * Snaps the selected region to ≤ 500 m × 500 m.
 *
 * Usage:
 *   const sel = new RegionSelector(viewer, onChange);
 *   sel.activate();
 *   // user drags...
 *   const box = sel.confirm();   // returns BoundingBox
 *   sel.deactivate();
 *   sel.destroy();
 */
export class RegionSelector {
  private readonly viewer: Viewer;
  private readonly handler: ScreenSpaceEventHandler;
  private readonly onChange: (state: RegionState) => void;

  private entity: Entity | null = null;
  private startCarto: Cartographic | null = null;
  private _box: BoundingBox | null = null;
  private _baseHeight = 0;
  private _dragging = false;
  private _phase: RegionPhase = 'idle';

  constructor(viewer: Viewer, onChange: (state: RegionState) => void) {
    this.viewer = viewer;
    this.onChange = onChange;
    this.handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  }

  get phase() { return this._phase; }
  get box() { return this._box; }

  // ── public API ──────────────────────────────────────────────────────────────

  activate() {
    this._phase = 'idle';
    this._box = null;
    this.viewer.scene.canvas.style.cursor = 'crosshair';
    // Disable default camera drag while drawing.
    this.viewer.scene.screenSpaceCameraController.enableRotate = false;
    this.viewer.scene.screenSpaceCameraController.enableTranslate = false;

    this.handler.setInputAction(
      (e: { position: Cartesian2 }) => this._onDown(e.position),
      ScreenSpaceEventType.LEFT_DOWN,
    );
    this.handler.setInputAction(
      (e: { endPosition: Cartesian2 }) => this._onMove(e.endPosition),
      ScreenSpaceEventType.MOUSE_MOVE,
    );
    this.handler.setInputAction(
      (e: { position: Cartesian2 }) => this._onUp(e.position),
      ScreenSpaceEventType.LEFT_UP,
    );
  }

  deactivate() {
    this.viewer.scene.canvas.style.cursor = '';
    this.viewer.scene.screenSpaceCameraController.enableRotate = true;
    this.viewer.scene.screenSpaceCameraController.enableTranslate = true;
    this.handler.removeInputAction(ScreenSpaceEventType.LEFT_DOWN);
    this.handler.removeInputAction(ScreenSpaceEventType.MOUSE_MOVE);
    this.handler.removeInputAction(ScreenSpaceEventType.LEFT_UP);
    this._clearEntity();
    this.startCarto = null;
    this._dragging = false;
    this._phase = 'idle';
    this._box = null;
  }

  destroy() {
    this.deactivate();
    if (!this.handler.isDestroyed()) this.handler.destroy();
  }

  confirm(): BoundingBox | null {
    return this._box;
  }

  cancel() {
    this._clearEntity();
    this._box = null;
    this.startCarto = null;
    this._dragging = false;
    this._phase = 'idle';
    this.onChange({ phase: 'idle', box: null });
  }

  // ── mouse handlers ──────────────────────────────────────────────────────────

  private _onDown(pos: Cartesian2) {
    const carto = this._pick(pos);
    if (!carto) return;
    this._clearEntity();
    this.startCarto = carto;
    this._baseHeight = carto.height;
    this._dragging = true;
    this._phase = 'drawing';
  }

  private _onMove(pos: Cartesian2) {
    if (!this._dragging || !this.startCarto) return;
    const endCarto = this._pick(pos);
    if (!endCarto) return;
    this._box = this._computeBox(this.startCarto, endCarto);
    this._ensureEntity();
    this.onChange({ phase: 'drawing', box: this._box });
  }

  private _onUp(pos: Cartesian2) {
    if (!this._dragging || !this.startCarto) return;
    const endCarto = this._pick(pos) ?? this.startCarto;
    this._box = this._computeBox(this.startCarto, endCarto);
    this._ensureEntity();
    this._dragging = false;
    this._phase = 'drawn';
    this.onChange({ phase: 'drawn', box: this._box });
  }

  // ── geometry ────────────────────────────────────────────────────────────────

  private _pick(screenPos: Cartesian2): Cartographic | null {
    const world = this.viewer.scene.pickPosition(screenPos);
    if (!world) return null;
    return Cartographic.fromCartesian(world);
  }

  private _computeBox(start: Cartographic, end: Cartographic): BoundingBox {
    const midLat = (start.latitude + end.latitude) / 2;
    const mPerDegLon = M_PER_DEG_LAT * Math.cos(midLat);

    const rawLatM = (end.latitude - start.latitude) * M_PER_DEG_LAT;
    const rawLonM = (end.longitude - start.longitude) * mPerDegLon;

    // Clamp each axis to 500 m, preserving sign.
    const clampedLatM = Math.sign(rawLatM || 1) * Math.min(Math.abs(rawLatM), MAX_M);
    const clampedLonM = Math.sign(rawLonM || 1) * Math.min(Math.abs(rawLonM), MAX_M);

    const startLatDeg = CesiumMath.toDegrees(start.latitude);
    const startLonDeg = CesiumMath.toDegrees(start.longitude);
    const endLatDeg = startLatDeg + clampedLatM / M_PER_DEG_LAT;
    const endLonDeg = startLonDeg + clampedLonM / mPerDegLon;

    return {
      north: Math.max(startLatDeg, endLatDeg),
      south: Math.min(startLatDeg, endLatDeg),
      east: Math.max(startLonDeg, endLonDeg),
      west: Math.min(startLonDeg, endLonDeg),
      widthM: Math.abs(clampedLonM),
      heightM: Math.abs(clampedLatM),
    };
  }

  // ── entity drawing ──────────────────────────────────────────────────────────

  private _ensureEntity() {
    if (this.entity) return; // CallbackProperty reads this._box live
    const h = this._baseHeight;

    this.entity = this.viewer.entities.add({
      rectangle: {
        // CallbackProperty so the rectangle reacts to this._box changes
        // without re-creating the entity on every mouse-move.
        coordinates: new CallbackProperty(() => {
          if (!this._box) return undefined;
          return Rectangle.fromDegrees(
            this._box.west, this._box.south,
            this._box.east, this._box.north,
          );
        }, false),
        material: new ColorMaterialProperty(Color.CYAN.withAlpha(0.18)),
        outline: true,
        outlineColor: Color.CYAN.withAlpha(0.95),
        outlineWidth: 2,
        // Render as a thin slab above the tileset surface.
        height: h,
        extrudedHeight: h + 8,
      },
    });
  }

  private _clearEntity() {
    if (this.entity) {
      this.viewer.entities.remove(this.entity);
      this.entity = null;
    }
  }
}
