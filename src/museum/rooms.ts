import { union, type Rect } from '../money/layout';
import { PRESETS, type Preset } from '../ui/PresetPanel';
import { footprintRect, placeReferences, type Footprint, type Point } from './referenceLayout';

export type { Point } from './referenceLayout';

// The museum: one preset per room, from the smallest amount to the biggest, joined by doors.
// Only the room you're in exists in the scene, so each room is planned in its own local
// coordinates (the money's front edge at z = 0, the entrance toward +Z), never on a shared map.

export const ROOMS: Preset[] = [...PRESETS].sort((a, b) => a.monto - b.monto);

export function roomIndex(id: string | null): number {
  return ROOMS.findIndex((r) => r.id === id);
}

// The room closest in orders of magnitude: $3 millones is near un millón, not near $115 mil.
export function nearestRoom(amount: number): number {
  const distance = (i: number) => Math.abs(Math.log(ROOMS[i].monto / amount));
  let best = 0;
  for (let i = 1; i < ROOMS.length; i++) if (distance(i) < distance(best)) best = i;
  return best;
}

export type ExitSide = 'derecha' | 'izquierda' | 'fondo';
export type Wall = 'frente' | ExitSide;

// Which wall each room's exit is on, so the walk turns instead of running down one long corridor.
const EXIT_SIDES: ExitSide[] = ['derecha', 'fondo', 'izquierda', 'izquierda', 'derecha', 'fondo'];

// The last room has no exit: it's the end of the tour.
export function exitSide(index: number): ExitSide | null {
  return index < ROOMS.length - 1 ? EXIT_SIDES[index % EXIT_SIDES.length] : null;
}

// ---------- Room shape ----------

export const WALL_THICKNESS = 0.4;
const MIN_WALL_HEIGHT = 8;
const SIDE_MARGIN = 6; // also the corridor along the side walls that leads to the exit
const BACK_MARGIN = 6;
const MIN_FRONT_MARGIN = 10; // room to stand and look before walking in
const MIN_SIZE = 20;

export const DOOR_WIDTH = 2.4;
export const DOOR_HEIGHT = 3;
const DOOR_INSET = 3; // from the nearest corner: the middle of the clear margin along the walls
export const VESTIBULE = 3; // dark passage behind each door, where the mist hangs
const CROSS_DEPTH = 1; // how far past the wall line counts as having gone through
const ARRIVE_DEPTH = 1.2; // how far inside the next room you appear: past CROSS_DEPTH, so you can't bounce straight back

// A doorway in a wall. (x, z) is the middle of the opening on the wall's center line;
// (nx, nz) is the wall's normal, pointing out of the room.
export interface Door {
  wall: Wall;
  x: number;
  z: number;
  nx: number;
  nz: number;
}

export interface RoomPlan {
  area: Rect; // the floor inside the walls
  content: Rect; // money plus scale references
  height: number; // tallest thing in the room
  wallHeight: number;
  spawn: Point; // where you start, facing the money (-Z)
  references: Point[]; // centers, in the order of the footprints given
  entry: Door | null;
  exit: Door | null;
  path: Point[]; // walking route on the floor, from the spawn point to the exit door
}

export function planRoom(
  money: { bounds: Rect; height: number },
  footprints: Footprint[],
  doors: { entry: boolean; exit: ExitSide | null },
): RoomPlan {
  const references = placeReferences(footprints);
  const content = references.reduce((r, p, i) => union(r, footprintRect(p, footprints[i])), money.bounds);
  const height = Math.max(money.height, ...footprints.map((f) => f.h));

  // Tall content needs more distance to fit in view when you walk in.
  const frontMargin = Math.max(MIN_FRONT_MARGIN, height * 3);
  const width = Math.max(MIN_SIZE, content.maxX - content.minX + SIDE_MARGIN * 2);
  const depth = Math.max(MIN_SIZE, content.maxZ - content.minZ + frontMargin + BACK_MARGIN);
  const centerX = (content.minX + content.maxX) / 2;
  const frontZ = content.maxZ + frontMargin;
  const area = { minX: centerX - width / 2, maxX: centerX + width / 2, minZ: frontZ - depth, maxZ: frontZ };

  const spawn = { x: 0, z: frontZ - frontMargin / 2 };
  const entry = doors.entry ? door('frente', 0, area.maxZ) : null;
  const exit = doors.exit ? exitDoor(doors.exit, area) : null;

  return {
    area,
    content,
    height,
    wallHeight: Math.max(MIN_WALL_HEIGHT, Math.ceil(height + 4)),
    spawn,
    references,
    entry,
    exit,
    path: exit ? guidePath(spawn, exit, area) : [],
  };
}

const NORMALS: Record<Wall, Point> = {
  frente: { x: 0, z: 1 },
  fondo: { x: 0, z: -1 },
  derecha: { x: 1, z: 0 },
  izquierda: { x: -1, z: 0 },
};

function door(wall: Wall, x: number, z: number): Door {
  return { wall, x, z, nx: NORMALS[wall].x, nz: NORMALS[wall].z };
}

// A back-wall exit sits in the right-hand corridor; a side-wall exit sits just past the money,
// in the clear strip along the back wall, so you walk the whole exhibit before turning.
function exitDoor(side: ExitSide, area: Rect): Door {
  if (side === 'fondo') return door('fondo', area.maxX - DOOR_INSET, area.minZ);
  return door(side, side === 'derecha' ? area.maxX : area.minX, area.minZ + DOOR_INSET);
}

// Step sideways to the corridor along the side wall, follow it to the back, then into the door.
// The corridor is outside the content's bounds by construction (SIDE_MARGIN, BACK_MARGIN, and
// the front margin around the spawn point), so the route never crosses money or references.
function guidePath(spawn: Point, exit: Door, area: Rect): Point[] {
  const corridorX = exit.wall === 'izquierda' ? area.minX + DOOR_INSET : area.maxX - DOOR_INSET;
  const corner = { x: corridorX, z: spawn.z };
  if (exit.wall === 'fondo') return [spawn, corner, { x: exit.x, z: exit.z }];
  return [spawn, corner, { x: corridorX, z: exit.z }, { x: exit.x, z: exit.z }];
}

// ---------- Walking through doors ----------

export interface Pose {
  x: number;
  z: number;
  yaw: number;
}

// Distance past the wall line (positive = outside) and sideways offset, both relative to the door.
// "Sideways" is measured to the right of someone walking out through it.
function doorCoords(p: Point, d: Door) {
  const dx = p.x - d.x;
  const dz = p.z - d.z;
  return { depth: dx * d.nx + dz * d.nz, side: -dx * d.nz + dz * d.nx };
}

export function crossedDoor(p: Point, plan: RoomPlan): 'entry' | 'exit' | null {
  for (const which of ['entry', 'exit'] as const) {
    const d = plan[which];
    if (!d) continue;
    const { depth, side } = doorCoords(p, d);
    if (depth > CROSS_DEPTH && Math.abs(side) < DOOR_WIDTH / 2) return which;
  }
  return null;
}

// The yaw at which the camera looks along (x, z). Yaw 0 looks down -Z (see Player).
const yawToward = (x: number, z: number) => Math.atan2(-x, -z);

// Carry a pose out through one door and in through another: same sideways offset, same angle
// to the doorway. Walking straight out of a right-hand exit puts you walking straight into
// the next room, even though its entrance is in a different wall.
export function transferPose(pose: Pose, from: Door, to: Door): Pose {
  const limit = DOOR_WIDTH / 2 - 0.4;
  const side = Math.max(-limit, Math.min(limit, doorCoords(pose, from).side));
  // Walking in is along -n; the right of that direction is (nz, -nx).
  return {
    x: to.x - to.nx * ARRIVE_DEPTH + to.nz * side,
    z: to.z - to.nz * ARRIVE_DEPTH - to.nx * side,
    yaw: pose.yaw - yawToward(from.nx, from.nz) + yawToward(-to.nx, -to.nz),
  };
}

// ---------- Collision ----------

const OUTSIDE = VESTIBULE + 1; // how far past the wall line the collision slabs reach

// Floor-plan collision for the walls. Each wall is a slab from its inside face to well past the
// vestibules, thicker than one frame of running, so you can't tunnel through. Each door cuts
// a gap in its slab, and a cap closes the far end of the vestibule behind it.
export function wallRects(plan: RoomPlan): Rect[] {
  const { area } = plan;
  const doors = [plan.entry, plan.exit].filter((d): d is Door => d !== null);
  const rects: Rect[] = [];
  for (const wall of Object.keys(NORMALS) as Wall[]) {
    const alongX = wall === 'frente' || wall === 'fondo';
    const [start, end] = alongX ? [area.minX - OUTSIDE, area.maxX + OUTSIDE] : [area.minZ - OUTSIDE, area.maxZ + OUTSIDE];
    let from = start;
    for (const d of doors.filter((d) => d.wall === wall).sort((a, b) => (alongX ? a.x - b.x : a.z - b.z))) {
      const center = alongX ? d.x : d.z;
      rects.push(slab(area, wall, from, center - DOOR_WIDTH / 2, -WALL_THICKNESS / 2, OUTSIDE));
      rects.push(slab(area, wall, center - DOOR_WIDTH / 2, center + DOOR_WIDTH / 2, VESTIBULE, OUTSIDE));
      from = center + DOOR_WIDTH / 2;
    }
    rects.push(slab(area, wall, from, end, -WALL_THICKNESS / 2, OUTSIDE));
  }
  return rects;
}

// A rectangle along a wall: `a`..`b` along the wall, `near`..`far` measured outward from its center line.
function slab(area: Rect, wall: Wall, a: number, b: number, near: number, far: number): Rect {
  switch (wall) {
    case 'frente':
      return { minX: a, maxX: b, minZ: area.maxZ + near, maxZ: area.maxZ + far };
    case 'fondo':
      return { minX: a, maxX: b, minZ: area.minZ - far, maxZ: area.minZ - near };
    case 'derecha':
      return { minX: area.maxX + near, maxX: area.maxX + far, minZ: a, maxZ: b };
    case 'izquierda':
      return { minX: area.minX - far, maxX: area.minX - near, minZ: a, maxZ: b };
  }
}

// The outer limit for the player: the room plus its vestibules. The walls themselves are colliders.
export function walkBounds(plan: RoomPlan) {
  const { minX, maxX, minZ, maxZ } = plan.area;
  return { minX: minX - OUTSIDE, maxX: maxX + OUTSIDE, minZ: minZ - OUTSIDE, maxZ: maxZ + OUTSIDE };
}
