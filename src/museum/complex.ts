import { DEFAULT_BILL } from '../money/denominations';
import { BILLS_PER, UNIT_KINDS, computeLayout, union, unitSizes, type Layout, type Placement, type Rect, type UnitKind } from '../money/layout';
import { formatNumber } from '../i18n/format';
import { SALAS, ROOMS, type SalaId } from './collection';
import { footprintRect, type Footprint, type Point } from './referenceLayout';
import { OPENING, WALL_THICKNESS, planRoom, scaleOf, type RoomPlan, type Scale } from './rooms';

// The whole museum on one processional axis (x = 0), walked toward -Z, like a calzada:
//
//   Plaza de acceso → Vestíbulo (how to read the museum: a ruler from one bill to a tarima)
//     → patio · Sala 1 Tu dinero → its halls → patio · Sala 2 Tu ciudad → …
//     → Patio de reflexión (→ Sala temporal, when you type an amount)
//
// Every space opens onto the next through a deep portal on the axis, so from one space you see
// a slice of the next ones without grasping yet how big they are. Pure numbers in meters.

export type SpaceKind = 'plaza' | 'vestibulo' | 'patio' | 'sala' | 'reflexion' | 'temporal';
export type Roof = 'abierto' | 'tragaluces' | 'oculo';

// Money and scale objects on display, in world coordinates (the layout is local to `origin`).
export interface Exhibit {
  layout: Layout;
  origin: Point;
  references: { id: string; at: Point }[];
}

export interface Space {
  id: string;
  kind: SpaceKind;
  title: string;
  area: Rect; // floor inside the walls, world coordinates
  wallHeight: number;
  roof: Roof;
  front: Portal | null; // the opening you come in through
  back: Portal | null; // the opening to the next space
  spawn: Point; // facing -Z
  path: Point[]; // walking route, front opening → back opening
  exhibits: Exhibit[];
  sala?: SalaId; // halls and the patio that introduces their sala
  room?: number; // index into ROOMS
  plan?: RoomPlan; // halls: the local plan, before shifting by `origin`
  origin: Point;
}

export interface Portal {
  width: number;
  height: number;
}

export interface Complex {
  spaces: Space[];
  bounds: Rect;
  walls: Rect[]; // floor-plan collision for every wall and portal
}

export const PASSAGE = 4; // depth of the portal between two spaces: a thick, cool wall to walk through
const ENTRANCE: Portal = { width: 5, height: 9 }; // the monumental access from the plaza

export interface ComplexInput {
  footprint: (id: string) => Footprint;
  temporal?: { amount: number; references: string[] };
}

export function planComplex({ footprint, temporal }: ComplexInput): Complex {
  const specs: Omit<Space, 'front' | 'back'>[] = [];
  const local = (spec: Omit<Space, 'front' | 'back'>) => specs.push(spec);
  const empty = (kind: SpaceKind, id: string, title: string, w: number, d: number, wallHeight: number, roof: Roof) => ({
    id,
    kind,
    title,
    area: { minX: -w / 2, maxX: w / 2, minZ: -d, maxZ: 0 },
    wallHeight,
    roof,
    spawn: { x: 0, z: -Math.min(5, d / 3) },
    path: [],
    exhibits: [],
    origin: { x: 0, z: 0 },
  });

  // High walls all around the plaza; the inscription goes over the portal.
  local({ ...empty('plaza', 'plaza', 'Plaza de acceso', 26, 26, 14, 'abierto'), spawn: { x: 0, z: -5 } });
  // Long enough for the ruler along its left wall; you walk in past the first step.
  local({ ...empty('vestibulo', 'vestibulo', 'Vestíbulo', 14, 24, 9, 'oculo'), spawn: { x: 0, z: -2.5 }, exhibits: [ruler()] });

  SALAS.forEach((sala, n) => {
    // Each sala opens with a patio: a breath of open air before a new scale.
    local({ ...empty('patio', `patio-${sala.id}`, `Sala ${n + 1} · ${sala.nombre}`, 22, 20, 8, 'abierto'), sala: sala.id });
    ROOMS.forEach((preset, index) => {
      if (preset.sala !== sala.id) return;
      local(hall(preset.id, preset.titulo, preset.monto, preset.referencias, scaleOf(preset.monto), {
        sala: sala.id,
        room: index,
      }));
    });
  });

  local({ ...empty('reflexion', 'reflexion', 'Patio de reflexión', 26, 26, 9, 'abierto') });
  if (temporal) {
    local(hall('temporal', 'Sala temporal', temporal.amount, temporal.references, scaleOf(temporal.amount), {}, 'temporal'));
  }

  function hall(
    id: string,
    title: string,
    amount: number,
    referencias: string[],
    scale: Scale,
    extra: Partial<Space>,
    kind: SpaceKind = 'sala',
  ): Omit<Space, 'front' | 'back'> {
    const footprints = referencias.map(footprint);
    const layout = computeLayout(amount, DEFAULT_BILL, footprints);
    const plan = planRoom(layout, footprints, scale);
    return {
      id,
      kind,
      title,
      area: plan.area,
      wallHeight: plan.wallHeight,
      roof: plan.roofed ? 'tragaluces' : 'abierto',
      spawn: plan.spawn,
      path: plan.path,
      exhibits: [{ layout, origin: { x: 0, z: 0 }, references: referencias.map((id, i) => ({ id, at: plan.references[i] })) }],
      plan,
      origin: { x: 0, z: 0 },
      ...extra,
    };
  }

  // Line them up: each space's front wall a passage behind the previous one's back wall.
  const spaces: Space[] = [];
  let cursor = 0;
  specs.forEach((spec, i) => {
    const dz = cursor - spec.area.maxZ;
    const shift = (p: Point) => ({ x: p.x, z: p.z + dz });
    const area = { ...spec.area, minZ: spec.area.minZ + dz, maxZ: spec.area.maxZ + dz };
    const portal = (j: number): Portal => ({ ...OPENING, ...(j === 0 ? ENTRANCE : {}) });
    spaces.push({
      ...spec,
      area,
      origin: shift(spec.origin),
      spawn: shift(spec.spawn),
      path: spec.path.length ? spec.path.map(shift) : [{ x: 0, z: area.maxZ }, shift(spec.spawn), { x: 0, z: area.minZ }],
      exhibits: spec.exhibits.map((e) => ({ ...e, origin: shift(e.origin), references: e.references.map((r) => ({ ...r, at: shift(r.at) })) })),
      front: i > 0 ? portal(i - 1) : null,
      back: i < specs.length - 1 ? portal(i) : null,
    });
    cursor = area.minZ - PASSAGE;
  });
  // The plaza has no way in from behind, and the last space no way out.
  spaces[0].path = spaces[0].path.slice(1);
  spaces.at(-1)!.path = spaces.at(-1)!.path.slice(0, -1);

  const bounds = spaces.reduce(
    (b, s) => ({
      minX: Math.min(b.minX, s.area.minX - WALL_THICKNESS),
      maxX: Math.max(b.maxX, s.area.maxX + WALL_THICKNESS),
      minZ: Math.min(b.minZ, s.area.minZ - WALL_THICKNESS),
      maxZ: Math.max(b.maxZ, s.area.maxZ + WALL_THICKNESS),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
  return { spaces, bounds, walls: wallRects(spaces) };
}

// ---------- The vestíbulo's ruler ----------

// Seven steps along the left wall, each worth ten times the last, from one billete to a tarima.
// Watching bills turn into fajos, paquetes and a tarima is how the museum teaches its units,
// and the last step, $500 millones, is the scale the big halls start from.
export const RULER_AMOUNTS = [500, 5_000, 50_000, 500_000, 5_000_000, 50_000_000, 500_000_000];
export const RULER_X = -4.2;
const RULER_START = -3.5;
const RULER_STEP = 2.8;
const PLINTH_HEIGHT = 0.9;
const PLINTH_MARGIN = 0.12;
const PAQUETE_GRID = 5; // paquetes per row and per column on a plinth, before stacking another layer
const GAP = 0.01;

export interface RulerStep {
  amount: number;
  z: number; // local to the vestíbulo, like its exhibit
  plinth: (Rect & { height: number }) | null; // the tarima stands on the floor
  caption: string; // what it's made of: "10 fajos"
}

function rulerStep(amount: number, i: number, sizes: Layout['sizes'], out: Record<UnitKind, Placement[]>): RulerStep {
  const z = RULER_START - i * RULER_STEP;
  const bills = amount / DEFAULT_BILL.value;
  const at = (kind: UnitKind, x: number, y: number, dz: number) => out[kind].push({ x: RULER_X + x, y, z: z + dz });

  if (bills >= BILLS_PER.tarima) {
    at('tarima', 0, 0, 0);
    return { amount, z, plinth: null, caption: 'Una tarima: un millón de billetes' };
  }

  // Everything smaller sits on a cantera plinth: loose bills and fajos stacked, paquetes in a grid.
  const kind: UnitKind = bills >= BILLS_PER.paquete ? 'paquete' : bills >= BILLS_PER.fajo ? 'fajo' : 'billete';
  const n = bills / BILLS_PER[kind];
  const { w, h, d } = sizes[kind];
  const cols = kind === 'paquete' ? Math.min(n, PAQUETE_GRID) : 1;
  const rows = kind === 'paquete' ? Math.min(Math.ceil(n / cols), PAQUETE_GRID) : 1;
  for (let k = 0; k < n; k++) {
    const layer = Math.floor(k / (cols * rows));
    const col = k % cols;
    const row = Math.floor(k / cols) % rows;
    at(kind, (col - (cols - 1) / 2) * (w + GAP), PLINTH_HEIGHT + layer * h, (row - (rows - 1) / 2) * (d + GAP));
  }
  const half = { x: Math.max(0.3, (cols * (w + GAP)) / 2 + PLINTH_MARGIN), z: Math.max(0.3, (rows * (d + GAP)) / 2 + PLINTH_MARGIN) };
  const names: Record<string, [string, string]> = { billete: ['billete', 'billetes'], fajo: ['fajo', 'fajos'], paquete: ['paquete', 'paquetes'] };
  const [one, many] = names[kind];
  const each = kind === 'fajo' ? ' de 100 billetes' : kind === 'paquete' ? ' de 2,000 billetes' : '';
  return {
    amount,
    z,
    plinth: { minX: RULER_X - half.x, maxX: RULER_X + half.x, minZ: z - half.z, maxZ: z + half.z, height: PLINTH_HEIGHT },
    caption: n === 1 ? `Un ${one}${each}` : `${formatNumber(n)} ${many}${each}`,
  };
}

const rulerSizes = unitSizes(DEFAULT_BILL);
const rulerPlacements: Record<UnitKind, Placement[]> = { bloque: [], tarima: [], paquete: [], fajo: [], billete: [] };
export const RULER: RulerStep[] = RULER_AMOUNTS.map((amount, i) => rulerStep(amount, i, rulerSizes, rulerPlacements));

function ruler(): Exhibit {
  const counts = Object.fromEntries(UNIT_KINDS.map((k) => [k, rulerPlacements[k].length])) as Record<UnitKind, number>;
  const bills = UNIT_KINDS.reduce((sum, k) => sum + counts[k] * BILLS_PER[k], 0);
  const footprints = UNIT_KINDS.flatMap((k) => rulerPlacements[k].map((p) => footprintRect(p, rulerSizes[k])));
  const layout: Layout = {
    bills,
    amount: bills * DEFAULT_BILL.value,
    counts,
    sizes: rulerSizes,
    placements: rulerPlacements,
    table: null,
    references: [],
    bounds: footprints.reduce(union),
    floor: 0,
    height: rulerSizes.tarima.h,
  };
  return { layout, origin: { x: 0, z: 0 }, references: [] };
}

// ---------- Collision ----------

// Each wall is a slab along the edge of its space, thick enough that one frame of running can't
// tunnel through, with a gap for each portal. Each portal's passage gets a wall on either side.
function wallRects(spaces: Space[]): Rect[] {
  const T = WALL_THICKNESS;
  const rects: Rect[] = [];
  spaces.forEach((s, i) => {
    const { minX, maxX, minZ, maxZ } = s.area;
    const across = (z: number, gap: Portal | null) => {
      const [a, b] = [z - T / 2, z + T / 2];
      if (!gap) return rects.push({ minX: minX - T, maxX: maxX + T, minZ: a, maxZ: b });
      rects.push({ minX: minX - T, maxX: -gap.width / 2, minZ: a, maxZ: b });
      rects.push({ minX: gap.width / 2, maxX: maxX + T, minZ: a, maxZ: b });
    };
    across(maxZ, s.front);
    across(minZ, s.back);
    rects.push({ minX: minX - T / 2, maxX: minX + T / 2, minZ, maxZ });
    rects.push({ minX: maxX - T / 2, maxX: maxX + T / 2, minZ, maxZ });

    const next = spaces[i + 1];
    if (s.back && next) {
      const [a, b] = [next.area.maxZ, minZ];
      const w = s.back.width / 2;
      rects.push({ minX: -w - T, maxX: -w, minZ: a, maxZ: b }, { minX: w, maxX: w + T, minZ: a, maxZ: b });
    }
  });
  return rects;
}

// The space you're in: each one reaches halfway into the passages on either side.
export function spaceIndexAt(spaces: Space[], p: Point): number {
  const i = spaces.findIndex((s) => p.z >= s.area.minZ - PASSAGE / 2);
  return i === -1 ? spaces.length - 1 : i;
}
