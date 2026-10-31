import * as THREE from 'three';
import type { SceneManager } from '../rendering/SceneManager';
import type { InputManager } from './InputManager';

const SPEED = 8; // m/s (direct-movement fallback, pre-world)

/**
 * Visual representation of the player character.
 *
 * Pre-world (no CharacterController): moves directly via WASD.
 * Post-world: position is driven by CharacterController; Game.ts calls
 * syncFromPhysics() each tick instead of update().
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

  /**
   * Direct WASD movement (used before CharacterController is active).
   * Moves the mesh in camera-relative XZ space and turns it to face travel.
   */
  update(input: InputManager, cameraYaw: number, dt: number): void {
    const dir = input.moveDir;
    if (dir.x === 0 && dir.z === 0) return;

    const fx = -Math.sin(cameraYaw);
    const fz = -Math.cos(cameraYaw);
    const rx =  Math.cos(cameraYaw);
    const rz = -Math.sin(cameraYaw);

    const wx = (dir.z * fx + dir.x * rx) * SPEED * dt;
    const wz = (dir.z * fz + dir.x * rz) * SPEED * dt;

    this.mesh.position.x += wx;
    this.mesh.position.z += wz;
    this.mesh.rotation.y = Math.atan2(wx, wz);
  }

  /**
   * Sync mesh position (and facing) from the CharacterController.
   * Called each tick once the physics controller is active.
   */
  syncFromPhysics(
    pos: { x: number; y: number; z: number },
    worldDx: number,
    worldDz: number,
  ): void {
    this.mesh.position.set(pos.x, pos.y, pos.z);
    if (Math.abs(worldDx) > 0.001 || Math.abs(worldDz) > 0.001) {
      this.mesh.rotation.y = Math.atan2(worldDx, worldDz);
    }
  }

  dispose(scene: SceneManager): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
