import type { Rect } from '../money/layout';

// 2D collision on the floor plane. Obstacles are axis-aligned rectangles (AABBs);
// the player is a circle approximated by a square of side 2 × radius.
// A uniform grid ("spatial hash") means each check only looks at nearby obstacles,
// not all 20,000 pallets.
export class Collider {
  private cells = new Map<string, Rect[]>();

  constructor(
    rects: Rect[],
    private cellSize = 4,
  ) {
    for (const r of rects) {
      this.forEachCell(r.minX, r.maxX, r.minZ, r.maxZ, (key) => {
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(r);
      });
    }
  }

  hits(x: number, z: number, radius: number): boolean {
    let hit = false;
    this.forEachCell(x - radius, x + radius, z - radius, z + radius, (key) => {
      for (const r of this.cells.get(key) ?? []) {
        if (x + radius > r.minX && x - radius < r.maxX && z + radius > r.minZ && z - radius < r.maxZ) {
          hit = true;
        }
      }
    });
    return hit;
  }

  private forEachCell(minX: number, maxX: number, minZ: number, maxZ: number, fn: (key: string) => void) {
    const s = this.cellSize;
    for (let cx = Math.floor(minX / s); cx <= Math.floor(maxX / s); cx++) {
      for (let cz = Math.floor(minZ / s); cz <= Math.floor(maxZ / s); cz++) {
        fn(`${cx},${cz}`);
      }
    }
  }
}
