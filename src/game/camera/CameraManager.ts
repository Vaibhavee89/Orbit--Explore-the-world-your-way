import * as THREE from 'three';

const MIN_PHI         = 0.08;                  // near-top clamp (avoids gimbal)
const MAX_PHI         = Math.PI / 2 - 0.05;   // near-horizon clamp
const DRAG_SENSITIVITY = 0.005;               // rad per pixel
const ZOOM_SENSITIVITY = 0.1;
const MIN_RADIUS      = 3;
const MAX_RADIUS      = 80;

/**
 * Third-person orbit camera.
 *
 * - Mouse-drag: orbits around the target (yaw = theta, pitch = phi).
 * - Scroll-wheel: zooms in/out.
 * - update(camera, target): positions the camera on a sphere of radius _radius
 *   centred on *target* and aims it at target + (0, lookAtOffset, 0).
 *
 * Coordinate conventions (ENU → Three.js Y-up):
 *   theta=0  → camera sits on +Z axis relative to target (behind the player
 *               when the player faces –Z / north).
 *   phi      → polar angle from the +Y axis: 0 = directly above, π/2 = equator.
 */
export class CameraManager {
  private _theta: number;
  private _phi: number;
  private _radius: number;
  private _lookAtOffset: number;

  private _canvas: HTMLCanvasElement | null = null;
  private _dragging = false;
  private _lastX = 0;
  private _lastY = 0;

  private _onMouseDown = (e: MouseEvent) => {
    this._dragging = true;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
  };

  private _onMouseMove = (e: MouseEvent) => {
    if (!this._dragging) return;
    const dx = e.clientX - this._lastX;
    const dy = e.clientY - this._lastY;
    this._lastX = e.clientX;
    this._lastY = e.clientY;
    this._theta -= dx * DRAG_SENSITIVITY;
    this._phi = THREE.MathUtils.clamp(
      this._phi + dy * DRAG_SENSITIVITY,
      MIN_PHI,
      MAX_PHI,
    );
  };

  private _onMouseUp = () => { this._dragging = false; };

  private _onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this._radius = THREE.MathUtils.clamp(
      this._radius + e.deltaY * ZOOM_SENSITIVITY,
      MIN_RADIUS,
      MAX_RADIUS,
    );
  };

  constructor(radius = 12, phi = Math.PI / 4, lookAtOffset = 1.0) {
    this._radius      = radius;
    this._phi         = phi;
    this._lookAtOffset = lookAtOffset;
    this._theta       = 0;
  }

  /** Current yaw angle (radians). PlayerCapsule uses this for WASD directions. */
  get yaw(): number { return this._theta; }

  bind(canvas: HTMLCanvasElement): void {
    this._canvas = canvas;
    canvas.addEventListener('mousedown', this._onMouseDown);
    canvas.addEventListener('mousemove', this._onMouseMove);
    canvas.addEventListener('mouseup',   this._onMouseUp);
    canvas.addEventListener('mouseleave', this._onMouseUp);
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  unbind(): void {
    if (!this._canvas) return;
    this._canvas.removeEventListener('mousedown', this._onMouseDown);
    this._canvas.removeEventListener('mousemove', this._onMouseMove);
    this._canvas.removeEventListener('mouseup',   this._onMouseUp);
    this._canvas.removeEventListener('mouseleave', this._onMouseUp);
    this._canvas.removeEventListener('wheel', this._onWheel);
    this._canvas = null;
  }

  /** Position *camera* on the orbit sphere around *target* and aim it inward. */
  update(camera: THREE.PerspectiveCamera, target: THREE.Vector3): void {
    const sinPhi = Math.sin(this._phi);
    const cosPhi = Math.cos(this._phi);
    camera.position.set(
      target.x + this._radius * sinPhi * Math.sin(this._theta),
      target.y + this._radius * cosPhi,
      target.z + this._radius * sinPhi * Math.cos(this._theta),
    );
    camera.lookAt(target.x, target.y + this._lookAtOffset, target.z);
  }
}
