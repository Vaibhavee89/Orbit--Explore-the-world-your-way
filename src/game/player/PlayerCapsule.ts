import * as THREE from 'three';
import type { SceneManager } from '../rendering/SceneManager';
import type { InputState } from '../input/InputState';

const SPEED = 8; // m/s

/**
 * Visual placeholder for the player character.
 *
 * Moves with WASD/arrow keys in camera-forward space; no physics yet —
 * the character controller ticket wires this to a Rapier kinematic body.
 *
 * Movement directions relative to camera yaw (theta):
 *   forward = (-sin θ, 0, -cos θ)   right = (cos θ, 0, -sin θ)
 */
export class PlayerCapsule {
  readonly mesh: THREE.Mesh;

  constructor(scene: SceneManager, x = 0, y = 2, z = 0) {
    const geo = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x7c3aed,
      roughness: 0.5,
      metalness: 0.15,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.position.set(x, y, z);
    scene.add(this.mesh);
  }

  get position(): THREE.Vector3 { return this.mesh.position; }

  setPosition(x: number, y: number, z: number): void {
    this.mesh.position.set(x, y, z);
  }

  update(input: InputState, cameraYaw: number, dt: number): void {
    const forward = new THREE.Vector3(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));
    const right   = new THREE.Vector3( Math.cos(cameraYaw), 0, -Math.sin(cameraYaw));
    const move    = new THREE.Vector3();

    if (input.isDown('KeyW') || input.isDown('ArrowUp'))    move.add(forward);
    if (input.isDown('KeyS') || input.isDown('ArrowDown'))  move.sub(forward);
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) move.add(right);
    if (input.isDown('KeyA') || input.isDown('ArrowLeft'))  move.sub(right);

    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(SPEED * dt);
      this.mesh.position.add(move);
      // Face the direction of travel.
      this.mesh.rotation.y = Math.atan2(move.x, move.z);
    }
  }

  dispose(scene: SceneManager): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
