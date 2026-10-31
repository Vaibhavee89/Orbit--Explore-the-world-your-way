import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { OrbitCesiumViewer } from '../../geospatial/CesiumViewer';

// Manali, Himachal Pradesh — P1-02 acceptance co-ordinates.
const INITIAL_LAT = 32.2432;
const INITIAL_LON = 77.1892;

@customElement('orbit-adventure-root')
export class AdventureRoot extends LitElement {
  // Cesium mounts into a real DOM node — disable shadow DOM so the
  // Cesium widget CSS (served from /cesium/…) can reach the container.
  createRenderRoot() { return this; }

  @state() private _status: 'loading' | 'ready' | 'error' = 'loading';
  @state() private _errorMsg = '';

  private _cesium: OrbitCesiumViewer | null = null;
  private _container: HTMLDivElement | null = null;

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
    `;
    document.head.appendChild(style);
  }

  render() {
    return html`
      <div class="adv-cesium-container" id="adv-cesium"></div>

      <div class="adv-hud">
        <span class="adv-badge">Orbit Adventure — Alpha</span>
        ${this._status === 'ready' ? html`
          <div class="adv-location">📍 Manali, Himachal Pradesh (32.2432°N, 77.1892°E)</div>
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

  async firstUpdated() {
    const container = this.querySelector<HTMLDivElement>('#adv-cesium');
    if (!container) return;
    this._container = container;

    const apiKey =
      (typeof process !== 'undefined' && process.env.VITE_MAP_TILES_API_KEY) ||
      (typeof process !== 'undefined' && process.env.VITE_GOOGLE_MAPS_API_KEY) ||
      (typeof process !== 'undefined' && process.env.GOOGLE_MAPS_API_KEY) ||
      '';

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
    this._cesium?.destroy();
    this._cesium = null;
  }
}
