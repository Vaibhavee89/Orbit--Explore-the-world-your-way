import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationController, type AnimState } from './AnimationController';
import type { SceneManager } from '../rendering/SceneManager';

// Capsule geometry constants (must match CharacterController and PlayerCapsule).
// Capsule half-height 0.6, radius 0.4 → total height 2.0 m, centre-to-feet = 1.0 m.
const FOOT_OFFSET      = 1.0;   // capsule centre Y → foot Y (metres, downward)
const TARGET_HEIGHT    = 1.8;   // auto-scale avatar to this height (metres)

// Candidate clip name sets — first match wins (case-insensitive).
const CLIP_CANDIDATES: Record<AnimState, string[]> = {
  idle: ['idle', 'Idle', 'IDLE', 'Standing Idle', 'Breathing Idle'],
  walk: ['walk', 'Walk', 'WALK', 'Walking', 'walk_forward'],
  run:  ['run',  'Run',  'RUN',  'Running',  'run_forward', 'fast_run'],
  jump: ['jump', 'Jump', 'JUMP', 'Jumping',  'jump_up'],
  fall: ['fall', 'Fall', 'FALL', 'Falling',  'jump_fall'],
};

function _findClip(clips: THREE.AnimationClip[], state: AnimState): THREE.AnimationClip | null {
  for (const name of CLIP_CANDIDATES[state]) {
    const clip = clips.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (clip) return clip;
  }
  return null;
}

/**
 * Full player visual: a loaded GLTF avatar with animation state machine.
 *
 * Position in world space is the PHYSICS capsule centre; the visual root is
 * offset down by FOOT_OFFSET so the avatar's feet land at the capsule base.
 *
 * Use Player.load() as the async factory. Falls back gracefully when clips
 * are missing (the Soldier.glb has Idle / Walk / Run but no Jump / Fall clip).
 */
export class Player {
  readonly root: THREE.Group;
  private _mixer:    THREE.AnimationMixer;
  private _animCtrl: AnimationController;

  private constructor(
    root:     THREE.Group,
    mixer:    THREE.AnimationMixer,
    animCtrl: AnimationController,
  ) {
    this.root     = root;
    this._mixer   = mixer;
    this._animCtrl = animCtrl;
  }

  /** Returns the PHYSICS capsule centre (same coordinate space used by CameraManager). */
  get position(): THREE.Vector3 {
    // Add FOOT_OFFSET back so callers get the capsule centre, not the root.
    const p = this.root.position.clone();
    p.y += FOOT_OFFSET;
    return p;
  }

  setPosition(x: number, y: number, z: number): void {
    // y is capsule centre; avatar root sits FOOT_OFFSET below.
    this.root.position.set(x, y - FOOT_OFFSET, z);
  }

  /**
   * Sync position + facing from CharacterController, and tick the animation
   * state machine.
   *
   * @param pos  Physics capsule centre.
   * @param worldDx / worldDz  Normalised movement direction in world XZ.
   * @param horizontalSpeed  Actual horizontal speed (m/s) for animation blend.
   * @param isGrounded  Grounding flag from KCC.
   * @param vertVel  Vertical velocity (m/s) from KCC — used for jump vs fall.
   */
  syncFromPhysics(
    pos:             { x: number; y: number; z: number },
    worldDx:         number,
    worldDz:         number,
    horizontalSpeed: number,
    isGrounded:      boolean,
    vertVel:         number,
  ): void {
    this.root.position.set(pos.x, pos.y - FOOT_OFFSET, pos.z);
    if (Math.abs(worldDx) > 0.001 || Math.abs(worldDz) > 0.001) {
      this.root.rotation.y = Math.atan2(worldDx, worldDz);
    }
    this._animCtrl.update(horizontalSpeed, isGrounded, vertVel);
  }

  /** Advance the AnimationMixer. Pass REAL elapsed time (not fixed dt) for smooth blends. */
  updateMixer(realDt: number): void {
    this._mixer.update(realDt);
  }

  dispose(scene: SceneManager): void {
    scene.remove(this.root);
    this._animCtrl.dispose();
    this._mixer.uncacheRoot(this.root);
  }

  /**
   * Async factory — loads a GLTF file and returns a ready Player.
   * Throws if the network request fails; let the caller fall back to the capsule.
   */
  static async load(url: string, scene: SceneManager): Promise<Player> {
    const loader = new GLTFLoader();
    const gltf   = await loader.loadAsync(url);
    const root   = gltf.scene as THREE.Group;

    // Enable shadows on every mesh.
    root.traverse(obj => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow    = true;
        obj.receiveShadow = true;
      }
    });

    // Auto-scale: measure the unscaled bounding box, scale to TARGET_HEIGHT.
    const box = new THREE.Box3().setFromObject(root);
    const modelHeight = box.max.y - box.min.y;
    if (modelHeight > 0.01) {
      root.scale.setScalar(TARGET_HEIGHT / modelHeight);
    }

    scene.add(root);

    // Build animation map.
    const mixer  = new THREE.AnimationMixer(root);
    const clipMap = new Map<AnimState, THREE.AnimationAction>();
    for (const state of ['idle', 'walk', 'run', 'jump', 'fall'] as AnimState[]) {
      const clip = _findClip(gltf.animations, state);
      if (clip) {
        clipMap.set(state, mixer.clipAction(clip));
        console.info(`[Player] clip "${state}" ← "${clip.name}"`);
      } else {
        console.warn(`[Player] no clip found for state "${state}"`);
      }
    }

    const animCtrl = new AnimationController(mixer, clipMap);
    return new Player(root, mixer, animCtrl);
  }
}
