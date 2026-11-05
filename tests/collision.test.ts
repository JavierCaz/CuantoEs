import { describe, expect, it } from 'vitest';
import { Collider } from '../src/controls/collision';

describe('Collider', () => {
  const box = { minX: 0, maxX: 1.2, minZ: -1, maxZ: 0 };
  const collider = new Collider([box]);

  it('detects a player overlapping a box', () => {
    expect(collider.hits(0.6, -0.5, 0.3)).toBe(true);
    expect(collider.hits(-0.2, -0.5, 0.3)).toBe(true); // touching through the radius
  });

  it('ignores a player that is clear of every box', () => {
    expect(collider.hits(-0.5, -0.5, 0.3)).toBe(false);
    expect(collider.hits(10, 10, 0.3)).toBe(false);
  });

  it('adds and removes boxes, exactly the ones given', () => {
    const a = { minX: 20, maxX: 21, minZ: 20, maxZ: 21 };
    const b = { minX: 20, maxX: 21, minZ: 20, maxZ: 21 }; // same place, another box
    const c = new Collider([a]);
    c.add([b]);
    c.remove([a]);
    expect(c.hits(20.5, 20.5, 0.3)).toBe(true);
    c.remove([b]);
    expect(c.hits(20.5, 20.5, 0.3)).toBe(false);
    c.add([a]);
    expect(c.hits(20.5, 20.5, 0.3)).toBe(true);
  });

  it('finds boxes that straddle grid cells', () => {
    const wide = new Collider([{ minX: -10, maxX: 10, minZ: 3.5, maxZ: 4.5 }], 4);
    expect(wide.hits(7, 4, 0.3)).toBe(true);
    expect(wide.hits(-7, 4, 0.3)).toBe(true);
  });
});
