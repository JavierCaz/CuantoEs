import * as THREE from 'three';
import type { Rect } from '../money/layout';
import { ARENA } from './palette';

type UpdateFn = (dt: number) => void;

// Direction the sunlight comes from (normalized later).
const SUN_DIRECTION = new THREE.Vector3(0.45, 1, 0.3);

// Owns the three things every Three.js app needs: a scene, a camera and a renderer.
export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  private readonly sun = new THREE.DirectionalLight(0xffffff, 1.4);
  private updaters: UpdateFn[] = [];
  private lastTime = 0;

  constructor(container: HTMLElement, options: { lowPower: boolean }) {
    this.scene.background = new THREE.Color(ARENA);
    this.scene.fog = new THREE.Fog(ARENA, 30, 120);

    // fov 70°, near 0.05 m, far 3 km. 1 unit = 1 meter.
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 3000);
    this.camera.rotation.order = 'YXZ';

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, options.lowPower ? 1.5 : 2));
    // Shadows: the light renders the scene once more from its own point of view into a
    // depth texture (the shadow map); then each pixel checks whether the light could "see" it.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.prepend(this.renderer.domElement);

    this.addLights(options.lowPower ? 1024 : 2048);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  get maxAnisotropy() {
    return this.renderer.capabilities.getMaxAnisotropy();
  }

  onUpdate(fn: UpdateFn) {
    this.updaters.push(fn);
  }

  start() {
    this.renderer.setAnimationLoop((time) => {
      // Clamp so a background tab coming back doesn't teleport the player.
      const dt = Math.min((time - this.lastTime) / 1000, 0.1);
      this.lastTime = time;
      for (const fn of this.updaters) fn(dt);
      this.renderer.render(this.scene, this.camera);
    });
  }

  // The shadow camera is orthographic (a box, not a pyramid): size it to just cover the area.
  // Bigger box = same number of shadow-map pixels spread thinner = blurrier shadows.
  fitShadowTo(area: Rect, height: number) {
    const cx = (area.minX + area.maxX) / 2;
    const cz = (area.minZ + area.maxZ) / 2;
    const radius = Math.hypot(area.maxX - area.minX, area.maxZ - area.minZ) / 2 + height;
    const distance = radius + height + 10;

    this.sun.target.position.set(cx, 0, cz);
    this.sun.position.copy(SUN_DIRECTION).normalize().multiplyScalar(distance).add(this.sun.target.position);

    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -radius;
    cam.right = cam.top = radius;
    cam.near = 1;
    cam.far = distance * 2;
    cam.updateProjectionMatrix();
  }

  private addLights(shadowMapSize: number) {
    const sky = new THREE.HemisphereLight(0xffffff, 0x8a8172, 1.6);
    this.scene.add(sky);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03; // avoids "shadow acne" stripes on lit surfaces
    this.scene.add(this.sun, this.sun.target);
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
