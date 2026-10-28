import * as THREE from 'three';
import type { Rect } from '../money/layout';
import type { Point } from '../museum/referenceLayout';
import { disposeObject } from './dispose';
import { ARENA, ARENA_MUTED, CARBON, DORADO, VERDE } from './palette';

// Museum wayfinding and labels, kept sober: dark green plates with sand text, an inscription cut
// into the concrete over the entrance, and gold chevrons on the floor along the route.

export const PLATE = VERDE;
export const TEXT = ARENA;
export const MUTED = ARENA_MUTED;
export const ACCENT = DORADO;
const MAX_PX_PER_METER = 300;
const MAX_CANVAS = 4096; // the largest texture every phone can take
const ARROW_SPACING = 3; // meters between floor arrows
const SIGN_BOTTOM = 1.3; // signs on poles start below eye level, so you read them straight on
const GATE_CLEARANCE = 2.6; // the title gate's plate starts above head height, so it hides nothing behind it

export interface Line {
  text: string;
  size: number; // text height in meters
  color?: string;
  bold?: boolean;
  wrap?: boolean; // break into several lines instead of shrinking to fit
}

export interface PlateOptions {
  background?: string | null; // null: letters only, as if cut into the wall
  pad?: number;
  align?: 'center' | 'left';
}

export class Signs {
  readonly group = new THREE.Group();
  readonly rects: Rect[] = []; // poles and stands are solid

  dispose() {
    disposeObject(this.group);
  }

  // A sign on a pole at `at`, its face turned toward `facing`.
  post(at: Point, facing: Point, width: number, lines: Line[], options?: PlateOptions) {
    const { object, height } = plate(lines, width, options);
    object.position.y = SIGN_BOTTOM + height / 2;
    const top = SIGN_BOTTOM + height * 0.5;
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, top, 0.08), new THREE.MeshStandardMaterial({ color: CARBON }));
    pole.position.set(0, top / 2, -0.06);

    const post = new THREE.Group();
    post.add(object, pole);
    post.rotation.y = Math.atan2(facing.x, facing.z); // a plate faces +Z; turn that toward `facing`
    post.position.set(at.x, 0, at.z);
    post.traverse((o) => (o.castShadow = true));
    this.group.add(post);

    // Block the whole width of the plate, so you can't walk through its edges.
    const halfX = Math.abs(facing.z) * (width / 2) + Math.abs(facing.x) * 0.15 + 0.05;
    const halfZ = Math.abs(facing.x) * (width / 2) + Math.abs(facing.z) * 0.15 + 0.05;
    this.rects.push({ minX: at.x - halfX, maxX: at.x + halfX, minZ: at.z - halfZ, maxZ: at.z + halfZ });
  }

  // A plate held up by a pole at each end, facing +Z: an entrance gate you walk under.
  gate(at: Point, width: number, lines: Line[]) {
    const { object, height } = plate(lines, width);
    object.position.set(at.x, GATE_CLEARANCE + height / 2, at.z);
    this.group.add(object);
    const top = GATE_CLEARANCE + height;
    const material = new THREE.MeshStandardMaterial({ color: CARBON });
    for (const side of [-1, 1]) {
      const x = at.x + side * (width / 2 + 0.05);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, top, 0.1), material);
      pole.position.set(x, top / 2, at.z);
      pole.castShadow = true;
      this.group.add(pole);
      this.rects.push({ minX: x - 0.15, maxX: x + 0.15, minZ: at.z - 0.15, maxZ: at.z + 0.15 });
    }
  }

  // A plate flat on a wall, its bottom edge at `bottom`, facing `facing` (out of the wall).
  onWall(at: Point, bottom: number, facing: Point, width: number, lines: Line[], options?: PlateOptions) {
    const { object, height } = plate(lines, width, options);
    object.rotation.y = Math.atan2(facing.x, facing.z);
    object.position.set(at.x + facing.x * 0.03, bottom + height / 2, at.z + facing.z * 0.03);
    this.group.add(object);
    return height;
  }

  // Chevrons painted along the route, all in one draw call: one geometry, one instance per arrow.
  arrows(path: Point[]) {
    if (path.length < 2) return;
    const spots: { x: number; z: number; yaw: number }[] = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const d = direction(a, path[i]);
      const length = Math.hypot(path[i].x - a.x, path[i].z - a.z);
      // Rotating by this yaw turns -Z (where the chevron points) toward d; the same convention as the camera.
      const yaw = Math.atan2(-d.x, -d.z);
      for (let s = 1.5; s < length - 1; s += ARROW_SPACING) spots.push({ x: a.x + d.x * s, z: a.z + d.z * s, yaw });
    }
    if (spots.length === 0) return;

    // A "^" pointing +Y with square-cut ends, then laid flat so it points -Z.
    const outline = [[0, 0.25], [0.4, -0.15], [0.4, -0.35], [0, 0.05], [-0.4, -0.35], [-0.4, -0.15]];
    const geometry = new THREE.ShapeGeometry(new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y))));
    geometry.rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({
      color: ACCENT,
      polygonOffset: true, // painted on the floor: always win the depth test against it
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });

    const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    spots.forEach((s, i) => {
      rotation.setFromAxisAngle(up, s.yaw);
      mesh.setMatrixAt(i, matrix.compose(position.set(s.x, 0.012, s.z), rotation, scale));
    });
    mesh.computeBoundingSphere();
    this.group.add(mesh);
  }
}

function direction(a: Point, b: Point): Point {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
}

// A plate with lines of text, facing +Z. Text is painted on a canvas at a fixed resolution per
// meter; long lines either wrap or shrink to fit instead of running off the edge.
export function plate(lines: Line[], width: number, options: PlateOptions = {}): { object: THREE.Group; height: number } {
  const { background = PLATE, pad = 0.1, align = 'center' } = options;
  const leading = 0.35; // space between lines, as a fraction of the text height
  const ppm = Math.min(MAX_PX_PER_METER, MAX_CANVAS / width);
  const px = (meters: number) => meters * ppm;
  const font = (line: Line, size: number) => `${line.bold ? 700 : 500} ${size}px system-ui, sans-serif`;

  // Break the wrapping lines into as many as they need, measuring at their real size.
  const measure = document.createElement('canvas').getContext('2d')!;
  const inner = px(width - pad * 2);
  const rows = lines.flatMap((line) => {
    if (!line.wrap) return [line];
    measure.font = font(line, px(line.size));
    const out: Line[] = [];
    let current = '';
    for (const word of line.text.split(' ')) {
      const next = current ? `${current} ${word}` : word;
      if (current && measure.measureText(next).width > inner) {
        out.push({ ...line, text: current });
        current = word;
      } else current = next;
    }
    out.push({ ...line, text: current });
    return out;
  });
  const height = pad * 2 + rows.reduce((h, l) => h + l.size * (1 + leading), 0) - rows.at(-1)!.size * leading;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(px(width));
  canvas.height = Math.min(MAX_CANVAS, Math.round(px(height)));
  const ctx = canvas.getContext('2d')!;
  ctx.scale(1, canvas.height / px(height)); // only if the plate is too tall for the canvas
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, px(height));
  }
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  let y = pad;
  for (const line of rows) {
    let size = px(line.size);
    ctx.font = font(line, size);
    const fit = inner / ctx.measureText(line.text).width;
    if (fit < 1) ctx.font = font(line, (size *= fit));
    ctx.fillStyle = line.color ?? TEXT;
    ctx.fillText(line.text, align === 'center' ? canvas.width / 2 : px(pad), px(y + line.size / 2));
    y += line.size * (1 + leading);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; // signs are often read at an angle
  const object = new THREE.Group();
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    background
      ? new THREE.MeshBasicMaterial({ map: texture })
      : // An inscription: lit like the wall it's cut into, so it darkens in shadow.
        new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  if (background) {
    const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.04), new THREE.MeshStandardMaterial({ color: background }));
    object.add(back);
    face.position.z = 0.021; // just in front of the backing box
  }
  object.add(face);
  return { object, height };
}
