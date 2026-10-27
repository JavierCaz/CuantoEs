import * as THREE from 'three';
import type { Rect } from '../money/layout';
import { DOOR_HEIGHT, WALL_THICKNESS, type Door, type Point, type RoomPlan } from '../museum/rooms';
import { disposeObject } from './dispose';

// Museum wayfinding: the room's title over the walkway, a sign over each door, a pointing sign at each
// corner of the route to the next room, and arrows painted on the floor along it.

const PLATE = '#14161b';
const TEXT = '#f4f1ea';
const MUTED = '#b9b4a8';
const ACCENT = '#f2c14e';
const PX_PER_METER = 300;
const ARROW_SPACING = 3; // meters between floor arrows
const SIGN_BOTTOM = 1.3; // signs on poles start below eye level, so you read them straight on
const GATE_CLEARANCE = 2.6; // the title gate's plate starts above head height, so it hides nothing behind it

interface Line {
  text: string;
  size: number; // text height in meters
  color?: string;
  bold?: boolean;
}

export interface DoorSign {
  kicker: string; // "Siguiente · Sala 5"
  name: string;
}

export interface SignTexts {
  kicker: string; // "Sala 4 de 7"
  title: string;
  amount: string;
  hint: string; // last line of the title sign: where to go next
  entry?: DoorSign;
  exit?: DoorSign;
}

export class Signage {
  readonly group = new THREE.Group();
  readonly rects: Rect[] = []; // the poles are solid

  constructor(plan: RoomPlan, texts: SignTexts) {
    const { path, spawn } = plan;

    // The title hangs over the walkway just ahead of where you start, above everything on display.
    const arrow = path.length > 1 ? (path[1].x > spawn.x ? ' →' : ' ←') : '';
    this.gate({ x: spawn.x, z: spawn.z - 3.5 }, 3.6, [
      { text: texts.kicker.toUpperCase(), size: 0.13, color: MUTED, bold: true },
      { text: texts.title, size: 0.22, bold: true },
      { text: texts.amount, size: 0.18, color: '#9cc1f0' },
      { text: texts.hint + arrow, size: 0.14, color: ACCENT, bold: true },
    ]);

    if (plan.exit && texts.exit) this.overDoor(plan.exit, texts.exit);
    if (plan.entry && texts.entry) this.overDoor(plan.entry, texts.entry);

    // At each corner of the route, a sign a little past the turn, facing you as you arrive.
    for (let i = 1; i < path.length - 1; i++) {
      const a = direction(path[i - 1], path[i]);
      const b = direction(path[i], path[i + 1]);
      const turn = a.x * b.z - a.z * b.x; // which side of the way you're walking the next leg goes: > 0 is right
      const arrow = turn > 0.5 ? '→' : turn < -0.5 ? '←' : '↑';
      this.post({ x: path[i].x + a.x * 1.8, z: path[i].z + a.z * 1.8 }, { x: -a.x, z: -a.z }, 1.5, [
        { text: arrow, size: 0.5, color: ACCENT, bold: true },
        { text: 'Siguiente sala', size: 0.15, bold: true },
      ]);
    }

    if (path.length > 1) this.group.add(floorArrows(path));
  }

  dispose() {
    disposeObject(this.group);
  }

  // A sign on a pole at `at`, its face turned toward `facing`.
  private post(at: Point, facing: Point, width: number, lines: Line[]) {
    const { object, height } = plate(lines, width);
    object.position.y = SIGN_BOTTOM + height / 2;
    const top = SIGN_BOTTOM + height * 0.5;
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, top, 0.08), new THREE.MeshStandardMaterial({ color: 0x30343a }));
    pole.position.set(0, top / 2, -0.06);

    const post = new THREE.Group();
    post.add(object, pole);
    post.rotation.y = Math.atan2(facing.x, facing.z); // a plate faces +Z; turn that toward `facing`
    post.position.set(at.x, 0, at.z);
    post.traverse((o) => (o.castShadow = true));
    this.group.add(post);

    // Block the whole width of the plate, so you can't walk through its edges.
    const halfX = Math.abs(facing.z) * (width / 2) + Math.abs(facing.x) * 0.15;
    const halfZ = Math.abs(facing.x) * (width / 2) + Math.abs(facing.z) * 0.15;
    this.rects.push({ minX: at.x - halfX, maxX: at.x + halfX, minZ: at.z - halfZ, maxZ: at.z + halfZ });
  }

  // A plate held up by a pole at each end, facing +Z: an entrance gate you walk under.
  private gate(at: Point, width: number, lines: Line[]) {
    const { object, height } = plate(lines, width);
    object.position.set(at.x, GATE_CLEARANCE + height / 2, at.z);
    this.group.add(object);
    const top = GATE_CLEARANCE + height;
    const material = new THREE.MeshStandardMaterial({ color: 0x30343a });
    for (const side of [-1, 1]) {
      const x = at.x + side * (width / 2 + 0.05);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.1, top, 0.1), material);
      pole.position.set(x, top / 2, at.z);
      pole.castShadow = true;
      this.group.add(pole);
      this.rects.push({ minX: x - 0.15, maxX: x + 0.15, minZ: at.z - 0.15, maxZ: at.z + 0.15 });
    }
  }

  // A plate on the wall above a doorway, facing into the room.
  private overDoor(door: Door, sign: DoorSign) {
    const { object, height } = plate(
      [
        { text: sign.kicker.toUpperCase(), size: 0.13, color: ACCENT, bold: true },
        { text: sign.name, size: 0.2, bold: true },
      ],
      3.4,
    );
    const out = WALL_THICKNESS / 2 + 0.03; // just off the wall's inside face
    object.rotation.y = Math.atan2(-door.nx, -door.nz);
    object.position.set(door.x - door.nx * out, DOOR_HEIGHT + 0.25 + height / 2, door.z - door.nz * out);
    this.group.add(object);
  }
}

function direction(a: Point, b: Point): Point {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  return { x: (b.x - a.x) / length, z: (b.z - a.z) / length };
}

// A dark plate with centered lines of text, facing +Z. Text is painted on a canvas at a fixed
// resolution per meter, and long lines shrink to fit instead of running off the edge.
function plate(lines: Line[], width: number): { object: THREE.Group; height: number } {
  const pad = 0.1;
  const leading = 0.35; // space between lines, as a fraction of the text height
  const height = pad * 2 + lines.reduce((h, l) => h + l.size * (1 + leading), 0) - lines.at(-1)!.size * leading;

  const px = (meters: number) => meters * PX_PER_METER;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(px(width));
  canvas.height = Math.round(px(height));
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = PLATE;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y = pad;
  for (const line of lines) {
    const font = (size: number) => `${line.bold ? 700 : 500} ${size}px system-ui, sans-serif`;
    let size = px(line.size);
    ctx.font = font(size);
    const fit = (canvas.width - px(pad * 2)) / ctx.measureText(line.text).width;
    if (fit < 1) ctx.font = font((size *= fit));
    ctx.fillStyle = line.color ?? TEXT;
    ctx.fillText(line.text, canvas.width / 2, px(y + line.size / 2));
    y += line.size * (1 + leading);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4; // signs are often read at an angle
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.04), new THREE.MeshStandardMaterial({ color: PLATE }));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture }));
  face.position.z = 0.021; // just in front of the backing box
  const object = new THREE.Group();
  object.add(back, face);
  return { object, height };
}

// Chevrons painted along the route, all in one draw call: one geometry, one instance per arrow.
function floorArrows(path: Point[]): THREE.InstancedMesh {
  const spots: { x: number; z: number; yaw: number }[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const d = direction(a, path[i]);
    const length = Math.hypot(path[i].x - a.x, path[i].z - a.z);
    // Rotating by this yaw turns -Z (where the chevron points) toward d; the same convention as the camera.
    const yaw = Math.atan2(-d.x, -d.z);
    for (let s = 1.5; s < length - 1; s += ARROW_SPACING) spots.push({ x: a.x + d.x * s, z: a.z + d.z * s, yaw });
  }

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
  return mesh;
}
