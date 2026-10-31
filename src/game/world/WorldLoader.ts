import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WorldManifest } from '../../geospatial/WorldBuilderClient';
import type { SceneManager } from '../rendering/SceneManager';

const DEFAULT_BASE_URL = 'http://localhost:8000';

function _backendBase(): string {
  const url =
    (typeof process !== 'undefined' && process.env.VITE_WORLDBUILDER_API_URL) || '';
  return url || DEFAULT_BASE_URL;
}

function _resolveAssetUrl(relPath: string): string {
  // asset_urls values are absolute paths: /worlds/{id}/terrain.glb
  return `${_backendBase()}${relPath}`;
}

function _loadGltf(loader: GLTFLoader, url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    loader.load(url, gltf => resolve(gltf.scene), undefined, reject);
  });
}

export interface WorldAssets {
  terrain: THREE.Group;
}

export class WorldLoader {
  private _loader = new GLTFLoader();

  /**
   * Load terrain GLB from manifest, add it to scene, return loaded assets.
   * The cube demo already in scene is removed by Game.loadWorld() before calling this.
   */
  async load(manifest: WorldManifest, scene: SceneManager): Promise<WorldAssets> {
    const terrainUrl = _resolveAssetUrl(manifest.asset_urls['terrain']);
    const terrain = await _loadGltf(this._loader, terrainUrl);

    // Terrain vertices are in ENU metres (Z-up from terrain_processor).
    // Three.js is Y-up; the GLB exporter preserves the raw ENU axes, so
    // we rotate -90° around X to bring Z-up → Y-up.
    terrain.rotation.x = -Math.PI / 2;
    terrain.castShadow = true;
    terrain.receiveShadow = true;

    scene.add(terrain);
    return { terrain };
  }
}
