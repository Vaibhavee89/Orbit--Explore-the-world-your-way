import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const cesiumSource = 'node_modules/cesium/Build/Cesium';
const cesiumBaseUrl = 'cesium';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
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
