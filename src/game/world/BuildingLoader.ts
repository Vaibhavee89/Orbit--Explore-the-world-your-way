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
    console.info(`[BuildingLoader] Loading: ${url}`);

    const buildings: THREE.Group = await new Promise((resolve, reject) =>
      this._loader.load(
        url,
        gltf => resolve(gltf.scene),
        (progress) => console.debug(`[BuildingLoader] ${Math.round((progress.loaded / progress.total) * 100)}%`),
        (err) => {
          console.error(`[BuildingLoader] Failed to load: ${url}`, err);
          reject(err);
        },
      ),
    );

    // Same ENU Z-up → Three.js Y-up rotation as terrain.
    buildings.rotation.x = -Math.PI / 2;
    buildings.castShadow = true;
    buildings.receiveShadow = false;

    // Add materials to buildings (reddish/brown)
    buildings.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshPhongMaterial({
          color: 0xc84c2a, // Reddish-brown (building color)
          emissive: 0x0a0a0a,
          shininess: 5,
          flatShading: false,
        });
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    scene.add(buildings);
    console.info('[BuildingLoader] ✓ Buildings loaded');
    return buildings;
  }
}
