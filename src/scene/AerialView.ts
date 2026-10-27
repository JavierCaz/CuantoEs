import * as THREE from 'three';
import type { Rect } from '../money/layout';

const DURATION = 2; // seconds

type Mode = 'walk' | 'toAerial' | 'aerial' | 'toWalk';

// Flies the camera between the player's eyes and an overview of the whole warehouse.
// Orientation is interpolated with quaternions: blending two Euler angle sets can
// take strange detours, while slerp always takes the shortest rotation.
export class AerialView {
  mode: Mode = 'walk';
  private t = 0;
  private readonly fromPos = new THREE.Vector3();
  private readonly fromQuat = new THREE.Quaternion();
  private readonly aerialPos = new THREE.Vector3();
  private readonly aerialQuat = new THREE.Quaternion();
  // Must be a camera: lookAt() points a camera's -Z at the target, but a plain Object3D's +Z.
  private readonly helper = new THREE.PerspectiveCamera();

  constructor(private camera: THREE.PerspectiveCamera) {}

  get isWalking() {
    return this.mode === 'walk';
  }

  // Recompute the overview pose for a new area. If already up there, glide to the new pose.
  setArea(area: Rect, height: number) {
    const cx = (area.minX + area.maxX) / 2;
    const cz = (area.minZ + area.maxZ) / 2;
    const span = Math.max(area.maxX - area.minX, area.maxZ - area.minZ);
    const altitude = Math.max(30, span * 0.9 + height);

    this.helper.position.set(cx, altitude, area.maxZ + altitude * 0.35);
    this.helper.lookAt(cx, 0, cz);
    this.aerialPos.copy(this.helper.position);
    this.aerialQuat.copy(this.helper.quaternion);

    if (this.mode === 'aerial' || this.mode === 'toAerial') this.start('toAerial');
  }

  toggle() {
    this.start(this.mode === 'walk' || this.mode === 'toWalk' ? 'toAerial' : 'toWalk');
  }

  // `eye` is where the player's camera would be; used as the destination when flying back.
  update(dt: number, eyePos: THREE.Vector3, eyeQuat: THREE.Quaternion) {
    if (this.mode === 'walk') return;
    if (this.mode === 'aerial') {
      this.camera.position.copy(this.aerialPos);
      this.camera.quaternion.copy(this.aerialQuat);
      return;
    }

    this.t = Math.min(this.t + dt / DURATION, 1);
    const k = easeInOutCubic(this.t);
    const [toPos, toQuat] = this.mode === 'toAerial' ? [this.aerialPos, this.aerialQuat] : [eyePos, eyeQuat];
    this.camera.position.lerpVectors(this.fromPos, toPos, k);
    this.camera.quaternion.slerpQuaternions(this.fromQuat, toQuat, k);

    if (this.t === 1) this.mode = this.mode === 'toAerial' ? 'aerial' : 'walk';
  }

  private start(mode: 'toAerial' | 'toWalk') {
    this.mode = mode;
    this.t = 0;
    this.fromPos.copy(this.camera.position);
    this.fromQuat.copy(this.camera.quaternion);
  }
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}
