export type TickFn   = (fixedDt: number) => void;
export type RenderFn = (alpha: number) => void;

export const FIXED_STEP = 1 / 60;

// Clamp frame time to avoid spiral-of-death on tab-switch/debugger pause.
const MAX_FRAME_TIME = 0.25;

export class GameLoop {
  private _rafId = 0;
  private _lastTime = 0;
  private _accumulator = 0;
  private _running = false;

  get running(): boolean { return this._running; }

  start(tick: TickFn, render: RenderFn): void {
    if (this._running) return;
    this._running = true;
    this._accumulator = 0;
    this._lastTime = performance.now();

    const loop = (now: number) => {
      if (!this._running) return;
      const dt = Math.min((now - this._lastTime) / 1000, MAX_FRAME_TIME);
      this._lastTime = now;
      this._accumulator += dt;
      while (this._accumulator >= FIXED_STEP) {
        tick(FIXED_STEP);
        this._accumulator -= FIXED_STEP;
      }
      render(this._accumulator / FIXED_STEP);
      this._rafId = requestAnimationFrame(loop);
    };

    this._rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    this._running = false;
    cancelAnimationFrame(this._rafId);
  }
}
