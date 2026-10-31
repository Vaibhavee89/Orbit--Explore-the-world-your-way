import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CharacterEntry } from '../player/CharacterLibrary';

const TARGET_HEIGHT = 1.8;
const IDLE_NAMES    = ['idle', 'standing idle', 'breathing idle'];
const ROT_SPEED     = 0.55; // rad/s

/**
 * A self-contained mini Three.js scene that renders a single character
 * in an idle-rotating pose for the avatar picker UI.
 *
 * Owns its own WebGLRenderer and RAF loop; operates independently of the
 * main game renderer.  Falls back to a purple capsule when the GLB is absent.
 */
export class CharacterPreview {
  readonly canvas: HTMLCanvasElement;

  private _renderer: THREE.WebGLRenderer;
  private _scene:    THREE.Scene;
  private _camera:   THREE.PerspectiveCamera;
  private _model:    THREE.Object3D | null = null;
  private _mixer:    THREE.AnimationMixer | null = null;
  private _rotY      = 0;
  private _rafId     = 0;
  private _lastTime  = 0;
  private _loading   = false;

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');

    this._renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
    });
    this._renderer.setSize(width, height);
    this._renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this._renderer.outputColorSpace = THREE.SRGBColorSpace;

    this._scene = new THREE.Scene();
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(2, 5, 3);
    this._scene.add(sun);
    const fill = new THREE.DirectionalLight(0x8888ff, 0.4);
    fill.position.set(-3, 1, -2);
    this._scene.add(fill);

    this._camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 50);
    this._camera.position.set(0, 1.1, 3.6);
    this._camera.lookAt(0, 1.1, 0);

    this._tick(0);
  }

  /**
   * Load a character GLB and start showing it.
   * Cancels any in-progress load before starting a new one.
   * Safe to call multiple times (previous model is disposed).
   */
  async loadCharacter(entry: CharacterEntry): Promise<void> {
    this._loading = true;
    this._clearModel();

    try {
      const gltf = await new GLTFLoader().loadAsync(entry.url);
      if (!this._loading) return; // another load was started; bail

      const root = gltf.scene as THREE.Group;
      root.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.castShadow    = true;
          o.receiveShadow = false;
        }
      });

      // Scale to TARGET_HEIGHT.
      const box = new THREE.Box3().setFromObject(root);
      const modelH = box.max.y - box.min.y;
      if (modelH > 0.01) root.scale.setScalar(TARGET_HEIGHT / modelH);

      // Centre on X/Z, sit feet on y=0.
      const box2 = new THREE.Box3().setFromObject(root);
      root.position.set(
        -(box2.min.x + box2.max.x) / 2,
        -box2.min.y,
        -(box2.min.z + box2.max.z) / 2,
      );

      this._scene.add(root);
      this._model = root;

      // Play idle animation.
      if (gltf.animations.length > 0) {
        const idleClip =
          gltf.animations.find(c => IDLE_NAMES.includes(c.name.toLowerCase())) ??
          gltf.animations[0];
        this._mixer = new THREE.AnimationMixer(root);
        this._mixer.clipAction(idleClip).play();
      }
    } catch {
      if (!this._loading) return;
      // GLB not available — show a placeholder capsule.
      const geo  = new THREE.CapsuleGeometry(0.35, 1.1, 4, 8);
      const mat  = new THREE.MeshStandardMaterial({ color: 0x7c3aed, roughness: 0.4 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = 0.9;
      this._scene.add(mesh);
      this._model = mesh;
    }

    this._loading = false;
  }

  dispose(): void {
    this._loading = false;
    cancelAnimationFrame(this._rafId);
    this._clearModel();
    this._renderer.dispose();
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _clearModel(): void {
    if (this._model) {
      this._scene.remove(this._model);
      if (this._mixer) {
        this._mixer.uncacheRoot(this._model);
        this._mixer = null;
      }
      this._model = null;
    }
  }

  private _tick(time: number): void {
    this._rafId = requestAnimationFrame(t => this._tick(t));
    const dt = Math.min((time - this._lastTime) / 1000, 0.05);
    this._lastTime = time;

    this._rotY += ROT_SPEED * dt;
    if (this._model) this._model.rotation.y = this._rotY;
    this._mixer?.update(dt);
    this._renderer.render(this._scene, this._camera);
  }
}
