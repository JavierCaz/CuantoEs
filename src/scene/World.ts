import * as THREE from 'three';
import type { Rect } from '../money/layout';
import { ARENA } from './palette';

type UpdateFn = (dt: number) => void;

// Direction the sunlight comes from (normalized later): high but raking, so the skylights throw
// bars of light across the floor and the walls cast long, sharp shadows.
const SUN_DIRECTION = new THREE.Vector3(0.55, 1, 0.35);

// Owns the three things every Three.js app needs: a scene, a camera and a renderer.
export class World {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly environment: THREE.Texture; // what glossy surfaces reflect; see makeEnvironment()
  private readonly sun = new THREE.DirectionalLight(0xfff0d8, 2.1); // warm midday sun
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
    this.environment = this.makeEnvironment();
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
    // Fill light from the sky and the warm ground. Kept low so shade reads as shade.
    const sky = new THREE.HemisphereLight(0xf4ead8, 0x6e5f4e, 1.15);
    this.scene.add(sky);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.03; // avoids "shadow acne" stripes on lit surfaces
    this.scene.add(this.sun, this.sun.target);
  }

  // A reflection of the museum, just precise enough for paint, glass and chrome: a warm sky over a
  // sandy floor, crossed by the bright slots of the skylights. It's rendered once into a cube map and
  // prefiltered for every roughness (PMREM), so a rough surface gets a blurrier reflection.
  // Only the scale references use it (see references/kit.ts); the architecture keeps its look.
  private makeEnvironment(): THREE.Texture {
    const room = new THREE.Scene();
    const sky = new THREE.SphereGeometry(50, 32, 16);
    const zenith = new THREE.Color(0xfff4e2).multiplyScalar(1.1);
    const horizon = new THREE.Color(ARENA).multiplyScalar(0.85);
    const ground = new THREE.Color(0x6e5f4e).multiplyScalar(0.55);
    const position = sky.attributes.position;
    const colors = new Float32Array(position.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const t = position.getY(i) / 50; // -1 straight down … 1 straight up
      if (t >= 0) c.lerpColors(horizon, zenith, Math.pow(t, 0.7));
      else c.lerpColors(horizon, ground, Math.min(1, -t * 5)); // the walls fall off quickly into the floor
      colors.set([c.r, c.g, c.b], i * 3);
    }
    sky.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    room.add(new THREE.Mesh(sky, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));

    // Skylight slots overhead, many times brighter than the sky: they give glossy things their highlights.
    const slot = new THREE.PlaneGeometry(1.6, 80).rotateX(Math.PI / 2); // facing down
    const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.97, 0.9).multiplyScalar(9) });
    for (const x of [-14, 0, 14]) room.add(new THREE.Mesh(slot, glow).translateX(x).translateY(30));

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const texture = pmrem.fromScene(room, 0.02).texture;
    pmrem.dispose();
    room.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    return texture;
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }
}
