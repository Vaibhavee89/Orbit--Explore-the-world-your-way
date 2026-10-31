import * as THREE from 'three';
import { GameLoop } from './GameLoop';
import { GameRenderer } from '../rendering/Renderer';
import { SceneManager } from '../rendering/SceneManager';

export class Game {
  private _loop     = new GameLoop();
  private _renderer: GameRenderer | null = null;
  private _scene:    SceneManager | null = null;
  private _camera:   THREE.PerspectiveCamera | null = null;
  private _cube:     THREE.Mesh | null = null;
  private _angle    = 0;
  private _resizeObs: ResizeObserver | null = null;

  get running(): boolean { return this._loop.running; }

  start(canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth  || canvas.width  || 800;
    const h = canvas.clientHeight || canvas.height || 600;

    this._renderer = new GameRenderer(canvas);
    this._scene    = new SceneManager();

    this._camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
    this._camera.position.set(0, 1.5, 4);
    this._camera.lookAt(0, 0, 0);

    // Spinning demo cube
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshStandardMaterial({ color: 0xa78bfa, roughness: 0.4, metalness: 0.2 });
    this._cube = new THREE.Mesh(geo, mat);
    this._cube.castShadow = true;
    this._scene.add(this._cube);

    // Floor grid so the cube has a reference plane
    this._scene.add(new THREE.GridHelper(10, 10, 0x38bdf833, 0x38bdf811));

    this._resizeObs = new ResizeObserver(() => this._onResize(canvas));
    this._resizeObs.observe(canvas.parentElement ?? canvas);

    this._loop.start(
      (dt) => this._tick(dt),
      (alpha) => this._render(alpha),
    );
  }

  private _tick(dt: number): void {
    this._angle += dt;
    if (this._cube) {
      this._cube.rotation.y = this._angle;
      this._cube.rotation.x = this._angle * 0.4;
    }
  }

  private _render(_alpha: number): void {
    if (this._renderer && this._scene && this._camera) {
      this._renderer.render(this._scene.scene, this._camera);
    }
  }

  private _onResize(canvas: HTMLCanvasElement): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    this._renderer?.resize(w, h);
    if (this._camera) {
      this._camera.aspect = w / h;
      this._camera.updateProjectionMatrix();
    }
  }

  stop(): void {
    this._loop.stop();
    this._resizeObs?.disconnect();
  }

  dispose(): void {
    this.stop();
    this._scene?.dispose();
    this._renderer?.dispose();
    this._cube = this._camera = this._scene = this._renderer = null;
  }
}
