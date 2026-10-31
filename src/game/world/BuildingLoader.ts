import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { WorldManifest } from '../../geospatial/WorldBuilderClient';
import type { SceneManager } from '../rendering/SceneManager';

const DEFAULT_BASE_URL = 'http://localhost:8000';

function _backendBase(): string {
  const url = (typeof process !== 'undefined' && process.env.VITE_WORLDBUILDER_API_URL) || '';
  return url || DEFAULT_BASE_URL;
}

export class BuildingLoader {
  private _loader = new GLTFLoader();

  async load(manifest: WorldManifest, scene: SceneManager): Promise<THREE.Group> {
    const url = `${_backendBase()}${manifest.asset_urls['buildings']}`;
    const buildings: THREE.Group = await new Promise((resolve, reject) =>
      this._loader.load(url, gltf => resolve(gltf.scene), undefined, reject),
    );

    // Same ENU Z-up → Three.js Y-up rotation as terrain.
    buildings.rotation.x = -Math.PI / 2;
    buildings.castShadow = true;
    buildings.receiveShadow = false;

    scene.add(buildings);
    return buildings;
  }
}
