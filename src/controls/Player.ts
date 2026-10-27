import * as THREE from 'three';
import type { Collider } from './collision';

export const EYE_HEIGHT = 1.7;
const WALK_SPEED = 3; // m/s
const RUN_SPEED = 9;
const MAX_PITCH = Math.PI / 2 - 0.01;
const RADIUS = 0.3; // how close you can get to things, in meters

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Input-agnostic first-person state. Desktop and touch controls only write to
// `move`, `running` and `look()`; the player turns that into camera motion.
export class Player {
  readonly position = new THREE.Vector3(0, EYE_HEIGHT, 8);
  yaw = 0; // rotation around Y (left/right), radians
  pitch = 0; // rotation around X (up/down), radians
  readonly move = new THREE.Vector2(); // x = strafe right, y = forward; each in [-1, 1]
  running = false;

  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly quat = new THREE.Quaternion();

  collider: Collider | null = null;

  constructor(private bounds: Bounds) {}

  setBounds(bounds: Bounds) {
    this.bounds = bounds;
  }

  spawn(x: number, z: number, yaw = 0) {
    this.position.set(x, EYE_HEIGHT, z);
    this.yaw = yaw;
    this.pitch = 0;
  }

  look(deltaYaw: number, deltaPitch: number) {
    this.yaw -= deltaYaw;
    this.pitch = THREE.MathUtils.clamp(this.pitch - deltaPitch, -MAX_PITCH, MAX_PITCH);
  }

  update(dt: number) {
    // The camera looks down -Z when yaw = 0; rotate that by yaw to get "forward" on the ground.
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const input = this.move.clone();
    if (input.lengthSq() > 1) input.normalize(); // diagonals aren't faster
    const speed = (this.running ? RUN_SPEED : WALK_SPEED) * dt;

    const dx = (this.forward.x * input.y + this.right.x * input.x) * speed;
    const dz = (this.forward.z * input.y + this.right.z * input.x) * speed;
    // Move one axis at a time: if only X is blocked you still slide along Z (and vice versa).
    this.tryMove(this.position.x + dx, this.position.z);
    this.tryMove(this.position.x, this.position.z + dz);
  }

  get quaternion(): THREE.Quaternion {
    this.euler.set(this.pitch, this.yaw, 0);
    return this.quat.setFromEuler(this.euler);
  }

  applyTo(camera: THREE.Camera) {
    camera.position.copy(this.position);
    camera.rotation.set(this.pitch, this.yaw, 0);
  }

  private tryMove(x: number, z: number) {
    x = THREE.MathUtils.clamp(x, this.bounds.minX, this.bounds.maxX);
    z = THREE.MathUtils.clamp(z, this.bounds.minZ, this.bounds.maxZ);
    if (this.collider?.hits(x, z, RADIUS)) return;
    this.position.x = x;
    this.position.z = z;
  }
}
