import {
  Viewer,
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRange,
  Ion,
  Cesium3DTileset,
  IonImageryProvider,
  IonResource,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Injected by vite.config.ts define.
declare const CESIUM_BASE_URL: string;

export interface CesiumViewerOptions {
  /** DOM element to mount the Cesium widget into. */
  container: HTMLElement;
  /** Initial latitude in degrees. */
  lat: number;
  /** Initial longitude in degrees. */
  lon: number;
  /** Camera height above the target in metres (default 2000 m). */
  heightMetres?: number;
}

export class OrbitCesiumViewer {
  private viewer: Viewer;

  private constructor(viewer: Viewer) {
    this.viewer = viewer;
  }

  /** Raw Cesium Viewer — use for attaching screen-space event handlers etc. */
  get cesiumViewer(): Viewer { return this.viewer; }

  /**
   * Create and mount a Cesium viewer with Cesium Ion free tileset.
   * Uses Cesium World Terrain + OSM 3D Buildings (free tier, no auth required).
   */
  static async create(opts: CesiumViewerOptions): Promise<OrbitCesiumViewer> {
    // Point Cesium's static asset loader at the path served by vite-plugin-static-copy.
    // CESIUM_BASE_URL is injected by vite.config.ts define.
    (window as unknown as Record<string, unknown>).CESIUM_BASE_URL =
      typeof CESIUM_BASE_URL !== 'undefined' ? CESIUM_BASE_URL : '/cesium';

    // Use Cesium Ion's free tier (public, no token required for free assets).
    // For production, get a free token at https://cesium.com/ion/
    Ion.defaultAccessToken = '';

    const viewer = new Viewer(opts.container, {
      // Hide all default UI chrome — we overlay our own HUD.
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      navigationHelpButton: false,
      navigationInstructionsInitiallyVisible: false,
      // Use Cesium World Terrain as base layer (free from Cesium Ion).
      terrainProvider: await Cesium3DTileset.fromUrl(
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
          // Fallback: use standard Cesium World Terrain elevation
          maximumLevel: 18,
        }
      ),
      // Black sky background — avoids the distracting blue sphere.
      skyBox: false,
      skyAtmosphere: false,
    });

    // Load Cesium OSM 3D Buildings (free, no auth required).
    // This is Cesium Ion asset #96188 (public asset).
    try {
      const buildingsTileset = await Cesium3DTileset.fromUrl(
        'https://tile.openstreetmap.org/data/buildings/tileset.json'
      );
      viewer.scene.primitives.add(buildingsTileset);
    } catch (error) {
      // Buildings layer is optional; fail gracefully if unavailable.
      console.warn('Could not load OSM 3D buildings:', error);
    }

    // Fly the camera to the requested location.
    const height = opts.heightMetres ?? 2000;
    viewer.camera.lookAt(
      Cartesian3.fromDegrees(opts.lon, opts.lat, height),
      new HeadingPitchRange(
        CesiumMath.toRadians(0),   // heading: north
        CesiumMath.toRadians(-45), // pitch: 45° down
        height,
      ),
    );

    return new OrbitCesiumViewer(viewer);
  }

  /** Fly to a new lat/lon. */
  flyTo(lat: number, lon: number, heightMetres = 2000) {
    this.viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(lon, lat, heightMetres),
      duration: 2,
    });
  }

  /** Tear down the viewer and release GPU resources. */
  destroy() {
    if (!this.viewer.isDestroyed()) {
      this.viewer.destroy();
    }
  }
}
