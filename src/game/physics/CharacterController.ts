import RAPIER from '@dimforge/rapier3d';
import type {
  World,
  KinematicCharacterController,
  RigidBody,
  Collider,
} from '@dimforge/rapier3d';

const WALK_SPEED  = 5;    // m/s
const RUN_SPEED   = 10;   // m/s
const JUMP_SPEED  = 7;    // m/s initial upward velocity
const GRAVITY     = -20;  // m/s² (2× real; snappier aerial feel)
const TERM_VEL    = -50;  // m/s terminal velocity cap
const KCC_OFFSET  = 0.01; // skin gap to prevent tunneling (metres)

/**
 * Kinematic character controller for the player capsule.
 *
 * Wraps Rapier's KinematicCharacterController + a KPB rigid body.
 * Handles gravity, jump, walk/run, and slope-aware collision response.
 *
 * Coordinate system: Y-up (Three.js / Rapier convention).
 *
 * Movement intent encoding (camera-local):
 *   moveDir.z = +1 → forward (W),  moveDir.z = -1 → backward (S)
 *   moveDir.x = +1 → right (D),    moveDir.x = -1 → left (A)
 */
export class CharacterController {
  private _kcc:      KinematicCharacterController;
  private _body:     RigidBody;
  private _collider: Collider;
  private _vertVel   = 0; // accumulated vertical velocity (m/s)

  constructor(world: World, x: number, y: number, z: number) {
    // Character controller with small skin offset.
    this._kcc = world.createCharacterController(KCC_OFFSET);
    this._kcc.setUp({ x: 0, y: 1, z: 0 });
    this._kcc.setMaxSlopeClimbAngle(45 * Math.PI / 180);
    this._kcc.setMinSlopeSlideAngle(30 * Math.PI / 180);
    // Step over obstacles up to 0.5 m tall.
    this._kcc.enableAutostep(0.5, 0.2, true);
    // Snap to ground when walking over edges (prevents floating).
    this._kcc.enableSnapToGround(0.5);

    // Kinematic position-based body — moved explicitly each frame.
    const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(x, y, z);
    this._body = world.createRigidBody(bodyDesc);

    // Capsule: half-height 0.6 m, radius 0.4 m — matches PlayerCapsule mesh
    // (CapsuleGeometry(0.4, 1.2) → radius 0.4, segment 1.2, total height 2.0).
    this._collider = world.createCollider(
      RAPIER.ColliderDesc.capsule(0.6, 0.4),
      this._body,
    );
  }

  get position(): { x: number; y: number; z: number } {
    return this._body.translation();
  }

  /** True if the character is resting on a surface (from the last update). */
  get isGrounded(): boolean {
    return this._kcc.computedGrounded();
  }

  /**
   * Advance the character by one physics tick.
   *
   * Order: call this BEFORE world.step() so setNextKinematicTranslation takes
   * effect in the same simulation step.
   *
   * @param moveDir  Camera-local movement intent (x = right, z = forward).
   * @param cameraYaw  Yaw angle from CameraManager (radians).
   * @param jump  True on the frame the jump key was newly pressed.
   * @param sprint  True while Shift is held.
   * @param dt  Fixed physics timestep (seconds).
   */
  update(
    moveDir:   { x: number; z: number },
    cameraYaw: number,
    jump:      boolean,
    sprint:    boolean,
    dt:        number,
  ): void {
    const grounded = this._kcc.computedGrounded();

    if (grounded) {
      // Small downward bias keeps snap-to-ground active on gentle slopes.
      this._vertVel = jump ? JUMP_SPEED : -2;
    } else {
      this._vertVel = Math.max(this._vertVel + GRAVITY * dt, TERM_VEL);
    }

    // Rotate camera-local intent into world XZ space.
    const speed = sprint ? RUN_SPEED : WALK_SPEED;
    const fx = -Math.sin(cameraYaw);  // forward direction x
    const fz = -Math.cos(cameraYaw);  // forward direction z
    const rx =  Math.cos(cameraYaw);  // right direction x
    const rz = -Math.sin(cameraYaw);  // right direction z

    const desired = {
      x: (moveDir.z * fx + moveDir.x * rx) * speed * dt,
      y: this._vertVel * dt,
      z: (moveDir.z * fz + moveDir.x * rz) * speed * dt,
    };

    this._kcc.computeColliderMovement(this._collider, desired);
    const corrected = this._kcc.computedMovement();

    const pos = this._body.translation();
    this._body.setNextKinematicTranslation({
      x: pos.x + corrected.x,
      y: pos.y + corrected.y,
      z: pos.z + corrected.z,
    });
  }

  /** Teleport the character to an absolute position and reset vertical velocity. */
  setPosition(x: number, y: number, z: number): void {
    this._body.setNextKinematicTranslation({ x, y, z });
    this._vertVel = 0;
  }

  free(world: World): void {
    world.removeCollider(this._collider, false);
    world.removeRigidBody(this._body);
    world.removeCharacterController(this._kcc);
  }
}
