import type { Rect } from '../money/layout';

// Where each room's scale references stand. Pure numbers in meters, like money/layout.ts.

export interface Point {
  x: number;
  z: number;
}

// Floor space an object needs (X × Z) and how tall it is.
export interface Footprint {
  w: number;
  d: number;
  h: number;
}

export const WALKWAY = 3; // clear aisle down the middle of the room, from the entrance through the exhibit

// References stand in the front row of the exhibit, one row on each side of the walkway:
// the first on the right, the next on the left, and so on, each one further out than the last.
// Presets list them smallest first, so the familiar small things end up nearest the path.
// Front edges line up on z = 0, where the exhibit starts; the money fills in around and behind them.
// `start` is how far out each side's row already goes, [right, left]: the table may be there first.
export function placeReferences(items: Footprint[], start: [number, number] = [WALKWAY / 2, WALKWAY / 2]): Point[] {
  const reach = [...start];
  return items.map((f, i) => {
    const side = i % 2;
    const gap = reach[side] > WALKWAY / 2 ? spacing(f) : 0;
    const x = reach[side] + gap + f.w / 2;
    reach[side] = x + f.w / 2;
    return { x: side === 0 ? x : -x, z: -f.d / 2 };
  });
}

// Room to walk around an object, growing with its size: half a meter beside a backpack, more beside a plane.
export function spacing(f: Footprint): number {
  return Math.min(3, Math.max(0.5, Math.max(f.w, f.d) * 0.1));
}

export function footprintRect(p: Point, f: Pick<Footprint, 'w' | 'd'>): Rect {
  return { minX: p.x - f.w / 2, maxX: p.x + f.w / 2, minZ: p.z - f.d / 2, maxZ: p.z + f.d / 2 };
}
