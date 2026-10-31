import { CharacterLibrary } from '../player/CharacterLibrary';
import { CharacterPreview } from './CharacterPreview';

export const STORAGE_KEY = 'orbit:character';

/** Returns the saved character id, or 'soldier' if nothing is stored yet. */
export function getSavedCharacter(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? 'soldier';
  } catch {
    return 'soldier';
  }
}

/** Persists the chosen character id. */
export function saveCharacter(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch { /* storage may be blocked */ }
}

/**
 * "Choose your explorer" first-run overlay.
 *
 * Layout:
 *   ┌─────────────────────────────────────┐
 *   │       Choose your explorer          │
 *   │  ┌──────────────────────────────┐   │
 *   │  │   live-rotating 3-D preview  │   │
 *   │  │         (280 × 380 px)       │   │
 *   │  └──────────────────────────────┘   │
 *   │         Character Name              │
 *   │  [Soldier] [X Bot] [Y Bot] [Adv…]   │
 *   │         [ Start Exploring ]         │
 *   └─────────────────────────────────────┘
 *
 * Usage:
 *   const picker = new AvatarPicker(document.body);
 *   picker.onConfirm(id => { saveCharacter(id); game.setCharacter(id); });
 *   picker.show();                   // on first run
 *   picker.show(getSavedCharacter()); // with pre-selected character
 */
export class AvatarPicker {
  private _overlay:   HTMLElement;
  private _preview:   CharacterPreview;
  private _selected:  string;
  private _handler:   ((id: string) => void) | null = null;

  // Character card buttons indexed by id.
  private _cards: Map<string, HTMLElement> = new Map();

  constructor(container: HTMLElement) {
    this._selected = getSavedCharacter();
    this._overlay  = this._buildOverlay(container);
    this._preview  = new CharacterPreview(280, 380);
  }

  onConfirm(handler: (characterId: string) => void): void {
    this._handler = handler;
  }

  /** Show the picker, optionally pre-selecting a character. */
  show(currentId = this._selected): void {
    this._select(currentId, /* loadPreview */ true);
    this._overlay.style.display = 'flex';
  }

  hide(): void {
    this._overlay.style.display = 'none';
  }

  dispose(): void {
    this._preview.dispose();
    this._overlay.remove();
  }

  // ── Build DOM ──────────────────────────────────────────────────────────────

  private _buildOverlay(container: HTMLElement): HTMLElement {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position:       'fixed',
      inset:          '0',
      display:        'none',
      alignItems:     'center',
      justifyContent: 'center',
      background:     'rgba(0,0,0,0.78)',
      backdropFilter: 'blur(8px)',
      zIndex:         '1000',
      fontFamily:     'system-ui, sans-serif',
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      background:   'rgba(15,15,30,0.95)',
      border:       '1px solid rgba(124,58,237,0.35)',
      borderRadius: '16px',
      padding:      '32px 36px',
      display:      'flex',
      flexDirection:'column',
      alignItems:   'center',
      gap:          '20px',
      boxShadow:    '0 24px 80px rgba(0,0,0,0.6)',
      maxWidth:     '400px',
      width:        '90vw',
    });

    // Title
    const title = document.createElement('h2');
    title.textContent = 'Choose your explorer';
    Object.assign(title.style, {
      margin:      '0',
      color:       '#f5f5ff',
      fontSize:    '22px',
      fontWeight:  '700',
      letterSpacing:'.02em',
    });
    card.appendChild(title);

    // 3-D preview canvas (injected later, after layout is stable)
    const previewWrap = document.createElement('div');
    Object.assign(previewWrap.style, {
      width:        '280px',
      height:       '380px',
      borderRadius: '10px',
      overflow:     'hidden',
      background:   'rgba(255,255,255,0.04)',
      border:       '1px solid rgba(255,255,255,0.08)',
      flexShrink:   '0',
    });
    // Canvas is appended in show() after _preview is created.
    card.appendChild(previewWrap);
    this._preview.canvas.style.display = 'block';
    previewWrap.appendChild(this._preview.canvas);

    // Character name label
    const nameLabel = document.createElement('div');
    nameLabel.id = 'ap-name';
    Object.assign(nameLabel.style, {
      color:      '#c4b5fd',
      fontSize:   '15px',
      fontWeight: '600',
      letterSpacing:'.04em',
      textTransform:'uppercase',
      minHeight:  '20px',
    });
    card.appendChild(nameLabel);

    // Character grid buttons
    const grid = document.createElement('div');
    Object.assign(grid.style, {
      display:   'flex',
      flexWrap:  'wrap',
      gap:       '8px',
      justifyContent:'center',
    });

    for (const entry of CharacterLibrary.default.all()) {
      const btn = document.createElement('button');
      btn.textContent = entry.name;
      btn.dataset['characterId'] = entry.id;
      Object.assign(btn.style, {
        padding:      '8px 14px',
        borderRadius: '8px',
        border:       '2px solid transparent',
        background:   'rgba(255,255,255,0.07)',
        color:        '#e2d9f3',
        fontSize:     '13px',
        fontWeight:   '500',
        cursor:       'pointer',
        transition:   'background 0.15s, border-color 0.15s, color 0.15s',
      });

      btn.addEventListener('mouseenter', () => {
        if (btn.dataset['characterId'] !== this._selected) {
          btn.style.background = 'rgba(124,58,237,0.25)';
        }
      });
      btn.addEventListener('mouseleave', () => {
        if (btn.dataset['characterId'] !== this._selected) {
          btn.style.background = 'rgba(255,255,255,0.07)';
        }
      });
      btn.addEventListener('click', () => {
        this._select(entry.id, true);
      });

      this._cards.set(entry.id, btn);
      grid.appendChild(btn);
    }
    card.appendChild(grid);

    // Confirm button
    const confirm = document.createElement('button');
    confirm.textContent = 'Start Exploring';
    Object.assign(confirm.style, {
      marginTop:    '4px',
      padding:      '13px 36px',
      borderRadius: '10px',
      border:       'none',
      background:   'linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%)',
      color:        '#fff',
      fontSize:     '15px',
      fontWeight:   '700',
      letterSpacing:'.03em',
      cursor:       'pointer',
      boxShadow:    '0 4px 16px rgba(124,58,237,0.4)',
      transition:   'opacity 0.15s',
    });
    confirm.addEventListener('mouseenter', () => { confirm.style.opacity = '0.88'; });
    confirm.addEventListener('mouseleave', () => { confirm.style.opacity = '1'; });
    confirm.addEventListener('click', () => {
      saveCharacter(this._selected);
      this._handler?.(this._selected);
      this.hide();
    });
    card.appendChild(confirm);

    overlay.appendChild(card);
    container.appendChild(overlay);

    // Store reference to name label for updates.
    overlay.dataset['nameLabel'] = 'ap-name'; // unused; we close over card
    // Keep nameLabel in closure via the returned overlay's child query.
    overlay.addEventListener('ap:select', ((e: CustomEvent<{ id: string; name: string }>) => {
      nameLabel.textContent = e.detail.name;
    }) as EventListener);

    return overlay;
  }

  // ── Selection ──────────────────────────────────────────────────────────────

  private _select(id: string, loadPreview: boolean): void {
    // Deselect previous.
    const prev = this._cards.get(this._selected);
    if (prev) {
      Object.assign(prev.style, {
        background:  'rgba(255,255,255,0.07)',
        borderColor: 'transparent',
        color:       '#e2d9f3',
      });
    }

    this._selected = id;

    // Highlight selected.
    const cur = this._cards.get(id);
    if (cur) {
      Object.assign(cur.style, {
        background:  'rgba(124,58,237,0.35)',
        borderColor: '#7c3aed',
        color:       '#fff',
      });
    }

    // Update name label.
    let name = id;
    try {
      name = CharacterLibrary.default.getCharacter(id).name;
    } catch { /* unknown id */ }
    this._overlay.dispatchEvent(new CustomEvent('ap:select', { detail: { id, name } }));

    // Swap 3-D preview.
    if (loadPreview) {
      try {
        const entry = CharacterLibrary.default.getCharacter(id);
        void this._preview.loadCharacter(entry);
      } catch { /* ignore */ }
    }
  }
}
