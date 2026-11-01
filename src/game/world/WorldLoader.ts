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
    console.info(`[WorldLoader] Loading: ${url}`);
    loader.load(
      url,
      (gltf) => {
        console.info(`[WorldLoader] ✓ Loaded: ${url}`);
        resolve(gltf.scene);
      },
      (progress) => {
        const pct = Math.round((progress.loaded / progress.total) * 100);
        console.debug(`[WorldLoader] ${url}: ${pct}%`);
      },
      (err) => {
        console.error(`[WorldLoader] ✗ Failed to load: ${url}`, err);
        reject(err);
      }
    );
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
    console.info('[WorldLoader] Loading world:', {
      id: manifest.id,
      assets: manifest.assets,
      asset_urls: manifest.asset_urls,
      stats: manifest.stats,
    });

    const terrainUrl = _resolveAssetUrl(manifest.asset_urls['terrain']);
    console.info(`[WorldLoader] Terrain URL: ${terrainUrl}`);

    try {
      const terrain = await _loadGltf(this._loader, terrainUrl);

      // Terrain vertices are in ENU metres (Z-up from terrain_processor).
      // Three.js is Y-up; the GLB exporter preserves the raw ENU axes, so
      // we rotate -90° around X to bring Z-up → Y-up.
      terrain.rotation.x = -Math.PI / 2;
      terrain.castShadow = true;
      terrain.receiveShadow = true;

      // Add realistic material (no wireframe)
      terrain.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Replace with a colored material (terrain green/brown gradient)
          child.material = new THREE.MeshPhongMaterial({
            color: 0x6b8e23, // Olive/terrain green
            emissive: 0x1a1a1a,
            shininess: 10,
            flatShading: false,
            wireframe: false,
          });
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      scene.add(terrain);
      console.info('[WorldLoader] ✓ World loaded successfully');
      return { terrain };
    } catch (err) {
      console.error('[WorldLoader] ✗ World load failed:', err);
      throw err;
    }
  }
}
