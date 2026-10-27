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

export const WALKWAY = 4; // clear aisle down the middle, from the spawn point to the money
const FRONT_GAP = 1.5; // between the money's front edge (z = 0) and the references

// References stand in front of the money (z > 0) in one row on each side of the walkway:
// the first on the right, the next on the left, and so on, each one further out than the last.
// Presets list them smallest first, so the familiar small things end up nearest the path.
// Back edges line up, so every reference sits as close to the money as possible.
export function placeReferences(items: Footprint[]): Point[] {
  const reach = [WALKWAY / 2, WALKWAY / 2]; // how far out each side's row already goes: [right, left]
  return items.map((f, i) => {
    const side = i % 2;
    const gap = i < 2 ? 0 : spacing(f);
    const x = reach[side] + gap + f.w / 2;
    reach[side] = x + f.w / 2;
    return { x: side === 0 ? x : -x, z: FRONT_GAP + f.d / 2 };
  });
}

// Room to walk around an object, growing with its size: half a meter beside a backpack, more beside a plane.
function spacing(f: Footprint): number {
  return Math.min(3, Math.max(0.5, Math.max(f.w, f.d) * 0.1));
}

export function footprintRect(p: Point, f: Footprint): Rect {
  return { minX: p.x - f.w / 2, maxX: p.x + f.w / 2, minZ: p.z - f.d / 2, maxZ: p.z + f.d / 2 };
}
