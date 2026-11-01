import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { BoundingBox, SelectedLocation } from '../../geospatial/types';
import { LocationConfirmedEvent } from '../../geospatial/types';
import { loadLocations, saveLocation } from '../../geospatial/locationStorage';
import { WorldBuilderClient, WorldBuilderError } from '../../geospatial/WorldBuilderClient';
import type { WorldManifest } from '../../geospatial/WorldBuilderClient';
import { Game } from '../../game/core/Game';
import { generateQuest, QuestManager } from '../../game/quest';
import { EventBus } from '../../game/core';
import { XpManager } from '../../game/progression';
import type { Quest } from '../../game/quest';
import { FEATURED_DESTINATIONS } from '../../geospatial/featuredDestinations';
import type { FeaturedDestination } from '../../geospatial/featuredDestinations';
import { WorldRegistry } from '../../game/world';
import type { LocalWorldDefinition } from '../../game/world';

type BuildPhase = 'idle' | 'building' | 'done' | 'error';

/** Hand-authored exploration mission per local World Registry entry. */
const LOCAL_WORLD_QUESTS: Record<string, (def: LocalWorldDefinition) => Quest> = {
  manali: (def) => ({
    id: `${def.worldId}-hidden-path`,
    title: 'The Hidden Path',
    description: `Explore the ${def.name} village, discover its landmarks, and find what the mountains are hiding before the winter closes the passes.`,
    objective: 'Cross the old wooden bridge, find the viewpoint and the waterfall, then recover the ancient artifact.',
    reward: { xp: 150, items: ['ancient-artifact'] },
    difficulty: 'medium',
    location: { x: def.spawn.x, y: 0, z: def.spawn.z, radius: 500 },
    tags: ['exploration', def.worldId],
  }),
  rajasthan: (def) => ({
    id: `${def.worldId}-lost-relic`,
    title: 'The Lost Relic',
    description: 'Legends speak of an ancient artifact buried somewhere in the dunes beyond the fortress, lost to the desert for centuries.',
    objective: 'Follow the desert trail past the fortress and the viewpoint, find the buried ruins, and recover the lost relic.',
    reward: { xp: 180, items: ['ancient-artifact'] },
    difficulty: 'hard',
    location: { x: def.spawn.x, y: 0, z: def.spawn.z, radius: 500 },
    tags: ['exploration', def.worldId],
  }),
  iceland: (def) => ({
    id: `${def.worldId}-frozen-frontier`,
    title: 'The Frozen Frontier',
    description: 'Fishermen speak of something ancient resting in the ice beyond the glacier lake, untouched since before the village was founded.',
    objective: 'Pass the waterfall, cross into the glacier valley, and recover the relic frozen in the ice near the lake.',
    reward: { xp: 180, items: ['ancient-artifact'] },
    difficulty: 'hard',
    location: { x: def.spawn.x, y: 0, z: def.spawn.z, radius: 500 },
    tags: ['exploration', def.worldId],
  }),
  kyoto: (def) => ({
    id: `${def.worldId}-forgotten-traditions`,
    title: 'The Forgotten Traditions',
    description: 'An old monk once spoke of a relic hidden at a shrine deep within the bamboo forest, forgotten by all but the wind.',
    objective: 'Pass through the temple district, find the hidden shrine within the bamboo forest, and recover the relic.',
    reward: { xp: 170, items: ['ancient-artifact'] },
    difficulty: 'medium',
    location: { x: def.spawn.x, y: 0, z: def.spawn.z, radius: 500 },
    tags: ['exploration', def.worldId],
  }),
  'swiss-alps': (def) => ({
    id: `${def.worldId}-beyond-the-summit`,
    title: 'Beyond the Summit',
    description: "A climber's journal spoke of a relic left near the old mountain shelter, far above the lake, on the trail that leads to the summit.",
    objective: 'Follow the trail past the lake and the mountain shelter, and reach the summit viewpoint to recover the relic.',
    reward: { xp: 190, items: ['ancient-artifact'] },
    difficulty: 'hard',
    location: { x: def.spawn.x, y: 0, z: def.spawn.z, radius: 500 },
    tags: ['exploration', def.worldId],
  }),
};

/**
 * Structured completion requirements per world — validated by the game
 * engine (discovered-landmark + collected-item events), not a trust button.
 * IDs reference each world's PropPlacement.id for labeled landmarks.
 */
interface QuestObjectives { requiredLandmarks: string[]; requiredCollectible?: string; }
const LOCAL_WORLD_OBJECTIVES: Record<string, QuestObjectives> = {
  manali:        { requiredLandmarks: ['bridge-1', 'viewpoint-1', 'waterfall-1'], requiredCollectible: 'ancient-artifact' },
  rajasthan:     { requiredLandmarks: ['dunes-ruins', 'dunes-viewpoint'], requiredCollectible: 'ancient-artifact' },
  iceland:       { requiredLandmarks: ['waterfall-1', 'wf-viewpoint'], requiredCollectible: 'ancient-artifact' },
  kyoto:         { requiredLandmarks: ['temple-1', 'torii-1'], requiredCollectible: 'ancient-artifact' },
  'swiss-alps':  { requiredLandmarks: ['cabin-1', 'summit-viewpoint'], requiredCollectible: 'ancient-artifact' },
};

interface DiscoveryEntry { id: string; name: string; at: number; }

@customElement('orbit-adventure-root')
export class AdventureRoot extends LitElement {
  createRenderRoot() { return this; }

  @state() private _selectedId: string | null = null;
  @state() private _currentLocation = '';
  @state() private _regionBox: BoundingBox | null = null;
  @state() private _buildPhase: BuildPhase = 'idle';
  @state() private _worldManifest: WorldManifest | null = null;
  @state() private _buildError = '';
  @state() private _gameRunning = false;
  @state() private _activeQuest: Quest | null = null;
  @state() private _playerLevel = 1;
  @state() private _playerXp = 0;
  /** Set when the selected destination is a pre-built World Registry entry — instant load, no backend build. */
  @state() private _selectedLocalWorldId: string | null = null;

  // ── Exploration/discovery (Phase 2-5 gameplay loop) ──────────────────────
  @state() private _lastDiscovery: { name: string; xp: number } | null = null;
  @state() private _lastAchievement: string | null = null;
  @state() private _discoveries: DiscoveryEntry[] = [];
  @state() private _achievements: string[] = [];
  @state() private _showInventory = false;
  @state() private _showJournal = false;
  @state() private _cameraMode: 'third-person' | 'first-person' = 'third-person';
  /** Bumped on every Inventory.add() — Inventory.items is a plain array, so this forces the panel to re-render. */
  @state() private _inventoryVersion = 0;

  private _discoveredIds = new Set<string>();
  private _collectedIds = new Set<string>();
  private _discoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private _achievementTimer: ReturnType<typeof setTimeout> | null = null;

  private _game: Game | null = null;
  private _xpManager: XpManager | null = null;
  private _questManager: QuestManager | null = null;
  private _savedLocations: SelectedLocation[] = [];

  connectedCallback() {
    super.connectedCallback();
    this._injectStyles();
    document.addEventListener('game:toggle-inventory', this._onToggleInventory);
    document.addEventListener('game:toggle-journal', this._onToggleJournal);
    document.addEventListener('game:camera-mode', this._onCameraMode as EventListener);
    this._savedLocations = loadLocations();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('game:toggle-inventory', this._onToggleInventory);
    document.removeEventListener('game:toggle-journal', this._onToggleJournal);
    document.removeEventListener('game:camera-mode', this._onCameraMode as EventListener);
    if (this._discoveryTimer) clearTimeout(this._discoveryTimer);
    if (this._achievementTimer) clearTimeout(this._achievementTimer);
    this._game?.dispose();
    this._game = null;
  }

  private _onToggleInventory = () => { this._showInventory = !this._showInventory; if (this._showInventory) this._showJournal = false; };
  private _onToggleJournal = () => { this._showJournal = !this._showJournal; if (this._showJournal) this._showInventory = false; };
  private _onCameraMode = (e: CustomEvent<{ mode: 'third-person' | 'first-person' }>) => {
    this._cameraMode = e.detail.mode;
  };

  private _injectStyles() {
    if (document.getElementById('orbit-adventure-styles')) return;
    const style = document.createElement('style');
    style.id = 'orbit-adventure-styles';
    style.textContent = `
      orbit-adventure-root {
        --gold:        #c9a961;
        --gold-bright: #e8c874;
        --ivory:       #e8e4d8;
        --panel-bg:    rgba(9, 11, 8, 0.86);
        --border-dim:  rgba(201, 169, 97, 0.32);
        --border-hi:   rgba(201, 169, 97, 0.85);
        --text-dim:    #9a9488;
        --danger:      #c9634d;
        --forest:      #0f140f;
        --mono:        'SF Mono', ui-monospace, 'Cascadia Code', Menlo, Consolas, monospace;

        display: block;
        position: relative;
        width: 100vw;
        height: 100vh;
        overflow: hidden;
        background: var(--forest);
        font-family: 'Google Sans Text', sans-serif;
      }

      /* ── Shared corner-bracket panel look ── */
      .hud-panel {
        position: relative;
        background: var(--panel-bg);
        backdrop-filter: blur(10px);
        border: 1px solid var(--border-dim);
        padding: 12px 16px;
        pointer-events: auto;
      }
      .hud-panel::before, .hud-panel::after {
        content: ''; position: absolute; width: 10px; height: 10px; pointer-events: none;
      }
      .hud-panel::before { top: -1px; left: -1px; border-top: 2px solid var(--gold); border-left: 2px solid var(--gold); }
      .hud-panel::after  { bottom: -1px; right: -1px; border-bottom: 2px solid var(--gold); border-right: 2px solid var(--gold); }
      .hud-label {
        font-family: var(--mono);
        font-size: 0.62rem;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--gold);
      }

      /* ── World Discovery screen ── */
      .discovery-screen {
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 120% 80% at 50% -10%, rgba(201,169,97,0.08), transparent 60%),
          linear-gradient(180deg, #11150f 0%, #0a0c08 55%, #07080600 100%);
        overflow-y: auto;
        z-index: 10;
      }
      .discovery-screen.hidden { display: none; }
      .discovery-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 40px;
        border-bottom: 1px solid var(--border-dim);
      }
      .discovery-logo {
        font-family: var(--mono);
        font-size: 0.95rem;
        letter-spacing: 0.3em;
        color: var(--ivory);
        text-transform: uppercase;
      }
      .discovery-logo span { color: var(--gold-bright); }
      .discovery-switch-link {
        font-family: var(--mono);
        font-size: 0.68rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        color: var(--text-dim);
        text-decoration: none;
        border: 1px solid var(--border-dim);
        padding: 7px 14px;
        transition: border-color 0.15s, color 0.15s;
      }
      .discovery-switch-link:hover { border-color: var(--border-hi); color: var(--gold-bright); }

      .discovery-hero {
        padding: 56px 40px 32px;
        max-width: 900px;
      }
      .discovery-eyebrow {
        font-family: var(--mono);
        font-size: 0.68rem;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: var(--gold);
        margin-bottom: 14px;
      }
      .discovery-title {
        font-size: clamp(2rem, 4.5vw, 3.4rem);
        line-height: 1.08;
        font-weight: 600;
        color: var(--ivory);
        margin: 0 0 16px;
        letter-spacing: -0.01em;
      }
      .discovery-title em { color: var(--gold-bright); font-style: normal; }
      .discovery-sub {
        font-size: 0.95rem;
        line-height: 1.6;
        color: #a8a192;
        max-width: 560px;
      }

      .discovery-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 18px;
        padding: 8px 40px 60px;
      }
      .dest-card {
        position: relative;
        background: rgba(13, 15, 11, 0.7);
        border: 1px solid var(--border-dim);
        cursor: pointer;
        padding: 0;
        overflow: hidden;
        text-align: left;
        font-family: inherit;
        transition: border-color 0.2s, transform 0.2s;
      }
      .dest-card:hover { border-color: var(--border-hi); transform: translateY(-2px); }
      .dest-card--selected { border-color: var(--gold-bright); box-shadow: 0 0 0 1px var(--gold-bright); }
      .dest-card-art {
        height: 120px;
        background: linear-gradient(160deg, #26321f 0%, #171d13 60%, #0c0f09 100%);
        position: relative;
      }
      .dest-card-status {
        position: absolute;
        top: 10px;
        right: 10px;
        font-family: var(--mono);
        font-size: 0.6rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        padding: 3px 8px;
        background: rgba(9,11,8,0.85);
        border: 1px solid var(--border-dim);
        color: var(--text-dim);
      }
      .dest-card-status--ready { color: var(--gold-bright); border-color: var(--border-hi); }
      .dest-card-body { padding: 14px 16px 16px; }
      .dest-card-name { font-size: 1.05rem; font-weight: 600; color: var(--ivory); margin-bottom: 2px; }
      .dest-card-tagline {
        font-family: var(--mono);
        font-size: 0.66rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--gold);
      }

      /* ── Selected destination detail panel ── */
      .dest-detail {
        margin: 0 40px 56px;
        max-width: 480px;
      }
      .dest-detail-title { font-size: 0.68rem; margin-bottom: 8px; }
      .dest-detail-name { font-size: 1.3rem; font-weight: 600; color: var(--ivory); margin-bottom: 10px; }
      .dest-detail-body { font-size: 0.8rem; color: #b8b2a4; line-height: 1.6; margin-bottom: 14px; }
      .dest-detail-error {
        font-size: 0.75rem; color: var(--danger);
        background: rgba(201,99,77,0.08); border: 1px solid rgba(201,99,77,0.3);
        padding: 8px 10px; margin-bottom: 12px; line-height: 1.5;
      }
      .dest-enter-btn {
        width: 100%;
        background: transparent;
        color: var(--gold-bright);
        border: 1px solid var(--border-hi);
        padding: 11px 0;
        font-family: var(--mono);
        font-size: 0.75rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .dest-enter-btn:hover:not(:disabled) { background: var(--gold); color: #0a0a09; }
      .dest-enter-btn:disabled { opacity: 0.5; cursor: default; }
      .dest-spinner {
        display: inline-block; width: 11px; height: 11px;
        border: 2px solid rgba(201,169,97,0.3); border-top-color: var(--gold-bright);
        border-radius: 50%; margin-right: 8px; vertical-align: middle;
        animation: adv-spin 0.8s linear infinite;
      }
      @keyframes adv-spin { to { transform: rotate(360deg); } }

      /* ── In-game overlay ── */
      .game-overlay { position: absolute; inset: 0; z-index: 100; }
      .game-overlay.hidden { display: none; }
      .game-canvas { display: block; width: 100%; height: 100%; }

      .game-exit-btn {
        position: absolute; top: 16px; right: 16px; z-index: 210;
        background: var(--panel-bg);
        backdrop-filter: blur(6px);
        border: 1px solid rgba(201, 97, 77, 0.5);
        color: #d98673;
        font-family: var(--mono);
        font-size: 0.7rem;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        padding: 7px 16px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
        pointer-events: auto;
      }
      .game-exit-btn:hover { background: rgba(201, 97, 77, 0.14); border-color: #c9634d; }

      .game-hud-quest { position: absolute; bottom: 16px; left: 16px; min-width: 300px; max-width: 340px; z-index: 200; }
      .quest-eyebrow { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
      .quest-eyebrow .hud-label { color: var(--gold-bright); }
      .quest-eyebrow::before {
        content: ''; width: 6px; height: 6px; border-radius: 50%;
        background: var(--gold-bright); box-shadow: 0 0 6px var(--gold-bright);
      }
      .quest-title { font-size: 1rem; font-weight: 600; letter-spacing: 0.01em; color: var(--ivory); margin-bottom: 6px; }
      .quest-objective {
        font-size: 0.78rem; color: #b8b2a4; line-height: 1.55; margin-bottom: 10px;
        padding-left: 10px; border-left: 2px solid var(--border-dim);
      }
      .quest-reward { font-family: var(--mono); font-size: 0.68rem; letter-spacing: 0.06em; color: var(--gold); margin-bottom: 10px; }
      .quest-complete-btn {
        width: 100%; background: transparent; color: var(--gold-bright);
        border: 1px solid var(--border-hi); padding: 8px 0;
        font-family: var(--mono); font-size: 0.72rem; letter-spacing: 0.12em;
        text-transform: uppercase; font-weight: 600; cursor: pointer;
        transition: background 0.15s, color 0.15s;
      }
      .quest-complete-btn:hover { background: var(--gold); color: #0a0a09; }

      .game-hud-xp { position: absolute; top: 16px; left: 16px; min-width: 190px; z-index: 200; }
      .xp-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 8px; }
      .xp-header .hud-label { color: var(--text-dim); }
      .xp-level { font-family: var(--mono); font-size: 0.95rem; font-weight: 700; color: var(--gold-bright); }
      .xp-bar { width: 100%; height: 4px; background: rgba(201, 169, 97, 0.15); overflow: hidden; margin-bottom: 6px; }
      .xp-fill { height: 100%; background: var(--gold); transition: width 0.3s ease; }
      .xp-text { font-family: var(--mono); font-size: 0.65rem; color: var(--text-dim); font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
      .camera-mode-text {
        margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-dim);
        font-family: var(--mono); font-size: 0.6rem; color: var(--text-dim); letter-spacing: 0.04em;
      }
      .camera-mode-text kbd {
        display: inline-block; border: 1px solid var(--border-dim); border-radius: 3px;
        padding: 0 4px; color: var(--gold); font-family: var(--mono);
      }

      /* ── Quest objectives checklist (engine-validated, not a trust button) ── */
      .quest-checklist { list-style: none; margin: 0 0 10px; padding: 0; }
      .quest-checklist li {
        font-size: 0.74rem; color: #b8b2a4; line-height: 1.7; display: flex; align-items: baseline; gap: 6px;
      }
      .quest-checklist li.quest-check-done { color: var(--gold-bright); }
      .quest-check-mark { font-family: var(--mono); color: var(--border-hi); flex-shrink: 0; }
      .quest-checklist li.quest-check-done .quest-check-mark { color: var(--gold-bright); }

      /* ── Discovery / achievement toasts ── */
      .discovery-toast, .achievement-toast {
        position: absolute;
        top: 90px;
        left: 50%;
        transform: translateX(-50%);
        min-width: 320px;
        text-align: center;
        z-index: 250;
        animation: toast-in 0.4s ease;
      }
      .achievement-toast { top: 170px; border-color: var(--gold-bright); }
      @keyframes toast-in {
        from { opacity: 0; transform: translate(-50%, -12px); }
        to   { opacity: 1; transform: translate(-50%, 0); }
      }
      .discovery-toast-label { margin-bottom: 6px; }
      .discovery-toast-name { font-size: 1.1rem; font-weight: 600; color: var(--ivory); margin-bottom: 4px; }
      .discovery-toast-xp { font-family: var(--mono); font-size: 0.72rem; color: var(--gold); letter-spacing: 0.06em; }

      /* ── Inventory / Journal side panels ── */
      .side-panel {
        position: absolute;
        top: 16px;
        right: 16px;
        min-width: 240px;
        max-width: 280px;
        max-height: 60vh;
        overflow-y: auto;
        z-index: 220;
      }
      .side-panel-title { margin-bottom: 8px; }
      .side-panel-list { list-style: none; margin: 0; padding: 0; }
      .side-panel-list li {
        font-size: 0.78rem; color: var(--ivory); text-transform: capitalize;
        padding: 5px 0; border-bottom: 1px solid var(--border-dim);
      }
      .side-panel-list li:last-child { border-bottom: none; }
      .side-panel-empty { font-size: 0.75rem; color: var(--text-dim); font-style: italic; }
    `;
    document.head.appendChild(style);
  }

  render() {
    const selectedFeatured = FEATURED_DESTINATIONS.find(d => d.id === this._selectedId) ?? null;

    return html`
      <div class="discovery-screen ${this._gameRunning ? 'hidden' : ''}">
        <div class="discovery-topbar">
          <span class="discovery-logo">ORBIT <span>ADVENTURE</span></span>
          <a class="discovery-switch-link" href="/?mode=travel">Travel Mode</a>
        </div>

        <div class="discovery-hero">
          <div class="discovery-eyebrow">Earth Discovery</div>
          <h1 class="discovery-title">Choose a world <em>to explore</em>.</h1>
          <p class="discovery-sub">
            Every destination below is a persistent, pre-built environment — walk through a
            Himalayan mountain village, uncover landmarks, and complete expeditions.
          </p>
        </div>

        <div class="discovery-grid">
          ${FEATURED_DESTINATIONS.map(dest => this._renderDestCard(dest))}
        </div>

        ${selectedFeatured ? this._renderDestDetail(selectedFeatured) : ''}
      </div>

      <!-- Three.js game canvas — covers screen when game is running -->
      <div class="game-overlay ${this._gameRunning ? '' : 'hidden'}">
        <canvas id="adv-game" class="game-canvas"></canvas>
        <button class="game-exit-btn" @click=${this._exitGame}>Exit Expedition</button>

        <div class="game-hud-xp hud-panel">
          <div class="xp-header">
            <span class="hud-label">Operative</span>
            <span class="xp-level">LVL ${this._playerLevel}</span>
          </div>
          <div class="xp-bar">
            <div class="xp-fill" style="width: ${(this._xpManager?.progressToNextLevel ?? 0) * 100}%"></div>
          </div>
          <div class="xp-text">${this._playerXp} XP</div>
          <div class="camera-mode-text">
            ${this._cameraMode === 'first-person' ? 'First-Person' : 'Third-Person'} · <kbd>C</kbd> to switch
          </div>
        </div>

        ${this._activeQuest ? html`
          <div class="game-hud-quest hud-panel">
            <div class="quest-eyebrow"><span class="hud-label">Current Expedition</span></div>
            <div class="quest-title">${this._activeQuest.title}</div>
            <div class="quest-objective">${this._activeQuest.objective}</div>
            <ul class="quest-checklist">
              ${this._questObjectivesFor(this._selectedLocalWorldId ?? '').map(o => html`
                <li class="${o.done ? 'quest-check-done' : ''}">
                  <span class="quest-check-mark">${o.done ? '✓' : '○'}</span> ${o.label}
                </li>
              `)}
            </ul>
            <div class="quest-reward">REWARD · +${this._activeQuest.reward.xp} XP</div>
          </div>
        ` : ''}

        <!-- Discovery notification — cinematic toast, auto-dismisses -->
        ${this._lastDiscovery ? html`
          <div class="discovery-toast hud-panel">
            <div class="hud-label discovery-toast-label">New Discovery</div>
            <div class="discovery-toast-name">${this._lastDiscovery.name}</div>
            <div class="discovery-toast-xp">+${this._lastDiscovery.xp} Discovery XP</div>
          </div>
        ` : ''}

        <!-- Achievement notification -->
        ${this._lastAchievement ? html`
          <div class="achievement-toast hud-panel">
            <div class="hud-label discovery-toast-label">Achievement Unlocked</div>
            <div class="discovery-toast-name">🏆 ${this._lastAchievement}</div>
          </div>
        ` : ''}

        <!-- Inventory panel (I) -->
        ${this._showInventory ? html`
          <div class="side-panel hud-panel">
            <div class="hud-label side-panel-title">Inventory</div>
            ${this._game?.inventory.items.length ? html`
              <ul class="side-panel-list">
                ${this._game.inventory.items.map(item => html`
                  <li>${item.assetId.replace(/-/g, ' ')}</li>
                `)}
              </ul>
            ` : html`<div class="side-panel-empty">No items collected yet.</div>`}
          </div>
        ` : ''}

        <!-- Journal panel (J) -->
        ${this._showJournal ? html`
          <div class="side-panel hud-panel">
            <div class="hud-label side-panel-title">Journal — Discoveries</div>
            ${this._discoveries.length ? html`
              <ul class="side-panel-list">
                ${this._discoveries.map(d => html`<li>${d.name}</li>`)}
              </ul>
            ` : html`<div class="side-panel-empty">Nothing discovered yet — go explore.</div>`}
            ${this._achievements.length ? html`
              <div class="hud-label side-panel-title" style="margin-top:12px;">Achievements</div>
              <ul class="side-panel-list">
                ${this._achievements.map(a => html`<li>🏆 ${a}</li>`)}
              </ul>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  private _renderDestCard(dest: FeaturedDestination) {
    const entry = WorldRegistry.get(dest.id);
    const isLocal = entry?.source === 'local';
    const isSelected = this._selectedId === dest.id;
    const ready = isLocal || (isSelected && this._buildPhase === 'done');

    return html`
      <button
        class="dest-card ${isSelected ? 'dest-card--selected' : ''}"
        @click=${() => this._selectDestination(dest)}
      >
        <div class="dest-card-art">
          <span class="dest-card-status ${ready ? 'dest-card-status--ready' : ''}">
            ${isLocal ? 'Playable Now' : ready ? 'Ready' : 'Pre-Built'}
          </span>
        </div>
        <div class="dest-card-body">
          <div class="dest-card-name">${dest.name}</div>
          <div class="dest-card-tagline">${dest.tagline}</div>
        </div>
      </button>
    `;
  }

  private _renderDestDetail(dest: FeaturedDestination) {
    const entry = WorldRegistry.get(dest.id);
    const isLocal = entry?.source === 'local';

    return html`
      <div class="dest-detail">
        <div class="hud-label dest-detail-title">Expedition Target</div>
        <div class="dest-detail-name">${dest.name}</div>
        <div class="dest-detail-body">
          ${isLocal
            ? 'A hand-authored environment — terrain, village, landmarks, and collectibles, ready to explore instantly.'
            : 'Built from real-world terrain and geography data.'}
        </div>

        ${this._buildPhase === 'error' ? html`<div class="dest-detail-error">${this._buildError}</div>` : ''}

        <button
          class="dest-enter-btn"
          ?disabled=${!isLocal && this._buildPhase === 'building'}
          @click=${() => isLocal ? this._startLocalGame() : this._startGame()}
        >
          ${!isLocal && this._buildPhase === 'building'
            ? html`<span class="dest-spinner"></span>Building World…`
            : !isLocal && this._buildPhase !== 'done'
              ? 'Build & Enter World'
              : 'Enter World'}
        </button>
      </div>
    `;
  }

  /** Select a destination card. Local worlds are ready instantly; backend worlds auto-build. */
  private _selectDestination(dest: FeaturedDestination) {
    this._selectedId = dest.id;
    this._currentLocation = dest.name;
    this._buildPhase = 'idle';
    this._worldManifest = null;
    this._buildError = '';

    const registryEntry = WorldRegistry.get(dest.id);
    if (registryEntry?.source === 'local') {
      this._selectedLocalWorldId = dest.id;
      this._regionBox = null;
      return;
    }

    this._selectedLocalWorldId = null;
    this._regionBox = dest.box;
    saveLocation(dest.box, dest.name);
    this._savedLocations = loadLocations();
    void this._onBuildWorld();
  }

  /** Build a backend (real-OSM-data) world for the currently selected region. */
  private async _onBuildWorld() {
    if (!this._regionBox || this._buildPhase === 'building') return;

    const existing = this._savedLocations.find(
      l => l.box.north === this._regionBox!.north &&
           l.box.south === this._regionBox!.south &&
           l.box.east  === this._regionBox!.east  &&
           l.box.west  === this._regionBox!.west,
    );
    const location: SelectedLocation = existing ?? {
      id: crypto.randomUUID(),
      label: this._currentLocation,
      box: this._regionBox,
      center: {
        lat: (this._regionBox.north + this._regionBox.south) / 2,
        lon: (this._regionBox.east  + this._regionBox.west)  / 2,
      },
      savedAt: Date.now(),
    };

    this.dispatchEvent(new LocationConfirmedEvent(location));
    this._buildPhase = 'building';
    this._buildError = '';
    this._worldManifest = null;

    try {
      const manifest = await WorldBuilderClient.buildWorld(location);
      this._worldManifest = manifest;
      this._buildPhase = 'done';
      console.info('[AdventureRoot] World built:', manifest.id, manifest.asset_urls);
    } catch (err) {
      this._buildPhase = 'error';
      this._buildError = err instanceof WorldBuilderError ? err.message : String(err);
      console.error('[AdventureRoot] World build failed:', err);
    }
  }

  private async _startGame() {
    const manifest = this._worldManifest;
    const location = this._regionBox;
    if (!manifest) return;
    this._gameRunning = true;

    this._xpManager = new XpManager();
    this._questManager = new QuestManager(this._xpManager);
    this._xpManager.onChange((event) => {
      this._playerLevel = event.level;
      this._playerXp = event.totalXp;
      if (event.leveledUp) console.info(`🎉 Level up! Now level ${event.level}`);
    });
    EventBus.on('quest:completed', (data) => {
      console.info(`✅ Quest completed: ${data.quest.title}`);
      this._activeQuest = null;
    });

    requestAnimationFrame(async () => {
      const canvas = this.querySelector<HTMLCanvasElement>('#adv-game');
      if (!canvas) return;
      this._game = new Game();
      this._game.start(canvas);
      await this._game.loadWorld(manifest);

      if (location) {
        try {
          const quest = await generateQuest({
            world: manifest,
            location: { ...location, label: this._currentLocation },
            playerLevel: this._playerLevel,
            availableChallenges: [],
          });
          this._questManager?.addQuest(quest);
          this._activeQuest = quest;
          console.info(`📜 Quest generated: ${quest.title}`);
        } catch (err) {
          console.warn('[AdventureRoot] Quest generation failed:', err);
        }
      }
    });
  }

  /** Load a pre-built World Registry environment directly — no backend build step. */
  private async _startLocalGame() {
    const worldId = this._selectedLocalWorldId;
    const entry = worldId ? WorldRegistry.get(worldId) : undefined;
    if (!entry?.local) return;
    const def = entry.local;

    this._gameRunning = true;

    // Fresh session state — EventBus listeners aren't auto-removed between
    // plays, so clear() avoids stacking duplicate handlers (double XP, etc).
    EventBus.clear();
    this._discoveredIds.clear();
    this._collectedIds.clear();
    this._discoveries = [];
    this._achievements = [];
    this._showInventory = false;
    this._showJournal = false;

    this._xpManager = new XpManager();
    this._questManager = new QuestManager(this._xpManager);
    this._xpManager.onChange((event) => {
      this._playerLevel = event.level;
      this._playerXp = event.totalXp;
      if (event.leveledUp) console.info(`🎉 Level up! Now level ${event.level}`);
    });
    EventBus.on('quest:completed', (data) => {
      console.info(`✅ Quest completed: ${data.quest.title}`);
      this._activeQuest = null;
    });

    // Landmark discovery — fires the cinematic notification, logs to the
    // journal, and re-checks whether this unlocks the active quest.
    EventBus.on('landmark:discovered', (data) => {
      this._discoveredIds.add(data.id);
      this._discoveries = [...this._discoveries, { id: data.id, name: data.name, at: Date.now() }];
      this._lastDiscovery = { name: data.name, xp: data.xpReward };
      if (this._discoveryTimer) clearTimeout(this._discoveryTimer);
      this._discoveryTimer = setTimeout(() => { this._lastDiscovery = null; }, 4500);
      this._checkAchievements();
      this._checkQuestProgress(def.worldId);
    });

    // Collectible pickup — same re-check, since quests can require both
    // landmarks discovered AND a specific item collected.
    EventBus.on('item:collected', (data) => {
      this._collectedIds.add(data.assetId);
      this._checkQuestProgress(def.worldId);
    });

    requestAnimationFrame(async () => {
      const canvas = this.querySelector<HTMLCanvasElement>('#adv-game');
      if (!canvas) return;
      this._game = new Game();
      this._game.start(canvas);
      this._game.inventory.onAdd(() => { this._inventoryVersion++; });
      await this._game.loadLocalWorld(def);

      const quest = LOCAL_WORLD_QUESTS[def.worldId]?.(def) ?? {
        id: `${def.worldId}-explore`,
        title: 'Exploration',
        description: `Explore ${def.name} and discover its landmarks.`,
        objective: 'Walk the marked trails and find what this world is hiding.',
        reward: { xp: 100, items: [] },
        difficulty: 'easy' as const,
        location: { x: def.spawn.x, y: 0, z: def.spawn.z, radius: 500 },
        tags: ['exploration', def.worldId],
      };
      this._questManager?.addQuest(quest);
      this._activeQuest = quest;
      console.info(`📜 Quest: ${quest.title}`);
    });
  }

  /**
   * Engine-side quest validation (not a trust button): completes the active
   * quest only once every required landmark has been discovered and the
   * required collectible has been picked up.
   */
  private _checkQuestProgress(worldId: string) {
    const objectives = LOCAL_WORLD_OBJECTIVES[worldId];
    if (!objectives || !this._activeQuest || !this._questManager) return;

    const landmarksDone = objectives.requiredLandmarks.every(id => this._discoveredIds.has(id));
    const collectibleDone = !objectives.requiredCollectible || this._collectedIds.has(objectives.requiredCollectible);
    if (!landmarksDone || !collectibleDone) return;

    this._questManager.completeQuest(this._activeQuest.id);
  }

  private _checkAchievements() {
    if (this._discoveries.length === 1 && !this._achievements.includes('First Footsteps')) {
      this._unlockAchievement('First Footsteps');
    }
    if (this._discoveries.length >= 5 && !this._achievements.includes('The Explorer')) {
      this._unlockAchievement('The Explorer');
    }
  }

  private _unlockAchievement(name: string) {
    this._achievements = [...this._achievements, name];
    this._lastAchievement = name;
    if (this._achievementTimer) clearTimeout(this._achievementTimer);
    this._achievementTimer = setTimeout(() => { this._lastAchievement = null; }, 4500);
    console.info(`🏆 Achievement unlocked: ${name}`);
  }

  /** Progress summary for the active quest's objectives checklist. */
  private _questObjectivesFor(worldId: string): Array<{ label: string; done: boolean }> {
    const objectives = LOCAL_WORLD_OBJECTIVES[worldId];
    if (!objectives) return [];
    const items = objectives.requiredLandmarks.map(id => {
      const entry = WorldRegistry.get(worldId);
      const prop = entry?.local?.props.find(p => p.id === id);
      return { label: prop?.label ?? id, done: this._discoveredIds.has(id) };
    });
    if (objectives.requiredCollectible) {
      items.push({ label: 'Recover the relic', done: this._collectedIds.has(objectives.requiredCollectible) });
    }
    return items;
  }

  private _exitGame() {
    this._game?.dispose();
    this._game = null;
    this._gameRunning = false;
  }

  private _completeQuest() {
    if (!this._activeQuest || !this._questManager) return;
    const completed = this._questManager.completeQuest(this._activeQuest.id);
    if (completed) console.info('✅ Quest submitted for completion!');
  }
}
