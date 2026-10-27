import { describe, expect, it } from 'vitest';
import { Collider } from '../src/controls/collision';
import { goalSolids } from '../src/scene/references/sports';

// Goal line at z = 0, posts at x = ±3.66, net reaching back to z = -2.
const collider = new Collider(goalSolids(0));
const RADIUS = 0.3; // same as the player
const free = (x: number, z: number) => !collider.hits(x, z, RADIUS);

describe('goal collision', () => {
  it('lets you walk into the mouth, just past the goal line', () => {
    expect(free(0, 1)).toBe(true);
    expect(free(0, 0)).toBe(true);
    expect(free(2, -0.2)).toBe(true);
  });

  it('stops you before your head reaches the sloped back net', () => {
    expect(free(0, -0.5)).toBe(false);
    expect(free(0, -1.5)).toBe(false);
  });

  it('blocks the side nets and back supports from outside', () => {
    expect(free(-3.66, -1)).toBe(false); // standing on the left side net
    expect(free(3.66, -1.8)).toBe(false); // right support, near the back
    expect(free(-4.1, -1)).toBe(true); // just outside the left net
  });

  it('blocks walking through from behind', () => {
    expect(free(0, -2.2)).toBe(false); // touching the back ground bar
    expect(free(0, -2.5)).toBe(true); // clear behind the goal
  });
});
