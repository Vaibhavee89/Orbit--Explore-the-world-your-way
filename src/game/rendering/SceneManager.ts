import * as THREE from 'three';

export class SceneManager {
  readonly scene = new THREE.Scene();
  private _ambient: THREE.AmbientLight;
  private _sun: THREE.DirectionalLight;

  constructor() {
    this.scene.background = new THREE.Color(0x0a0a1a);

    this._ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this._ambient);

    this._sun = new THREE.DirectionalLight(0xffffff, 1.2);
    this._sun.position.set(5, 8, 5);
    this._sun.castShadow = true;
    this._sun.shadow.mapSize.setScalar(1024);
    // Wide shadow frustum so a 500m terrain + props all cast/receive shadows.
    const cam = this._sun.shadow.camera as THREE.OrthographicCamera;
    cam.left = -260; cam.right = 260; cam.top = 260; cam.bottom = -260;
    cam.near = 1; cam.far = 600;
    this.scene.add(this._sun);
  }

  /**
   * Override ambient/sun color, intensity, and sun direction — used for
   * per-world mood (e.g. golden-hour for a mountain village, cool blue for
   * an arctic world).
   */
  setLighting(opts: {
    sunColor?: number; sunIntensity?: number; sunPosition?: [number, number, number];
    ambientColor?: number; ambientIntensity?: number;
  }): void {
    if (opts.sunColor !== undefined) this._sun.color.setHex(opts.sunColor);
    if (opts.sunIntensity !== undefined) this._sun.intensity = opts.sunIntensity;
    if (opts.sunPosition) this._sun.position.set(...opts.sunPosition);
    if (opts.ambientColor !== undefined) this._ambient.color.setHex(opts.ambientColor);
    if (opts.ambientIntensity !== undefined) this._ambient.intensity = opts.ambientIntensity;
  }

  add(...objects: THREE.Object3D[]): void {
    this.scene.add(...objects);
  }

  remove(...objects: THREE.Object3D[]): void {
    this.scene.remove(...objects);
  }

  dispose(): void {
    this.scene.traverse(obj => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach(m => m.dispose());
    });
  }
}
