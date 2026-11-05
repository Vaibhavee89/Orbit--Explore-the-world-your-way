import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

// Shared across every caller — the WASM decoder only needs to be
// initialized once per page load.
const _dracoLoader = new DRACOLoader();
// Google's public CDN — the same decoder path used by Three.js's own
// official examples. No API key, no local file-serving setup required.
_dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

/**
 * Create a GLTFLoader with Draco and Meshopt decoders configured.
 *
 * tools/optimize-assets.sh produces Draco-compressed props and
 * Meshopt-compressed character avatars (see its --compress flags). Without
 * setDRACOLoader/setMeshoptDecoder, GLTFLoader can't decode either, and a
 * load silently fails — props fall back to a placeholder sphere, characters
 * fail to appear at all. Use this factory everywhere a GLTFLoader is needed
 * instead of `new GLTFLoader()` directly.
 */
export function createGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader();
  loader.setDRACOLoader(_dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);
  return loader;
}
