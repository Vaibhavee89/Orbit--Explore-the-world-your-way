import * as THREE from 'three';

export type AnimState = 'idle' | 'walk' | 'run' | 'jump' | 'fall';

const BLEND_TIME           = 0.2;  // crossfade duration (seconds)
const WALK_SPEED_THRESHOLD = 0.5;  // m/s — below this → idle
const RUN_SPEED_THRESHOLD  = 4.0;  // m/s — above this → run

/**
 * Manages Three.js AnimationMixer state transitions for the player.
 *
 * States: idle → walk → run (grounded, by speed)
 *         grounded + rising vertVel → jump → fall (airborne)
 *
 * Missing clips degrade gracefully: fall falls back to jump, jump to run,
 * run to walk, walk to idle.
 */
export class AnimationController {
  private _mixer:   THREE.AnimationMixer;
  private _clips:   Map<AnimState, THREE.AnimationAction>;
  private _current: THREE.AnimationAction | null = null;
  private _state:   AnimState = 'idle';

  constructor(
    mixer: THREE.AnimationMixer,
    clips: Map<AnimState, THREE.AnimationAction>,
  ) {
    this._mixer = mixer;
    this._clips = clips;
    const idle = clips.get('idle');
    if (idle) { idle.play(); this._current = idle; }
  }

  get state(): AnimState { return this._state; }

  /**
   * Evaluate next state and crossfade if it changed.
   * Called once per physics tick (before mixer.update).
   */
  update(horizontalSpeed: number, isGrounded: boolean, vertVel: number): void {
    let next: AnimState;
    if (!isGrounded) {
      next = vertVel >= -1 ? 'jump' : 'fall';
    } else if (horizontalSpeed < WALK_SPEED_THRESHOLD) {
      next = 'idle';
    } else if (horizontalSpeed < RUN_SPEED_THRESHOLD) {
      next = 'walk';
    } else {
      next = 'run';
    }

    if (next !== this._state) this._crossfadeTo(next);
  }

  private _crossfadeTo(state: AnimState): void {
    // Fallback order when a clip is unavailable.
    const fallbacks: AnimState[] = [state, 'fall', 'jump', 'run', 'walk', 'idle'];
    let action: THREE.AnimationAction | undefined;
    for (const s of fallbacks) {
      action = this._clips.get(s);
      if (action) { break; }
    }
    if (!action || action === this._current) return;

    action.reset().play();
    if (this._current) action.crossFadeFrom(this._current, BLEND_TIME, false);
    this._current = action;
    this._state   = state;
  }

  dispose(): void {
    this._mixer.stopAllAction();
  }
}
