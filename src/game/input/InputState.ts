export class InputState {
  private _keys = new Set<string>();
  private _el: HTMLElement | Window | null = null;

  private _onDown = (e: KeyboardEvent) => { this._keys.add(e.code); };
  private _onUp   = (e: KeyboardEvent) => { this._keys.delete(e.code); };

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
  }

  isDown(code: string): boolean { return this._keys.has(code); }
}
