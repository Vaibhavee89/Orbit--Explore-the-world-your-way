import {
  Viewer,
  createGooglePhotorealistic3DTileset,
  Cartesian3,
  Math as CesiumMath,
  HeadingPitchRange,
  GoogleMaps,
  Ion,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

// Injected by vite.config.ts define.
declare const CESIUM_BASE_URL: string;

export interface CesiumViewerOptions {
  /** DOM element to mount the Cesium widget into. */
  container: HTMLElement;
  /** Google Maps Tiles API key (required for photorealistic 3D tiles). */
  googleMapsApiKey: string;
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
   * Create and mount a Cesium viewer with Google Photorealistic 3D tiles.
   * Globe rendering is disabled; only the tileset provides geometry.
   */
  static async create(opts: CesiumViewerOptions): Promise<OrbitCesiumViewer> {
    // Point Cesium's static asset loader at the path served by vite-plugin-static-copy.
    // CESIUM_BASE_URL is injected by vite.config.ts define.
    (window as unknown as Record<string, unknown>).CESIUM_BASE_URL =
      typeof CESIUM_BASE_URL !== 'undefined' ? CESIUM_BASE_URL : '/cesium';

    // Disable Ion (we're using Google tiles directly, not Cesium Ion).
    Ion.defaultAccessToken = '';

    // Set the Google Maps API key on the GoogleMaps singleton so
    // createGooglePhotorealistic3DTileset can pick it up.
    GoogleMaps.defaultApiKey = opts.googleMapsApiKey;

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
      // Disable the default imagery layer (sky/globe); 3D tiles cover the ground.
      globe: false,
      // Black sky background — avoids the distracting blue sphere.
      skyBox: false,
      skyAtmosphere: false,
    });

    // Load Google Photorealistic 3D Tiles.
    const tileset = await createGooglePhotorealistic3DTileset({
      key: opts.googleMapsApiKey,
      // Suppress the geocoder warning — we're not using Cesium's geocoder.
      onlyUsingWithGoogleGeocoder: true,
    });
    viewer.scene.primitives.add(tileset);

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
