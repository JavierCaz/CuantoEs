import * as THREE from 'three';
import { DOOR_HEIGHT, DOOR_WIDTH, type Door } from '../museum/rooms';
import { ARENA } from './palette';

export const MIST_COLOR = ARENA; // the same as the fog, so the doorway seems to fade into it

// Layers of drifting fog across each doorway. The next room doesn't exist until you walk
// through, so the mist has to hide it: the front layers are thin wisps, the last one is solid.
const LAYERS = [
  { depth: 0.3, opacity: 0.35 },
  { depth: 0.6, opacity: 0.6 },
  { depth: 0.95, opacity: 1 }, // just before the point where crossing the door triggers
];

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Fractal noise ("fbm"): several octaves of smooth random values added together, each one
// finer and fainter. Feeding the noise back into its own coordinates makes it swirl like smoke.
const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uSeed;
  uniform vec3 uColor;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 p = vUv * vec2(1.6, 2.0) + uSeed;
    float n = fbm(p + vec2(uTime * 0.04, -uTime * 0.07));
    n = fbm(p + n * 1.8 + vec2(-uTime * 0.03, uTime * 0.05));

    // Thinner toward the jambs and the lintel; the solid layer ignores this and covers everything.
    float edges = smoothstep(0.0, 0.25, vUv.x) * smoothstep(0.0, 0.25, 1.0 - vUv.x) * smoothstep(0.0, 0.2, 1.0 - vUv.y);
    float alpha = uOpacity >= 1.0 ? 1.0 : uOpacity * edges * (0.4 + 0.9 * n);

    // Shadow: the doorway darkens toward the floor and the jambs.
    float shade = mix(0.45, 1.0, smoothstep(0.0, 0.5, vUv.y)) * mix(0.7, 1.0, edges);
    gl_FragColor = vec4(uColor * shade * (0.85 + 0.3 * n), clamp(alpha, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;

export class DoorMist {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 }; // one uniform shared by every layer

  constructor(doors: Door[]) {
    const geometry = new THREE.PlaneGeometry(DOOR_WIDTH, DOOR_HEIGHT);
    doors.forEach((door, d) => {
      LAYERS.forEach((layer, i) => {
        const material = new THREE.ShaderMaterial({
          vertexShader,
          fragmentShader,
          uniforms: {
            uTime: this.time,
            uOpacity: { value: layer.opacity },
            uSeed: { value: d * 7.3 + i * 3.1 }, // so the layers don't swirl in lockstep
            uColor: { value: new THREE.Color(MIST_COLOR) },
          },
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide, // you see the back of the layers while walking through them
        });
        const plane = new THREE.Mesh(geometry, material);
        // A plane faces +Z; turn it to face back into the room (along -n).
        plane.rotation.y = Math.atan2(-door.nx, -door.nz);
        plane.position.set(door.x + door.nx * layer.depth, DOOR_HEIGHT / 2, door.z + door.nz * layer.depth);
        this.group.add(plane);
      });
    });
  }

  update(dt: number) {
    this.time.value += dt;
  }
}
