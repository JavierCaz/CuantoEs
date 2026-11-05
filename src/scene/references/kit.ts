import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// The toolkit the scale references are built with. A model is many simple parts (boxes with rounded
// edges, extruded outlines, lathes), each painted its own color. The parts are merged by finish into
// one mesh each, with the colors stored per vertex: a car with tires, rims, lights and windows costs
// four draw calls instead of forty, and it's built once however many halls show it.

// How a surface takes the light. Every model shares these few materials.
export type Finish = 'matte' | 'satin' | 'gloss' | 'metal' | 'glass' | 'lamp';

// The environment map lights colored surfaces too, on top of the hall's own lights: kept low on
// them, so models keep their shading; full on metal and glass, which have almost no color of their own.
const FINISHES: Record<Exclude<Finish, 'lamp'>, THREE.MeshStandardMaterialParameters> = {
  matte: { roughness: 0.88, envMapIntensity: 0.22 }, // fabric, rubber, raw wood
  satin: { roughness: 0.55, envMapIntensity: 0.3 }, // skin, leather, plastic, painted walls
  gloss: { roughness: 0.18, envMapIntensity: 0.45 }, // car paint, lacquer, hard-shell luggage
  metal: { roughness: 0.3, metalness: 1, envMapIntensity: 1 }, // chrome, aluminum, brass
  glass: { roughness: 0.06, envMapIntensity: 1 }, // windows: dark, mirroring the room
};

// ---------- Reflections ----------

// Shiny things need something to mirror, or chrome renders black and glass looks like plastic.
// World renders that once (see World.environment); materials registered here pick it up.
let environment: THREE.Texture | null = null;
const registered = new Set<THREE.MeshStandardMaterial>();

export function setEnvironment(texture: THREE.Texture) {
  environment = texture;
  for (const m of registered) {
    m.envMap = texture;
    m.needsUpdate = true; // an environment map changes the shader, so it has to be rebuilt
  }
}

export function reflective<T extends THREE.MeshStandardMaterial>(m: T): T {
  registered.add(m);
  m.envMap = environment;
  m.userData.shared = true; // lives as long as the app (see dispose.ts)
  return m;
}

const finishes = new Map<Finish, THREE.Material>();
function finish(name: Finish): THREE.Material {
  let m = finishes.get(name);
  if (!m) {
    if (name === 'lamp') {
      // Headlights, signs, bulbs: unlit, so they read as lights in the brightest hall.
      m = new THREE.MeshBasicMaterial({ vertexColors: true });
      m.userData.shared = true;
    } else {
      m = reflective(new THREE.MeshStandardMaterial({ vertexColors: true, ...FINISHES[name] }));
    }
    finishes.set(name, m);
  }
  return m;
}

// ---------- Models ----------

export class Model {
  private parts = new Map<Finish, { geometry: THREE.BufferGeometry; color: THREE.Color }[]>();

  // Adds a part, already in place, painted `color`. The geometry belongs to the model from here on.
  add(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, finishName: Finish = 'matte'): this {
    const list = this.parts.get(finishName) ?? [];
    list.push({ geometry, color: new THREE.Color(color) }); // converted from sRGB to the linear values the shader works in
    this.parts.set(finishName, list);
    return this;
  }

  // One mesh per finish: every part's positions and normals copied end to end, each vertex given its
  // part's color, and the triangles' indices shifted to match. (Parts without an index list their
  // vertices in order.)
  build(): THREE.Group {
    const group = new THREE.Group();
    for (const [name, parts] of this.parts) {
      let vertices = 0;
      let indices = 0;
      for (const { geometry: g } of parts) {
        vertices += g.attributes.position.count;
        indices += g.index ? g.index.count : g.attributes.position.count;
      }
      const position = new Float32Array(vertices * 3);
      const normal = new Float32Array(vertices * 3);
      const color = new Float32Array(vertices * 3);
      const index = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
      let v = 0;
      let k = 0;
      for (const { geometry: g, color: c } of parts) {
        const n = g.attributes.position.count;
        position.set(g.attributes.position.array, v * 3);
        normal.set(g.attributes.normal.array, v * 3);
        for (let i = v * 3; i < (v + n) * 3; i += 3) {
          color[i] = c.r;
          color[i + 1] = c.g;
          color[i + 2] = c.b;
        }
        if (g.index) for (const i of g.index.array) index[k++] = i + v;
        else for (let i = 0; i < n; i++) index[k++] = i + v;
        v += n;
        g.dispose();
      }
      const merged = new THREE.BufferGeometry();
      merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
      merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
      merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
      merged.setIndex(new THREE.BufferAttribute(index, 1));
      group.add(new THREE.Mesh(merged, finish(name)));
    }
    this.parts.clear();
    return group;
  }
}

// Builds a model the first time it's asked for, then hands out copies that share its geometry,
// materials and textures: every hall with a car shows the same one, uploaded to the GPU once.
// (The first call's arguments build it; they're the same for the whole app.)
export function cached<A extends unknown[]>(build: (...args: A) => THREE.Object3D): (...args: A) => THREE.Object3D {
  let template: THREE.Object3D | null = null;
  return (...args) => {
    if (!template) {
      template = build(...args);
      // Shared by every copy, so disposing one hall mustn't free them (see dispose.ts).
      template.traverse((o) => {
        o.userData.sharedGeometry = true;
        if (o instanceof THREE.Mesh) for (const m of [o.material].flat()) m.userData.shared = true;
      });
    }
    return template.clone();
  };
}

// ---------- Parts ----------
// Boxes are placed by the center of their bottom face, like things standing on the floor.
// Everything else is placed by its center.

export const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);

// A box with its edges rounded to radius `r`: edges that catch the light are what make an object
// read as manufactured rather than cut out of cardboard. One segment rounds each edge with a single
// bevel that its normals smooth over; big surfaces seen up close get two.
// Rounded boxes are the most common part, so they come from a template computed once per number of
// segments (the same shape as three.js's RoundedBoxGeometry): a unit cube's vertices, each with the
// corner it belongs to (`sign`) and its normal. A box of any size just places each vertex at its
// corner, pushed out along its normal by r.
const roundedTemplates = new Map<number, { sign: Float32Array; normal: Float32Array; index: Uint16Array }>();

function roundedTemplate(segments: number) {
  let template = roundedTemplates.get(segments);
  if (!template) {
    const n = segments * 2 + 1;
    const cube = new THREE.BoxGeometry(1, 1, 1, n, n, n);
    const p = cube.attributes.position.array;
    const sign = new Float32Array(p.length);
    const normal = new Float32Array(p.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < p.length; i += 3) {
      for (let k = 0; k < 3; k++) sign[i + k] = Math.sign(p[i + k]);
      // Shift each vertex half a segment toward the center: the middle row lands on the flat face.
      v.set(p[i] - sign[i] * (0.5 / n), p[i + 1] - sign[i + 1] * (0.5 / n), p[i + 2] - sign[i + 2] * (0.5 / n)).normalize();
      normal.set([v.x, v.y, v.z], i);
    }
    template = { sign, normal, index: Uint16Array.from(cube.index!.array) };
    cube.dispose();
    roundedTemplates.set(segments, template);
  }
  return template;
}

export function rbox(w: number, h: number, d: number, r: number, x = 0, y = 0, z = 0, segments = 1) {
  const { sign, normal, index } = roundedTemplate(segments);
  r = Math.min(r, w / 2, h / 2, d / 2);
  const corner = [w / 2 - r, h / 2 - r, d / 2 - r];
  const center = [x, y + h / 2, z];
  const position = new Float32Array(sign.length);
  for (let i = 0; i < sign.length; i++) position[i] = center[i % 3] + sign[i] * corner[i % 3] + normal[i] * r;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal.slice(), 3));
  g.setIndex(new THREE.BufferAttribute(index.slice(), 1));
  return g;
}

// A cylinder lying along `axis`, centered at (x, y, z).
export function cylinder(radius: number, length: number, axis: 'x' | 'y' | 'z', x = 0, y = 0, z = 0, segments = 16, radiusEnd = radius) {
  const g = new THREE.CylinderGeometry(radiusEnd, radius, length, segments); // built along Y, radiusEnd on top
  if (axis === 'x') g.rotateZ(-Math.PI / 2); // +Y → +X
  if (axis === 'z') g.rotateX(Math.PI / 2); // +Y → +Z
  return g.translate(x, y, z);
}

// A cylinder stretched between two points: rotate +Y onto the direction from `a` to `b`.
export function bar(a: THREE.Vector3Like, b: THREE.Vector3Like, radius: number, segments = 8) {
  const from = new THREE.Vector3().copy(a);
  const direction = new THREE.Vector3().copy(b).sub(from);
  const g = new THREE.CylinderGeometry(radius, radius, direction.length(), segments);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()));
  return g.translate(from.x + direction.x / 2, from.y + direction.y / 2, from.z + direction.z / 2);
}

// A solid of revolution around Y: `points` are [radius, y] pairs, listed from the bottom up.
export const lathe = (points: [number, number][], segments = 24, phiStart = 0, phiLength = Math.PI * 2) =>
  new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), segments, phiStart, phiLength);

export const outline = (points: [number, number][]) => new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));

// An outline drawn in XY, extruded along Z to a total thickness `depth` centered on z = 0, with its
// edges rounded by `bevel`. The rounded walls stay on the outline; the flat faces on either side are
// the outline shrunk by `bevel`.
export function extrude(shape: THREE.Shape | [number, number][], depth: number, bevel = 0, curveSegments = 10) {
  const core = Math.max(depth - bevel * 2, 0.001);
  const g = new THREE.ExtrudeGeometry(Array.isArray(shape) ? outline(shape) : shape, {
    depth: core,
    curveSegments,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 3,
  });
  g.translate(0, 0, -core / 2);
  // Smooth across the bevels and curves, but keep a crisp edge wherever the outline turns a corner.
  return toCreasedNormals(g, Math.PI / 5);
}

// A flat panel lying along the segment from (x1, y1) to (x2, y2) of an outline in XY, `width` across
// Z, raised `lift` off the outline on its outer side (the right of the direction of travel, for an
// outline drawn counterclockwise): windshields, rear windows, grilles.
export function panel(x1: number, y1: number, x2: number, y2: number, width: number, thickness: number, lift = 0, inset = 0) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const [nx, ny] = [dy / length, -dx / length];
  const offset = lift + thickness / 2;
  return new THREE.BoxGeometry(length - inset * 2, thickness, width)
    .rotateZ(Math.atan2(dy, dx))
    .translate((x1 + x2) / 2 + nx * offset, (y1 + y2) / 2 + ny * offset, 0);
}

// ---------- Wheels ----------

export interface WheelStyle {
  tire?: number;
  rim?: number; // the metal: spokes, lip and hub
  face?: number; // the rim's face behind the spokes
  spokes?: number; // 0 for a plain steel disc
  rimRatio?: number; // rim radius over wheel radius
}

// A tire with its axle along Z, centered at (x, y, z): a rounded rectangle turned around the axle.
// On its own, it's the inner tire of a pair of duals, whose rim nobody sees.
export function tire(m: Model, x: number, y: number, z: number, radius: number, width: number, style: WheelStyle = {}) {
  const { tire = 0x1b1b1d, rimRatio = 0.62 } = style;
  const ri = radius * rimRatio;
  const w = width / 2;
  const c = (radius - ri) * 0.4; // how round the shoulders are
  const profile: [number, number][] = [
    [ri, -w], [radius - c, -w], [radius - c * 0.3, -w + c * 0.3], [radius, -w + c],
    [radius, w - c], [radius - c * 0.3, w - c * 0.3], [radius - c, w], [ri, w],
  ];
  m.add(lathe(profile, 20).rotateX(Math.PI / 2).translate(x, y, z), tire, 'matte'); // turned around Y, laid along Z
}

// A wheel with its axle along Z, centered at (x, y, z). `out` is the side its face looks to.
export function wheel(m: Model, x: number, y: number, z: number, radius: number, width: number, out: 1 | -1, style: WheelStyle = {}) {
  const { rim = 0xc6c9ce, face = 0x34373c, spokes = 5, rimRatio = 0.62 } = style;
  const ri = radius * rimRatio;
  const w = width / 2;
  tire(m, x, y, z, radius, width, style);

  // The rim sits back in the tire: a dark face, then spokes, a polished lip and a hub on top.
  const faceZ = z + out * (w - width * 0.12);
  m.add(cylinder(ri, width * 0.1, 'z', x, y, faceZ - out * width * 0.05, 20), face, 'satin');
  m.add(new THREE.TorusGeometry(ri, radius * 0.035, 4, 20).translate(x, y, faceZ), rim, 'metal');
  m.add(cylinder(radius * 0.16, width * 0.12, 'z', x, y, faceZ + out * width * 0.03, 10), rim, 'metal');
  if (spokes === 0) {
    m.add(cylinder(ri * 0.82, width * 0.06, 'z', x, y, faceZ, 20), rim, 'metal');
    return;
  }
  for (let i = 0; i < spokes; i++) {
    const spoke = new THREE.BoxGeometry(ri * 0.85, radius * 0.11, width * 0.06).translate(ri * 0.5, 0, 0);
    m.add(spoke.rotateZ((i / spokes) * Math.PI * 2 + 0.3).translate(x, y, faceZ), rim, 'metal');
  }
}

// ---------- Contact shadows ----------

// Under anything standing on the floor, the sky is blocked and the floor darkens. The sun's shadow map
// is spread over the whole hall, too coarse to draw that, so each model brings a soft dark patch:
// rings of rounded rectangles fading out, alpha stored per vertex, all sharing one material.
let shadowMaterial: THREE.MeshBasicMaterial | null = null;

export function contactShadow(w: number, d: number, spread: number, opacity = 0.5, x = 0, z = 0): THREE.Mesh {
  const rings: [grow: number, alpha: number][] = [[-spread * 0.5, opacity], [0, opacity * 0.55], [spread * 0.6, opacity * 0.18], [spread, 0]];
  const perCorner = 5;
  const positions: number[] = [0, 0, 0];
  const colors: number[] = [0, 0, 0, opacity];
  for (const [grow, alpha] of rings) {
    const hw = Math.max(w / 2 + grow, 0.01);
    const hd = Math.max(d / 2 + grow, 0.01);
    const r = Math.min(hw, hd, Math.max(0.01, spread * 0.5 + grow));
    for (const [cx, cz, start] of [[1, 1, 0], [-1, 1, 1], [-1, -1, 2], [1, -1, 3]]) {
      for (let i = 0; i < perCorner; i++) {
        const a = ((start + i / (perCorner - 1)) * Math.PI) / 2;
        positions.push(cx * (hw - r) + Math.cos(a) * r, 0, cz * (hd - r) + Math.sin(a) * r);
        colors.push(0, 0, 0, alpha);
      }
    }
  }
  const n = perCorner * 4;
  const index: number[] = [];
  for (let i = 0; i < n; i++) index.push(0, 1 + ((i + 1) % n), 1 + i); // the center, fanned out to the first ring
  for (let ring = 0; ring < rings.length - 1; ring++) {
    const a = 1 + ring * n;
    const b = a + n;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      index.push(a + i, a + j, b + i, a + j, b + j, b + i);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(index);

  shadowMaterial ??= new THREE.MeshBasicMaterial({
    color: 0x000000,
    vertexColors: true, // four components: the alpha fades the rings out
    transparent: true,
    depthWrite: false,
    // Lies on the floor: nudge its depth toward the camera so the floor never shows through.
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  shadowMaterial.userData.shared = true;
  const mesh = new THREE.Mesh(geometry, shadowMaterial);
  mesh.position.set(x, 0.012, z);
  mesh.renderOrder = -1; // before other see-through things, like the goal net
  return mesh;
}
