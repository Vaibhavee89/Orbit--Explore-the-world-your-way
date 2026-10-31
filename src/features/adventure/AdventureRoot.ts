import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { OrbitCesiumViewer } from '../../geospatial/CesiumViewer';
import { LocationSelectedEvent } from '../../geospatial/LocationSelector';
import type { GeoResult } from '../../geospatial/LocationSelector';
import '../../geospatial/LocationSelector';
import { RegionSelector } from '../../geospatial/RegionSelector';
import type { BoundingBox, RegionPhase } from '../../geospatial/RegionSelector';

// Manali, Himachal Pradesh — initial view.
const INITIAL_LAT = 32.2432;
const INITIAL_LON = 77.1892;
const INITIAL_NAME = 'Manali, Himachal Pradesh';

@customElement('orbit-adventure-root')
export class AdventureRoot extends LitElement {
  // Cesium mounts into a real DOM node — disable shadow DOM so the
  // Cesium widget CSS (served from /cesium/…) can reach the container.
  createRenderRoot() { return this; }

  @state() private _status: 'loading' | 'ready' | 'error' = 'loading';
  @state() private _errorMsg = '';
  @state() private _currentLocation = INITIAL_NAME;
  @state() private _regionPhase: RegionPhase = 'idle';
  @state() private _regionBox: BoundingBox | null = null;

  private _cesium: OrbitCesiumViewer | null = null;
  private _container: HTMLDivElement | null = null;
  private _apiKey = '';
  private _regionSel: RegionSelector | null = null;

  // Styles injected into <head> because shadow DOM is off.
  connectedCallback() {
    super.connectedCallback();
    this._injectStyles();
  }

  private _injectStyles() {
    if (document.getElementById('orbit-adventure-styles')) return;
    const style = document.createElement('style');
    style.id = 'orbit-adventure-styles';
    style.textContent = `
      orbit-adventure-root {
        display: block;
        position: relative;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: #000;
        font-family: 'Google Sans Text', sans-serif;
      }
      .adv-cesium-container {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
      }
      .adv-hud {
        position: absolute;
        top: 16px;
        left: 16px;
        z-index: 10;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .adv-badge {
        display: inline-block;
        background: rgba(10,10,26,0.75);
        backdrop-filter: blur(6px);
        color: #a78bfa;
        font-size: 0.7rem;
        letter-spacing: 0.15em;
        text-transform: uppercase;
        padding: 4px 12px;
        border-radius: 999px;
        border: 1px solid #a78bfa44;
      }
      .adv-location {
        background: rgba(10,10,26,0.75);
        backdrop-filter: blur(6px);
        color: #e0e0ff;
        font-size: 0.8rem;
        padding: 6px 12px;
        border-radius: 8px;
      }
      .adv-switch-link {
        position: absolute;
        bottom: 16px;
        left: 16px;
        z-index: 10;
        font-size: 0.8rem;
        color: #7c7cff;
        text-decoration: none;
        background: rgba(10,10,26,0.75);
        backdrop-filter: blur(6px);
        border: 1px solid #7c7cff44;
        padding: 6px 14px;
        border-radius: 999px;
      }
      .adv-overlay {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0a0a1a;
        color: #9090bb;
        font-size: 0.9rem;
        z-index: 20;
        flex-direction: column;
        gap: 12px;
      }
      .adv-overlay.hidden { display: none; }
      .adv-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #a78bfa44;
        border-top-color: #a78bfa;
        border-radius: 50%;
        animation: adv-spin 0.8s linear infinite;
      }
      @keyframes adv-spin { to { transform: rotate(360deg); } }
      /* Google attribution must be visible per T&C — Cesium renders it in
         .cesium-credit-container; ensure it stays above our overlay. */
      .cesium-credit-container { z-index: 30 !important; }

      /* ── LocationSelector styles ── */
      orbit-location-selector { display: block; }
      .ls-wrap {
        position: relative;
        width: 320px;
      }
      .ls-input-row {
        display: flex;
        align-items: center;
        background: rgba(10,10,26,0.85);
        backdrop-filter: blur(8px);
        border: 1px solid #a78bfa44;
        border-radius: 10px;
        padding: 6px 10px;
        gap: 6px;
      }
      .ls-icon { font-size: 0.9rem; flex-shrink: 0; }
      .ls-input {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: #e0e0ff;
        font-size: 0.875rem;
        font-family: inherit;
      }
      .ls-input::placeholder { color: #6060aa; }
      .ls-clear {
        background: transparent;
        border: none;
        color: #6060aa;
        cursor: pointer;
        font-size: 0.75rem;
        padding: 0 2px;
        line-height: 1;
      }
      .ls-clear:hover { color: #e0e0ff; }
      .ls-dropdown {
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        background: rgba(10,10,26,0.95);
        backdrop-filter: blur(12px);
        border: 1px solid #a78bfa44;
        border-radius: 10px;
        list-style: none;
        margin: 0;
        padding: 4px 0;
        z-index: 50;
        max-height: 260px;
        overflow-y: auto;
      }
      .ls-option {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 8px 12px;
        cursor: pointer;
        font-size: 0.8rem;
        color: #c0c0e0;
        transition: background 0.1s;
      }
      .ls-option:hover, .ls-option--active { background: #a78bfa22; color: #e0e0ff; }
      .ls-pin { flex-shrink: 0; margin-top: 1px; }
      .ls-name { line-height: 1.4; }

      /* ── RegionSelector HUD ── */
      .rs-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(10,10,26,0.85);
        backdrop-filter: blur(8px);
        border: 1px solid #38bdf844;
        color: #38bdf8;
        font-size: 0.8rem;
        font-family: inherit;
        padding: 6px 14px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      }
      .rs-btn:hover { background: #38bdf822; border-color: #38bdf8aa; }
      .rs-btn:disabled { opacity: 0.4; cursor: default; }
      .rs-btn.rs-btn--active { border-color: #f87171; color: #f87171; }
      .rs-panel {
        background: rgba(10,10,26,0.88);
        backdrop-filter: blur(10px);
        border: 1px solid #38bdf844;
        border-radius: 10px;
        padding: 10px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 260px;
      }
      .rs-hint {
        font-size: 0.75rem;
        color: #7090aa;
        line-height: 1.5;
      }
      .rs-dims {
        font-size: 0.8rem;
        color: #38bdf8;
        font-variant-numeric: tabular-nums;
      }
      .rs-coords {
        font-size: 0.7rem;
        color: #7090aa;
        font-variant-numeric: tabular-nums;
        line-height: 1.6;
      }
      .rs-actions {
        display: flex;
        gap: 8px;
      }
      .rs-confirm {
        flex: 1;
        background: #38bdf8;
        color: #0a0a1a;
        border: none;
        border-radius: 6px;
        padding: 6px 0;
        font-size: 0.8rem;
        font-family: inherit;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .rs-confirm:hover { opacity: 0.85; }
      .rs-cancel {
        background: transparent;
        border: 1px solid #f8717144;
        color: #f87171;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 0.8rem;
        font-family: inherit;
        cursor: pointer;
        transition: background 0.15s;
      }
      .rs-cancel:hover { background: #f8717122; }
      .rs-result {
        background: rgba(10,10,26,0.88);
        backdrop-filter: blur(10px);
        border: 1px solid #a78bfa44;
        border-radius: 10px;
        padding: 10px 14px;
        min-width: 260px;
      }
      .rs-result-title {
        font-size: 0.7rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: #a78bfa;
        margin-bottom: 6px;
      }
      .rs-result-body {
        font-size: 0.75rem;
        color: #c0c0e0;
        font-variant-numeric: tabular-nums;
        line-height: 1.8;
      }
      .rs-result-actions { margin-top: 8px; display: flex; gap: 8px; }
      .rs-new-btn {
        font-size: 0.75rem;
        color: #38bdf8;
        background: transparent;
        border: 1px solid #38bdf844;
        border-radius: 6px;
        padding: 4px 10px;
        cursor: pointer;
        font-family: inherit;
      }
      .rs-new-btn:hover { background: #38bdf822; }
    `;
    document.head.appendChild(style);
  }

  render() {
    const b = this._regionBox;
    return html`
      <div class="adv-cesium-container" id="adv-cesium"></div>

      <div class="adv-hud">
        <span class="adv-badge">Orbit Adventure — Alpha</span>

        ${this._status === 'ready' ? html`
          <!-- Search -->
          <orbit-location-selector
            .apiKey=${this._apiKey}
            @location-selected=${this._onLocationSelected}
          ></orbit-location-selector>
          <div class="adv-location">📍 ${this._currentLocation}</div>

          <!-- Region selector trigger -->
          ${this._regionPhase === 'idle' ? html`
            <button class="rs-btn" @click=${this._startRegion}>
              ⬚ Select Region
            </button>
          ` : ''}

          <!-- Active drawing panel -->
          ${this._regionPhase === 'drawing' ? html`
            <div class="rs-panel">
              <span class="rs-hint">Click &amp; drag to draw a rectangle.<br>Max 500 m × 500 m.</span>
              ${b ? html`
                <div class="rs-dims">
                  ${b.widthM.toFixed(0)} m × ${b.heightM.toFixed(0)} m
                </div>
              ` : ''}
              <div class="rs-actions">
                <button class="rs-cancel" @click=${this._cancelRegion}>Cancel</button>
              </div>
            </div>
          ` : ''}

          <!-- Drawn → confirm panel -->
          ${this._regionPhase === 'drawn' && b ? html`
            <div class="rs-panel">
              <div class="rs-dims">⬚ ${b.widthM.toFixed(0)} m × ${b.heightM.toFixed(0)} m</div>
              <div class="rs-coords">
                N ${b.north.toFixed(5)}°&emsp;S ${b.south.toFixed(5)}°<br>
                E ${b.east.toFixed(5)}°&emsp;W ${b.west.toFixed(5)}°
              </div>
              <div class="rs-actions">
                <button class="rs-confirm" @click=${this._confirmRegion}>✓ Confirm</button>
                <button class="rs-cancel" @click=${this._cancelRegion}>✕</button>
              </div>
            </div>
          ` : ''}

          <!-- Confirmed result -->
          ${this._regionPhase === 'idle' && b ? html`
            <div class="rs-result">
              <div class="rs-result-title">Selected Region</div>
              <div class="rs-result-body">
                ${b.widthM.toFixed(0)} m × ${b.heightM.toFixed(0)} m<br>
                N ${b.north.toFixed(5)}° &nbsp; S ${b.south.toFixed(5)}°<br>
                E ${b.east.toFixed(5)}° &nbsp; W ${b.west.toFixed(5)}°
              </div>
              <div class="rs-result-actions">
                <button class="rs-new-btn" @click=${this._startRegion}>Draw new</button>
              </div>
            </div>
          ` : ''}
        ` : ''}
      </div>

      <div class="adv-overlay ${this._status !== 'loading' && this._status !== 'error' ? 'hidden' : ''}">
        ${this._status === 'loading' ? html`
          <div class="adv-spinner"></div>
          <span>Loading 3D tiles…</span>
        ` : html`
          <span style="color:#f87171">⚠ ${this._errorMsg}</span>
          <span style="font-size:0.75rem">Check VITE_MAP_TILES_API_KEY in .env</span>
        `}
      </div>

      <a class="adv-switch-link" href="/">← Travel Mode</a>
    `;
  }

  private _onLocationSelected(e: Event) {
    const { lat, lon, name } = (e as LocationSelectedEvent).detail;
    this._currentLocation = name;
    this._cesium?.flyTo(lat, lon, 2000);
  }

  private _startRegion() {
    if (!this._cesium) return;
    if (!this._regionSel) {
      this._regionSel = new RegionSelector(
        this._cesium.cesiumViewer,
        (state) => {
          this._regionPhase = state.phase;
          if (state.box) this._regionBox = state.box;
        },
      );
    }
    this._regionBox = null; // clear previous confirmed result from display
    this._regionSel.activate();
    this._regionPhase = 'drawing';
  }

  private _confirmRegion() {
    const box = this._regionSel?.confirm() ?? null;
    this._regionSel?.deactivate();
    this._regionPhase = 'idle';
    if (box) {
      this._regionBox = box;
      console.info('[AdventureRoot] Region confirmed:', JSON.stringify(box, null, 2));
    }
  }

  private _cancelRegion() {
    this._regionSel?.cancel();
    this._regionSel?.deactivate();
    this._regionPhase = 'idle';
    this._regionBox = null;
  }

  async firstUpdated() {
    const container = this.querySelector<HTMLDivElement>('#adv-cesium');
    if (!container) return;
    this._container = container;

    const apiKey =
      (typeof process !== 'undefined' && process.env.VITE_MAP_TILES_API_KEY) ||
      (typeof process !== 'undefined' && process.env.VITE_GOOGLE_MAPS_API_KEY) ||
      (typeof process !== 'undefined' && process.env.GOOGLE_MAPS_API_KEY) ||
      '';

    this._apiKey = apiKey;

    if (!apiKey) {
      this._status = 'error';
      this._errorMsg = 'No Google Maps API key found. Set VITE_MAP_TILES_API_KEY in .env';
      return;
    }

    try {
      this._cesium = await OrbitCesiumViewer.create({
        container,
        googleMapsApiKey: apiKey,
        lat: INITIAL_LAT,
        lon: INITIAL_LON,
        heightMetres: 2000,
      });
      this._status = 'ready';
    } catch (err) {
      this._status = 'error';
      this._errorMsg = String(err instanceof Error ? err.message : err);
      console.error('[AdventureRoot] Cesium init failed:', err);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._regionSel?.destroy();
    this._regionSel = null;
    this._cesium?.destroy();
    this._cesium = null;
  }
}
