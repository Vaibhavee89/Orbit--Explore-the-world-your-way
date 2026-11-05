import RAPIER from '@dimforge/rapier3d';
import type { RigidBody, Collider } from '@dimforge/rapier3d';

export type { RigidBody, Collider };

// vite-plugin-wasm handles the WASM static import in @dimforge/rapier3d;
// no explicit async init() call is required.

export interface PhysicsBodyHandle {
  rigidBody: RigidBody;
  collider: Collider;
}

export class PhysicsWorld {
  readonly world: RAPIER.World;

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  }

  get timestep(): number { return this.world.timestep; }
  set timestep(dt: number) { this.world.timestep = dt; }

  /** Advance physics by one fixed step. */
  step(): void {
    this.world.step();
  }

  /** Add a dynamic cuboid rigid body at (x, y, z) with given half-extents. */
  addDynamicBox(
    x: number, y: number, z: number,
    hx: number, hy: number, hz: number,
  ): PhysicsBodyHandle {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z);
    const rigidBody = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(hx, hy, hz);
    const collider = this.world.createCollider(colliderDesc, rigidBody);
    return { rigidBody, collider };
  }

  /** Add an infinite fixed ground plane at y = 0 (half-thickness 0.1 m). */
  addGroundPlane(): Collider {
    const desc = RAPIER.ColliderDesc.cuboid(500, 0.1, 500).setTranslation(0, -0.1, 0);
    return this.world.createCollider(desc);
  }

  free(): void {
    this.world.free();
  }
}
