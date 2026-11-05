import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import wasm from 'vite-plugin-wasm';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesium';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      // @dimforge/rapier3d loads its WASM via a top-level await.
      // vite-plugin-wasm needs either a companion top-level-await plugin or
      // an esnext build target to support that — vite-plugin-top-level-await
      // is currently broken against this project's Vite/SWC/esbuild
      // versions (crashes mid-build with "missing field `type`"), so esnext
      // is the working fix here. Requires modern browsers (Chrome 89+,
      // Firefox 89+, Safari 15+ — acceptable for a WebGL2 3D game).
      build: {
        target: 'esnext',
      },
      plugins: [
        wasm(),
        viteStaticCopy({
          targets: [
            { src: `${cesiumSource}/Workers/*`, dest: `${cesiumBaseUrl}/Workers` },
            { src: `${cesiumSource}/ThirdParty/*`, dest: `${cesiumBaseUrl}/ThirdParty` },
            { src: `${cesiumSource}/Assets/*`, dest: `${cesiumBaseUrl}/Assets` },
            { src: `${cesiumSource}/Widgets/*`, dest: `${cesiumBaseUrl}/Widgets` },
          ],
        }),
      ],
      define: {
        // Travel Mode keys
        'process.env.OPENAI_API_KEY': JSON.stringify(env.OPENAI_API_KEY),
        'process.env.GOOGLE_MAPS_API_KEY': JSON.stringify(env.GOOGLE_MAPS_API_KEY),
        // Adventure Mode / shared keys (also accessible as import.meta.env.VITE_*)
        'process.env.VITE_MAP_TILES_API_KEY': JSON.stringify(env.VITE_MAP_TILES_API_KEY ?? env.VITE_GOOGLE_MAPS_API_KEY ?? env.GOOGLE_MAPS_API_KEY),
        'process.env.VITE_GOOGLE_MAPS_API_KEY': JSON.stringify(env.VITE_GOOGLE_MAPS_API_KEY ?? env.GOOGLE_MAPS_API_KEY),
        'process.env.VITE_WORLDBUILDER_API_URL': JSON.stringify(env.VITE_WORLDBUILDER_API_URL ?? ''),
        CESIUM_BASE_URL: JSON.stringify(`/${cesiumBaseUrl}`),
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
