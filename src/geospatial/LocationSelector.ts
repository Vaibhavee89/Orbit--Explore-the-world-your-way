import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

export interface GeoResult {
  name: string;
  lat: number;
  lon: number;
}

/** Fired on the element when the user picks a location. */
export class LocationSelectedEvent extends CustomEvent<GeoResult> {
  constructor(detail: GeoResult) {
    super('location-selected', { detail, bubbles: true, composed: true });
  }
}

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const DEBOUNCE_MS = 400;

@customElement('orbit-location-selector')
export class LocationSelector extends LitElement {
  // No shadow DOM — styles injected by parent (AdventureRoot).
  createRenderRoot() { return this; }

  @property() apiKey = '';

  @state() private _query = '';
  @state() private _results: GeoResult[] = [];
  @state() private _loading = false;
  @state() private _open = false;
  @state() private _activeIdx = -1;

  private _debounceTimer = 0;

  // ── public API ──────────────────────────────────────────────────────────────

  focus() {
    this.querySelector<HTMLInputElement>('input')?.focus();
  }

  // ── geocoding ───────────────────────────────────────────────────────────────

  private async _geocode(query: string): Promise<GeoResult[]> {
    const url = `${GEOCODE_URL}?address=${encodeURIComponent(query)}&key=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
    const json = await res.json();
    if (json.status !== 'OK') return [];
    return (json.results as any[]).slice(0, 6).map((r: any) => ({
      name: r.formatted_address as string,
      lat: r.geometry.location.lat as number,
      lon: r.geometry.location.lng as number,
    }));
  }

  // ── event handlers ──────────────────────────────────────────────────────────

  private _onInput(e: Event) {
    this._query = (e.target as HTMLInputElement).value;
    this._activeIdx = -1;
    // Discard any stale results immediately — otherwise a slow in-flight
    // request for the previous query can still land and briefly show
    // results that don't match what's now in the input.
    this._results = [];
    this._open = false;

    clearTimeout(this._debounceTimer);
    if (this._query.trim().length < 2) return;
    this._debounceTimer = window.setTimeout(() => this._fetch(), DEBOUNCE_MS);
  }

  private async _fetch() {
    if (!this.apiKey || !this._query.trim()) return;
    // Capture the query this request is for. If the user types again before
    // it resolves, _query will have moved on — only commit the response
    // while it's still current, so a later-arriving response for an older
    // query can't overwrite newer results (or let Enter select the wrong
    // destination).
    const requestQuery = this._query;
    this._loading = true;
    try {
      const results = await this._geocode(requestQuery);
      if (this._query !== requestQuery) return; // superseded by a newer query
      this._results = results;
      this._open = this._results.length > 0;
    } catch (err) {
      console.error('[LocationSelector] geocode error:', err);
    } finally {
      if (this._query === requestQuery) this._loading = false;
    }
  }

  private _onKeyDown(e: KeyboardEvent) {
    if (!this._open && e.key !== 'Enter') return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this._activeIdx = Math.min(this._activeIdx + 1, this._results.length - 1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        this._activeIdx = Math.max(this._activeIdx - 1, -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (this._activeIdx >= 0) {
          this._select(this._results[this._activeIdx]);
        } else if (this._results.length > 0) {
          this._select(this._results[0]);
        } else if (this._query.trim()) {
          // No suggestions yet — geocode on demand.
          this._fetchAndSelect();
        }
        break;
      case 'Escape':
        this._open = false;
        this._activeIdx = -1;
        break;
    }
  }

  private async _fetchAndSelect() {
    this._loading = true;
    try {
      const results = await this._geocode(this._query);
      if (results.length > 0) this._select(results[0]);
    } finally {
      this._loading = false;
    }
  }

  private _select(result: GeoResult) {
    this._query = result.name;
    this._open = false;
    this._results = [];
    this._activeIdx = -1;
    this.dispatchEvent(new LocationSelectedEvent(result));
  }

  private _onBlur() {
    // Short delay so click on a suggestion fires before close.
    setTimeout(() => { this._open = false; }, 150);
  }

  // ── render ──────────────────────────────────────────────────────────────────

  render() {
    return html`
      <div class="ls-wrap">
        <div class="ls-input-row">
          <span class="ls-icon">${this._loading ? '⏳' : '🔍'}</span>
          <input
            class="ls-input"
            type="text"
            placeholder="Search destinations…"
            autocomplete="off"
            spellcheck="false"
            .value=${this._query}
            @input=${this._onInput}
            @keydown=${this._onKeyDown}
            @blur=${this._onBlur}
          />
          ${this._query ? html`
            <button class="ls-clear" @click=${() => { this._query = ''; this._results = []; this._open = false; }}>✕</button>
          ` : ''}
        </div>

        ${this._open && this._results.length ? html`
          <ul class="ls-dropdown" role="listbox">
            ${this._results.map((r, i) => html`
              <li
                class="ls-option ${i === this._activeIdx ? 'ls-option--active' : ''}"
                role="option"
                @mousedown=${() => this._select(r)}
              >
                <span class="ls-pin">📍</span>
                <span class="ls-name">${r.name}</span>
              </li>
            `)}
          </ul>
        ` : ''}
      </div>
    `;
  }
}
