import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface CesiumViewerOptions {
  /** DOM element to mount the map into. */
  container: HTMLElement;
  /** Initial latitude in degrees. */
  lat: number;
  /** Initial longitude in degrees. */
  lon: number;
  /** Camera height above the target in metres (ignored for 2D map). */
  heightMetres?: number;
}

export class OrbitCesiumViewer {
  private map: L.Map;

  private constructor(map: L.Map) {
    this.map = map;
  }

  /** Raw Leaflet Map — use for attaching event handlers etc. */
  get cesiumViewer(): L.Map { return this.map; }

  /**
   * Create and mount a Leaflet map with OpenStreetMap tiles.
   * Free, no authentication required.
   */
  static async create(opts: CesiumViewerOptions): Promise<OrbitCesiumViewer> {
    const map = L.map(opts.container, {
      attributionControl: true,
      zoomControl: true,
      dragging: true,
      zoom: 15,
      center: [opts.lat, opts.lon],
    });

    // OpenStreetMap tiles — free, no auth required.
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // Fly to the requested location.
    map.setView([opts.lat, opts.lon], 15);

    return new OrbitCesiumViewer(map);
  }

  /** Pan to a new lat/lon. */
  flyTo(lat: number, lon: number, heightMetres?: number) {
    this.map.flyTo([lat, lon], 15, { duration: 2 });
  }

  /** Tear down the map and release resources. */
  destroy() {
    this.map.remove();
  }
}
