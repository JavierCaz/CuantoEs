import { describe, expect, it } from 'vitest';
import { Collider } from '../src/controls/collision';
import { DEFAULT_BILL } from '../src/money/denominations';
import { computeLayout, type Rect } from '../src/money/layout';
import { WALKWAY, footprintRect, type Point } from '../src/museum/referenceLayout';
import { NAVE, ROOMS, planRoom, scaleOf } from '../src/museum/rooms';
import { CEDULA, GATE_AHEAD, cedulaSides, PAD_SIZE, PASSAGE, RULER, RULER_AMOUNTS, padAt, planComplex, spaceIndexAt, type Complex } from '../src/museum/complex';
import { GROUPED_ROOMS } from '../src/museum/collection';
import { BILLS_PER, UNIT_KINDS } from '../src/money/layout';
import { REFERENCES, TEMPORAL_REFERENCES, type ReferenceId } from '../src/scene/references';

const RADIUS = 0.3; // same as the player
const footprint = (id: string) => REFERENCES[id as ReferenceId].footprint;

// The same plan the complex builds for each hall, plus everything solid in it.
function hall(index: number) {
  const preset = ROOMS[index];
  const footprints = preset.referencias.map(footprint);
  const layout = computeLayout(preset.monto, DEFAULT_BILL, footprints);
  const plan = planRoom(layout, footprints, scaleOf(preset.monto));
  const money: Rect[] = [
    ...layout.placements.tarima.map((p) => footprintRect(p, layout.sizes.tarima)),
    ...layout.placements.bloque.map((p) => footprintRect(p, layout.sizes.bloque)),
    ...(layout.table ? [layout.table] : []),
  ];
  const references = plan.references.map((p, i) => footprintRect(p, footprints[i]));
  return { plan, money, references, solids: [...money, ...references] };
}

const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

// The floor strip a walking person sweeps along one straight leg of a route.
function sweep(a: Point, b: Point, radius: number): Rect {
  return {
    minX: Math.min(a.x, b.x) - radius,
    maxX: Math.max(a.x, b.x) + radius,
    minZ: Math.min(a.z, b.z) - radius,
    maxZ: Math.max(a.z, b.z) + radius,
  };
}

const rooms = ROOMS.map((r, i) => [r.id, i] as const);

describe('hall plans', () => {
  it.each(rooms)('%s: the route runs straight down the axis without crossing anything', (_, index) => {
    const { plan, solids } = hall(index);
    expect(plan.path.every((p) => p.x === 0)).toBe(true);
    expect(plan.path[0].z).toBe(plan.area.maxZ);
    expect(plan.path.at(-1)!.z).toBe(plan.area.minZ);
    expect(plan.path.at(-1)!.z).toBeLessThan(plan.content.minZ); // all the way past the back of the exhibit
    for (let i = 1; i < plan.path.length; i++) {
      const strip = sweep(plan.path[i - 1], plan.path[i], 1); // a meter of clearance on each side
      for (const solid of solids) expect(overlaps(strip, solid)).toBe(false);
    }
  });

  it.each(rooms)('%s: the money flows around the references, not over them', (_, index) => {
    const { money, references } = hall(index);
    for (const m of money) {
      expect(m.minX >= WALKWAY / 2 - 1e-9 || m.maxX <= -WALKWAY / 2 + 1e-9).toBe(true);
      for (const r of references) expect(overlaps(m, r)).toBe(false);
    }
  });

  it.each(rooms)('%s: you start clear of everything, with the exhibit inside the walls', (_, index) => {
    const { plan, solids } = hall(index);
    const you = sweep(plan.spawn, plan.spawn, RADIUS);
    for (const solid of solids) expect(overlaps(you, solid)).toBe(false);
    const { area, content } = plan;
    expect(content.minX).toBeGreaterThan(area.minX);
    expect(content.maxX).toBeLessThan(area.maxX);
    expect(content.minZ).toBeGreaterThan(area.minZ);
    expect(plan.wallHeight).toBeGreaterThan(plan.height);
  });

  it('roofs the halls that fit in the nave and opens the rest to the sky', () => {
    for (const [, index] of rooms) {
      const { plan } = hall(index);
      const fits = plan.area.maxX - plan.area.minX <= NAVE.width && plan.area.maxZ - plan.area.minZ <= NAVE.depth;
      expect(plan.roofed).toBe(fits);
    }
    expect(hall(ROOMS.findIndex((r) => r.id === 'aifa')).plan.roofed).toBe(true);
    expect(hall(ROOMS.findIndex((r) => r.id === 'pef-2026')).plan.roofed).toBe(false); // an expansion patio
  });
});

describe('the complex', () => {
  const complex = planComplex({ footprint });
  const { spaces } = complex;

  it('runs from the plaza through every sala to the patio de reflexión', () => {
    const kinds = spaces.map((s) => s.kind);
    expect(kinds.slice(0, 3)).toEqual(['plaza', 'vestibulo', 'patio']);
    expect(kinds.at(-1)).toBe('reflexion');
    expect(kinds.filter((k) => k === 'patio')).toHaveLength(4);
    const halls = spaces.filter((s) => s.kind === 'sala');
    expect(halls.map((s) => s.id)).toEqual(GROUPED_ROOMS.map((g) => g.grupo.id));
    expect(halls.map((s) => s.rooms)).toEqual(GROUPED_ROOMS.map((g) => g.rooms));
    for (const h of halls) h.exhibits.forEach((e, i) => expect(Math.abs(e.layout.amount - ROOMS[h.rooms![i]].monto)).toBeLessThan(500));
  });

  // Each hall is sized for the biggest of its exhibits, and every one of them fits in it.
  it.each(rooms)('%s: fits in its group hall, starting at the same entrance', (_, index) => {
    const space = spaces.find((s) => s.rooms?.includes(index))!;
    const { plan } = hall(index);
    const dz = space.origin.z;
    expect(plan.content.minX).toBeGreaterThan(space.area.minX);
    expect(plan.content.maxX).toBeLessThan(space.area.maxX);
    expect(plan.content.minZ + dz).toBeGreaterThan(space.area.minZ);
    expect(plan.spawn.z + dz).toBeCloseTo(space.spawn.z);
    expect(space.wallHeight).toBeGreaterThan(plan.height); // roofed or open, the walls stand over what's inside
  });

  it('lays a pad per exhibit at the entrance of the halls that show several', () => {
    for (const space of spaces.filter((s) => s.kind === 'sala')) {
      const pads = space.pads ?? [];
      if (space.rooms!.length === 1) {
        expect(pads).toHaveLength(0);
        continue;
      }
      expect(pads.map((p) => p.exhibit)).toEqual(space.rooms!.map((_, i) => i));
      const solids = space.rooms!.flatMap((i) =>
        hall(i).solids.map((r) => ({ ...r, minZ: r.minZ + space.origin.z, maxZ: r.maxZ + space.origin.z })),
      );
      const xs = pads.map((p) => p.rect.minX);
      expect(xs).toEqual([...xs].sort((a, b) => a - b)); // smallest on the left
      for (const pad of pads) {
        const r = pad.rect;
        expect(r.maxX - r.minX).toBeCloseTo(PAD_SIZE);
        // Off the walkway, so walking down the axis never changes the exhibit.
        expect(r.minX >= WALKWAY / 2 + RADIUS || r.maxX <= -(WALKWAY / 2 + RADIUS)).toBe(true);
        expect(r.minX).toBeGreaterThan(space.area.minX + 1);
        expect(r.maxX).toBeLessThan(space.area.maxX - 1);
        expect(r.minZ).toBeGreaterThan(space.origin.z); // in front of every exhibit
        expect(r.maxZ).toBeLessThan(space.spawn.z - RADIUS); // you don't start on one
        for (const solid of solids) expect(overlaps(r, solid)).toBe(false);
        const center = { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
        expect(padAt(space, center)).toBe(pad);
      }
      expect(padAt(space, space.spawn)).toBeNull();
    }
  });

  // From a pad you look toward the exhibit: the cédula has to be there, not behind you.
  it("stands each hall's cédulas ahead of its pads, one per side of the row, clear of everything", () => {
    for (const space of spaces.filter((s) => s.kind === 'sala')) {
      const sides = cedulaSides(space);
      expect(sides).toHaveLength(space.pads?.length ? 2 : 1);
      const z = space.spawn.z - GATE_AHEAD;
      // What Signs.post blocks for a plate facing { x: ±turn, z: 1 }, plus a margin.
      const half = CEDULA.width / 2 + CEDULA.turn * 0.15 + 0.3;
      const halfZ = CEDULA.turn * (CEDULA.width / 2) + 0.15 + 0.3;
      for (const side of sides) {
        const x = side * CEDULA.x;
        const cedula = { minX: x - half, maxX: x + half, minZ: z - halfZ, maxZ: z + halfZ };
        expect(Math.min(Math.abs(cedula.minX), Math.abs(cedula.maxX))).toBeGreaterThan(WALKWAY / 2 + RADIUS);
        expect(cedula.minX).toBeGreaterThan(space.area.minX + 0.5);
        expect(cedula.maxX).toBeLessThan(space.area.maxX - 0.5);
        expect(cedula.minZ).toBeGreaterThan(space.origin.z); // in front of every exhibit
        for (const pad of space.pads ?? []) {
          expect(cedula.maxZ).toBeLessThan(pad.rect.minZ); // further in than the pads
          if (Math.sign(pad.rect.minX) === side) expect(Math.abs(x - (pad.rect.minX + pad.rect.maxX) / 2)).toBeLessThan(2.5); // ahead of its half
        }
        for (const i of space.rooms!) {
          for (const r of hall(i).solids) expect(overlaps(cedula, { ...r, minZ: r.minZ + space.origin.z, maxZ: r.maxZ + space.origin.z })).toBe(false);
        }
      }
    }
  });

  it('lines the spaces up along -Z, a passage apart, each open to the next', () => {
    expect(spaces[0].front).toBeNull();
    expect(spaces.at(-1)!.back).toBeNull();
    for (let i = 1; i < spaces.length; i++) {
      expect(spaces[i].area.maxZ).toBeCloseTo(spaces[i - 1].area.minZ - PASSAGE);
      expect(spaces[i].front).not.toBeNull();
      expect(spaces[i - 1].back).not.toBeNull();
      // The portal on the axis is inside both walls.
      const width = spaces[i].front!.width;
      for (const s of [spaces[i - 1], spaces[i]]) {
        expect(s.area.minX).toBeLessThan(-width);
        expect(s.area.maxX).toBeGreaterThan(width);
      }
    }
  });

  it("lays the vestíbulo's ruler out ten times bigger at every step, off the axis", () => {
    for (let i = 1; i < RULER_AMOUNTS.length; i++) expect(RULER_AMOUNTS[i]).toBe(RULER_AMOUNTS[i - 1] * 10);
    const vestibulo = spaces.find((s) => s.kind === 'vestibulo')!;
    const { layout } = vestibulo.exhibits[0];
    expect(layout.amount).toBe(RULER_AMOUNTS.reduce((a, b) => a + b));
    // Each step holds exactly its amount: count what sits near it.
    for (const step of RULER) {
      const bills = UNIT_KINDS.reduce((sum, k) => sum + layout.placements[k].filter((p) => Math.abs(p.z - step.z) < 1).length * BILLS_PER[k], 0);
      expect(bills * 500).toBe(step.amount);
      if (step.plinth) {
        expect(step.plinth.maxX).toBeLessThan(-WALKWAY / 2);
        expect(step.plinth.minX).toBeGreaterThan(vestibulo.area.minX);
      }
    }
    expect(RULER.at(-1)!.z).toBeGreaterThan(vestibulo.area.minZ - vestibulo.origin.z + 1);
  });

  it('keeps each exhibit inside its own space', () => {
    for (const s of spaces) {
      for (const e of s.exhibits) {
        const b = e.layout.bounds;
        expect(b.minX + e.origin.x).toBeGreaterThanOrEqual(s.area.minX);
        expect(b.maxX + e.origin.x).toBeLessThanOrEqual(s.area.maxX);
        expect(b.minZ + e.origin.z).toBeGreaterThanOrEqual(s.area.minZ);
        expect(b.maxZ + e.origin.z).toBeLessThanOrEqual(s.area.maxZ);
      }
    }
  });

  it('knows which space you are in, halfway through each passage', () => {
    spaces.forEach((s, i) => {
      expect(spaceIndexAt(spaces, s.spawn)).toBe(i);
      if (i > 0) {
        expect(spaceIndexAt(spaces, { x: 0, z: s.area.maxZ + PASSAGE / 2 - 0.1 })).toBe(i);
        expect(spaceIndexAt(spaces, { x: 0, z: s.area.maxZ + PASSAGE / 2 + 0.1 })).toBe(i - 1);
      }
    });
  });

  // Everything the scene makes solid that the plan knows about: walls, money and references,
  // with the `pick`-th exhibit on show in every hall (or its last, if it has fewer).
  function collider(c: Complex, pick = 0) {
    const rects = [...c.walls];
    for (const s of c.spaces) {
      for (const e of s.exhibits.slice(Math.min(pick, s.exhibits.length - 1)).slice(0, 1)) {
        const shift = (r: Rect) => ({ minX: r.minX + e.origin.x, maxX: r.maxX + e.origin.x, minZ: r.minZ + e.origin.z, maxZ: r.maxZ + e.origin.z });
        for (const p of e.layout.placements.tarima.concat(e.layout.placements.bloque)) {
          const size = e.layout.placements.tarima.includes(p) ? e.layout.sizes.tarima : e.layout.sizes.bloque;
          rects.push(shift(footprintRect(p, size)));
        }
        if (e.layout.table) rects.push(shift(e.layout.table));
        for (const r of e.references) rects.push(footprintRect(r.at, footprint(r.id)));
      }
    }
    return new Collider(rects);
  }

  it.each([0, 1, 2, 3])('lets you walk the whole axis without bumping into anything, exhibit %i on show', (pick) => {
    const c = collider(complex, pick);
    const end = spaces.at(-1)!.area.minZ + 1;
    for (let z = spaces[0].spawn.z; z > end; z -= 0.25) expect(c.hits(0, z, RADIUS)).toBe(false);
  });

  it('walls you in everywhere but the portals', () => {
    const c = collider(complex);
    const vestibulo = spaces[1];
    const between = vestibulo.area.maxZ + PASSAGE / 2; // in the passage from the plaza
    expect(c.hits(0, between, RADIUS)).toBe(false);
    expect(c.hits(vestibulo.front!.width / 2 + 0.5, between, RADIUS)).toBe(true); // the passage's side wall
    expect(c.hits(vestibulo.area.maxX, (vestibulo.area.minZ + vestibulo.area.maxZ) / 2, RADIUS)).toBe(true);
    for (const s of spaces) {
      expect(s.area.minX).toBeGreaterThanOrEqual(complex.bounds.minX);
      expect(s.area.minZ).toBeGreaterThanOrEqual(complex.bounds.minZ);
    }
  });

  it('adds the Sala temporal at the end when you type an amount', () => {
    const withTemporal = planComplex({ footprint, temporal: { amount: 2.5e9, references: TEMPORAL_REFERENCES } });
    const last = withTemporal.spaces.at(-1)!;
    expect(last.kind).toBe('temporal');
    expect(withTemporal.spaces.at(-2)!.kind).toBe('reflexion');
    expect(withTemporal.spaces.at(-2)!.back).not.toBeNull();
    const c = collider(withTemporal);
    for (let z = last.area.maxZ + PASSAGE; z > last.area.minZ + 1; z -= 0.25) expect(c.hits(0, z, RADIUS)).toBe(false);
  });
});
