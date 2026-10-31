import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Parsed result returned from Vi3WAssetImporter.
 *
 * model      — the GLTF scene root (THREE.Group), ready to add to a scene.
 * size       — axis-aligned bounding box extents in object space (metres).
 * center     — bounding box centre in object space (metres).
 * animations — all AnimationClip objects embedded in the GLB.
 */
export interface Vi3WAsset {
  model:      THREE.Group;
  size:       THREE.Vector3;
  center:     THREE.Vector3;
  animations: THREE.AnimationClip[];
}

/**
 * Generic loader / parser for Vi3W-generated GLB assets.
 *
 * Two entry points:
 *   Vi3WAssetImporter.load(url)       — fetch + parse a GLB from a URL
 *   Vi3WAssetImporter.fromScene(...)  — parse an already-loaded Three.js scene
 *
 * The static methods are dependency-free (no network, no WebGL) so they are
 * straightforward to unit-test with synthetic geometry.
 */
export class Vi3WAssetImporter {
  private _loader: GLTFLoader;

  constructor(loader?: GLTFLoader) {
    this._loader = loader ?? new GLTFLoader();
  }

  /** Load a GLB/GLTF from a URL and return a Vi3WAsset. */
  async load(url: string): Promise<Vi3WAsset> {
    const gltf = await this._loader.loadAsync(url);
    return Vi3WAssetImporter.fromGLTF(gltf);
  }

  // ── Static helpers ──────────────────────────────────────────────────────────

  /**
   * Build a Vi3WAsset from a raw GLTF parse result.
   * Useful when the caller already holds a GLTF object (e.g. from a shared
   * GLTFLoader cache).
   */
  static fromGLTF(gltf: GLTF): Vi3WAsset {
    return Vi3WAssetImporter.fromScene(
      gltf.scene as THREE.Group,
      gltf.animations,
    );
  }

  /**
   * Build a Vi3WAsset from an arbitrary Three.js scene graph and clip list.
   *
   * Computes an axis-aligned bounding box over the entire subtree (including
   * all child meshes and their world transforms) and returns its size and
   * centre in the model's local coordinate space.
   *
   * This method has no I/O or WebGL dependencies and is safe to call in
   * any environment (browser, Node, test runner).
   */
  static fromScene(
    model:      THREE.Group,
    animations: THREE.AnimationClip[],
  ): Vi3WAsset {
    const box    = new THREE.Box3().setFromObject(model);
    const size   = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    return { model, size, center, animations };
  }
}
