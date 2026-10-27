import { describe, expect, it } from 'vitest';
import { Collider } from '../src/controls/collision';
import { DEFAULT_BILL } from '../src/money/denominations';
import { computeLayout, type Rect } from '../src/money/layout';
import { footprintRect, type Point } from '../src/museum/referenceLayout';
import {
  DOOR_WIDTH,
  ROOMS,
  crossedDoor,
  exitSide,
  nearestRoom,
  planRoom,
  transferPose,
  walkBounds,
  wallRects,
  type Door,
  type ExitSide,
  type RoomPlan,
} from '../src/museum/rooms';
import { REFERENCES, TEMPORAL_REFERENCES, type ReferenceId } from '../src/scene/references';

const RADIUS = 0.3; // same as the player

// The same plan main.ts builds for each museum room, plus everything solid in it.
function museumRoom(index: number, exit: ExitSide | null = exitSide(index)) {
  const preset = ROOMS[index];
  const layout = computeLayout(preset.monto, DEFAULT_BILL);
  const footprints = (preset.referencias as ReferenceId[]).map((id) => REFERENCES[id].footprint);
  const plan = planRoom(layout, footprints, { entry: index > 0, exit });
  const solids: Rect[] = [
    ...layout.placements.tarima.map((p) => footprintRect(p, layout.sizes.tarima)),
    ...layout.placements.bloque.map((p) => footprintRect(p, layout.sizes.bloque)),
    ...(layout.table ? [layout.table] : []),
    ...plan.references.map((p, i) => footprintRect(p, footprints[i])),
  ];
  return { plan, solids };
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

describe('museum rooms', () => {
  it('runs from the smallest amount to the biggest', () => {
    const amounts = ROOMS.map((r) => r.monto);
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
    expect(ROOMS[0].id).toBe('salario-minimo-anual');
    expect(ROOMS.at(-1)!.id).toBe('pef-2026');
  });

  it('has no exit in the last room and turns along the way', () => {
    expect(exitSide(ROOMS.length - 1)).toBeNull();
    const sides = ROOMS.slice(0, -1).map((_, i) => exitSide(i));
    expect(sides).toContain('derecha');
    expect(sides).toContain('izquierda');
  });

  it('finds the nearest room in orders of magnitude', () => {
    expect(ROOMS[nearestRoom(500)].id).toBe('salario-minimo-anual');
    expect(ROOMS[nearestRoom(3_000_000)].id).toBe('un-millon');
    expect(ROOMS[nearestRoom(320_000_000_000)].id).toBe('cdmx-2026'); // $313 mil millones, a hair closer than $330
    expect(ROOMS[nearestRoom(329_000_000_000)].id).toBe('refineria-olmeca');
    expect(ROOMS[nearestRoom(1e15)].id).toBe('pef-2026');
  });

  it('only uses reference ids that exist', () => {
    const ids = [...ROOMS.flatMap((r) => r.referencias), ...TEMPORAL_REFERENCES];
    for (const id of ids) expect(REFERENCES).toHaveProperty(id);
  });
});

describe('room plans', () => {
  // Every room, with every kind of exit, so a future change to EXIT_SIDES can't hide a blocked door.
  const cases = ROOMS.flatMap((r, i) => (['derecha', 'izquierda', 'fondo'] as const).map((side) => [r.id, i, side] as const));

  it.each(cases)('%s with a %s exit: the route reaches the door without crossing anything', (_, index, side) => {
    const { plan, solids } = museumRoom(index, side);
    expect(plan.path[0]).toEqual(plan.spawn);
    expect(plan.path.at(-1)).toEqual({ x: plan.exit!.x, z: plan.exit!.z });
    for (let i = 1; i < plan.path.length; i++) {
      const strip = sweep(plan.path[i - 1], plan.path[i], 1); // a meter of clearance on each side
      for (const solid of solids) expect(overlaps(strip, solid)).toBe(false);
    }
  });

  it.each(ROOMS.map((r, i) => [r.id, i] as const))('%s: you start clear of everything', (_, index) => {
    const { plan, solids } = museumRoom(index);
    const you = sweep(plan.spawn, plan.spawn, RADIUS);
    for (const solid of solids) expect(overlaps(you, solid)).toBe(false);
  });

  it('keeps the doors in the walls they belong to', () => {
    const { plan } = museumRoom(1, 'derecha');
    expect(plan.entry).toMatchObject({ wall: 'frente', z: plan.area.maxZ });
    expect(plan.exit).toMatchObject({ wall: 'derecha', x: plan.area.maxX });
    expect(museumRoom(0).plan.entry).toBeNull();
    expect(museumRoom(ROOMS.length - 1).plan.exit).toBeNull();
  });
});

describe('walking through doors', () => {
  const { plan } = museumRoom(1, 'derecha');
  const exit = plan.exit!;
  const entry = plan.entry!;

  it('counts a door as crossed only once you are well into it', () => {
    expect(crossedDoor({ x: exit.x - 0.5, z: exit.z }, plan)).toBeNull(); // still inside the room
    expect(crossedDoor({ x: exit.x + 0.5, z: exit.z }, plan)).toBeNull(); // in the doorway
    expect(crossedDoor({ x: exit.x + 1.5, z: exit.z }, plan)).toBe('exit');
    expect(crossedDoor({ x: exit.x + 1.5, z: exit.z + DOOR_WIDTH }, plan)).toBeNull(); // beside it, outside the wall
    expect(crossedDoor({ x: entry.x, z: entry.z + 1.5 }, plan)).toBe('entry');
  });

  it('keeps your heading and offset when the next door is in a different wall', () => {
    // Walking straight out of a right-hand exit (+X), half a meter to the right of its center.
    const out = transferPose({ x: exit.x + 1.5, z: exit.z + 0.5, yaw: -Math.PI / 2 }, exit, entry);
    expect(out.yaw).toBeCloseTo(0); // walking straight in: -Z
    expect(out.x).toBeCloseTo(entry.x + 0.5); // still half a meter to your right
    expect(out.z).toBeLessThan(entry.z); // inside the room
  });

  it('never lands you back in a doorway you would cross again', () => {
    for (const [from, to] of [[exit, entry], [entry, exit]] as [Door, Door][]) {
      const out = transferPose({ x: from.x + from.nx * 1.5, z: from.z + from.nz * 1.5, yaw: 0 }, from, to);
      expect(crossedDoor(out, plan)).toBeNull();
    }
  });

  it('round-trips: back out the way you came puts you where you started, turned around', () => {
    const start = { x: exit.x + 1.5, z: exit.z - 0.4, yaw: -1.4 };
    const there = transferPose(start, exit, entry);
    const back = transferPose({ ...there, yaw: there.yaw + Math.PI }, entry, exit);
    expect(back.z).toBeCloseTo(start.z);
    expect(Math.cos(back.yaw - (start.yaw + Math.PI))).toBeCloseTo(1);
  });
});

describe('walls', () => {
  const free = (collider: Collider, x: number, z: number) => !collider.hits(x, z, RADIUS);

  function walls(plan: RoomPlan) {
    return new Collider(wallRects(plan));
  }

  it('block the room except through the doors', () => {
    const { plan } = museumRoom(1, 'fondo');
    const collider = walls(plan);
    const { area } = plan;
    const exit = plan.exit!;
    expect(free(collider, (area.minX + area.maxX) / 2, (area.minZ + area.maxZ) / 2)).toBe(true);
    expect(free(collider, exit.x, area.minZ - 1)).toBe(true); // in the passage behind the exit
    expect(free(collider, exit.x + DOOR_WIDTH, area.minZ - 1)).toBe(false); // through the wall beside it
    expect(free(collider, area.maxX, (area.minZ + area.maxZ) / 2)).toBe(false); // into a side wall
    expect(free(collider, exit.x, area.minZ - 3.5)).toBe(false); // the passage has an end
  });

  it('stay inside the outer bounds', () => {
    const { plan } = museumRoom(1, 'izquierda');
    const bounds = walkBounds(plan);
    for (const r of wallRects(plan)) {
      expect(r.minX).toBeGreaterThanOrEqual(bounds.minX);
      expect(r.maxZ).toBeLessThanOrEqual(bounds.maxZ);
    }
  });
});
