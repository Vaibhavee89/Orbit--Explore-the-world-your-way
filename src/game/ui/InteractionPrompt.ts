import type { PlacedAsset } from '../assets/AssetPlacer';

// Display name overrides — falls back to assetId when not listed.
const DISPLAY_NAMES: Record<string, string> = {
  'ancient-artifact': 'Ancient Artifact',
  'treasure-chest':   'Treasure Chest',
  'signboard':        'Signboard',
};

function displayName(assetId: string): string {
  return DISPLAY_NAMES[assetId] ?? assetId;
}

/**
 * HUD overlay that shows a "Press E to pick up …" prompt when the player
 * is inside an asset's interaction zone.
 *
 * Mounts a <div> inside the game canvas container.
 * Listens for the 'E' key on window and calls the onPickup callback.
 *
 * Usage:
 *   const prompt = new InteractionPrompt(canvasParent);
 *   prompt.onPickup(id => game.pickup(id));
 *   // each tick:
 *   prompt.update(assetPlacer.nearbyAsset);
 */
export class InteractionPrompt {
  private _el:      HTMLElement;
  private _current: PlacedAsset | null = null;
  private _handler: ((assetId: string) => void) | null = null;

  private _onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'KeyE' && this._current && !e.repeat) {
      this._handler?.(this._current.id);
    }
  };

  constructor(container: HTMLElement) {
    this._el = document.createElement('div');
    Object.assign(this._el.style, {
      position:        'absolute',
      bottom:          '80px',
      left:            '50%',
      transform:       'translateX(-50%)',
      background:      'rgba(0,0,0,0.72)',
      color:           '#fff',
      padding:         '9px 20px',
      borderRadius:    '8px',
      fontFamily:      'system-ui, sans-serif',
      fontSize:        '14px',
      letterSpacing:   '0.02em',
      pointerEvents:   'none',
      display:         'none',
      whiteSpace:      'nowrap',
      userSelect:      'none',
      zIndex:          '100',
    });
    container.style.position ||= 'relative'; // ensure absolute children are clipped
    container.appendChild(this._el);
    window.addEventListener('keydown', this._onKeyDown);
  }

  /** Called when the player presses E while a prompt is visible. */
  onPickup(handler: (assetId: string) => void): void {
    this._handler = handler;
  }

  /**
   * Show or hide the prompt based on the current nearby asset.
   * Pass null to hide. Call once per frame / physics tick.
   */
  update(nearby: PlacedAsset | null): void {
    if (nearby === this._current) return; // no change
    this._current = nearby;
    if (nearby) {
      this._el.textContent = `Press E to pick up  ${displayName(nearby.id)}`;
      this._el.style.display = 'block';
    } else {
      this._el.style.display = 'none';
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this._onKeyDown);
    this._el.remove();
    this._current = null;
  }
}
