/**
 * Keyboard input for the player character.
 *
 * Provides normalised movement intent, edge-triggered jump, and sprint state.
 * Replaces InputState for game use; InputState remains for simpler tools.
 */
/** Keys that scroll the page by default — suppressed during gameplay. */
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class InputManager {
  private _keys        = new Set<string>();
  private _justPressed = new Set<string>();
  private _el: HTMLElement | Window | null = null;

  private _onDown = (e: KeyboardEvent) => {
    // Without this, the browser scrolls the embedded page on these keys
    // while the player moves/jumps. Skip when typing in an editable element
    // so search fields etc. still work normally.
    const t = e.target as HTMLElement | null;
    const editable = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if (!editable && GAME_KEYS.has(e.code)) e.preventDefault();

    if (!this._keys.has(e.code)) this._justPressed.add(e.code);
    this._keys.add(e.code);
  };
  private _onUp = (e: KeyboardEvent) => {
    this._keys.delete(e.code);
  };

  bind(el: HTMLElement | Window = window): void {
    this._el = el;
    el.addEventListener('keydown', this._onDown as EventListener);
    el.addEventListener('keyup',   this._onUp   as EventListener);
  }

  unbind(): void {
    if (!this._el) return;
    this._el.removeEventListener('keydown', this._onDown as EventListener);
    this._el.removeEventListener('keyup',   this._onUp   as EventListener);
    this._el = null;
    this._keys.clear();
    this._justPressed.clear();
  }

  isDown(code: string): boolean { return this._keys.has(code); }

  /**
   * Normalised movement intent in camera-local space (length ≤ 1).
   *   z = +1 forward (W/↑),  z = -1 backward (S/↓)
   *   x = +1 right (D/→),    x = -1 left (A/←)
   */
  get moveDir(): { x: number; z: number } {
    let x = 0, z = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp'))    z += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown'))  z -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft'))  x -= 1;
    if (x !== 0 || z !== 0) {
      const len = Math.hypot(x, z);
      x /= len;
      z /= len;
    }
    return { x, z };
  }

  /** True if Space was newly pressed since the last consumeJump() call. */
  get jumpPressed(): boolean { return this._justPressed.has('Space'); }

  /** Mark the jump intent as consumed so it fires only once per press. */
  consumeJump(): void { this._justPressed.delete('Space'); }

  /** True if `code` was newly pressed since the last consumeKey(code) call. */
  wasJustPressed(code: string): boolean { return this._justPressed.has(code); }

  /** Mark a key's "just pressed" state as consumed (edge-triggered toggles). */
  consumeKey(code: string): void { this._justPressed.delete(code); }

  /** True while either Shift key is held (walk → run). */
  get sprint(): boolean {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight');
  }
}
