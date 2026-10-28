import { union, type Rect } from '../money/layout';
import { footprintRect, type Footprint, type Point } from './referenceLayout';

export type { Point } from './referenceLayout';
export { ROOMS, roomIndex } from './collection';

// One exhibition hall, planned in its own local coordinates: the exhibit's front edge at z = 0, its
// walkway along x = 0, the entrance toward +Z. The complex (see complex.ts) lines the halls up on
// one axis, so every hall is entered and left through portals on x = 0.

export const WALL_THICKNESS = 0.6;
export const OPENING = { width: 4, height: 6 }; // the portal between two spaces
const SIDE_MARGIN = 3; // the exhibit stays clear of the columns along the side walls
const BACK_MARGIN = 5;
const FRONT_MARGIN = 10; // room to stand and look before walking in
const MIN_WIDTH = 18;
const MIN_DEPTH = 22;

// The Gran Nave: up to this size a hall is a roofed nave lit by skylights. Past it, the amount
// doesn't fit under a roof, and the hall opens to the sky as an expansion patio.
export const NAVE = { width: 60, depth: 80, height: 18 };

export type Scale = 'personal' | 'publica';

// Up to what a household could see in a lifetime, an amount is personal; past it, it's public.
export const scaleOf = (amount: number): Scale => (amount < 10_000_000 ? 'personal' : 'publica');

export interface RoomPlan {
  area: Rect; // the floor inside the walls
  content: Rect; // money plus scale references
  height: number; // tallest thing in the room
  wallHeight: number;
  roofed: boolean;
  spawn: Point; // where you start, facing the money (-Z)
  references: Point[]; // centers, in the order of the footprints given
  path: Point[]; // walking route on the floor, from the entrance to the exit
}

// The hall hugs the exhibit (see computeLayout): the walkway through it is the route.
// Personal amounts get a room at human scale; public ones get the height of the Gran Nave, or,
// open to the sky, walls high enough to frame what's inside.
export function planRoom(
  money: { bounds: Rect; height: number; references: Point[] },
  footprints: Footprint[],
  scale: Scale,
): RoomPlan {
  const { references } = money;
  const content = references.reduce((r, p, i) => union(r, footprintRect(p, footprints[i])), money.bounds);
  const height = Math.max(money.height, ...footprints.map((f) => f.h));

  const width = Math.max(MIN_WIDTH, content.maxX - content.minX + SIDE_MARGIN * 2);
  const depth = Math.max(MIN_DEPTH, content.maxZ - content.minZ + FRONT_MARGIN + BACK_MARGIN);
  const centerX = (content.minX + content.maxX) / 2;
  const frontZ = content.maxZ + FRONT_MARGIN;
  const area = { minX: centerX - width / 2, maxX: centerX + width / 2, minZ: frontZ - depth, maxZ: frontZ };

  const roofed = width <= NAVE.width && depth <= NAVE.depth;
  const wallHeight =
    scale === 'personal'
      ? Math.max(8, Math.ceil(height + 4))
      : roofed
        ? Math.max(NAVE.height, Math.ceil(height + 4))
        : Math.max(12, Math.ceil(height + 6));

  const spawn = { x: 0, z: frontZ - FRONT_MARGIN / 2 };
  return {
    area,
    content,
    height,
    wallHeight,
    roofed,
    spawn,
    references,
    path: [{ x: 0, z: area.maxZ }, spawn, { x: 0, z: area.minZ }],
  };
}
