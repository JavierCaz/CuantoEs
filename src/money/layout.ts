import type { Denomination } from './denominations';
import { WALKWAY, footprintRect, placeReferences, spacing, type Footprint, type Point } from '../museum/referenceLayout';

// Pure layout: turns an amount of money into physical units and where they sit, among the scale
// references. No Three.js here — just numbers in meters — so it's easy to test and reason about.

export type UnitKind = 'bloque' | 'tarima' | 'paquete' | 'fajo' | 'billete';
export const UNIT_KINDS: UnitKind[] = ['bloque', 'tarima', 'paquete', 'fajo', 'billete'];

export const BILLS_PER: Record<UnitKind, number> = {
  billete: 1,
  fajo: 100,
  paquete: 2_000,
  tarima: 1_000_000,
  bloque: 2_000_000_000, // 2,000 tarimas
};

// Above this many tarimas, group them into bloques to keep the instance count manageable.
const BLOQUE_THRESHOLD = 40_000;

export const PALLET_BASE = { w: 1.2, h: 0.15, d: 1.0 };
const PALLET_GAP = 0.05;
const ISLAND = { cols: 5, rows: 4 }; // pallets per island, touching, with aisles between islands
const AISLE = 2;
const BLOQUE_PALLETS = { cols: 10, rows: 10, levels: 20 };
const BLOQUE_AISLE = 4;
const ZONE_GAP = 4;
const TABLE_CLEARANCE = 1; // keeps pallets from boxing the table in
export const TABLE_HEIGHT = 0.75;
const TABLE_ITEM_GAP = 0.03;
const TABLE_PADDING = 0.15;
const PAQUETES_PER_ROW = 25;

export interface Size {
  w: number; // X
  h: number; // Y
  d: number; // Z
}

// Bottom-center of a unit: where it touches whatever it rests on.
export interface Placement {
  x: number;
  y: number;
  z: number;
}

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

// Smallest rectangle containing both.
export function union(a: Rect, b: Rect): Rect {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

export interface Layout {
  bills: number;
  amount: number; // bills × denomination; may differ from the input by rounding
  counts: Record<UnitKind, number>;
  sizes: Record<UnitKind, Size>;
  placements: Record<UnitKind, Placement[]>;
  table: (Rect & { height: number }) | null;
  references: Point[]; // centers of the scale references, in the order of the footprints given
  bounds: Rect; // footprint of all the money, table included
  floor: number; // m² the money covers, aisles between its pallets included
  height: number; // tallest point of the money
}

export function unitSizes(bill: Denomination): Record<UnitKind, Size> {
  const stacksX = Math.floor(PALLET_BASE.w / bill.length);
  const stacksZ = Math.floor(PALLET_BASE.d / bill.width);
  const palletMoneyH = (BILLS_PER.tarima / (stacksX * stacksZ)) * bill.thickness;
  const palletH = PALLET_BASE.h + palletMoneyH;
  return {
    billete: { w: bill.length, h: bill.thickness, d: bill.width },
    fajo: { w: bill.length, h: bill.thickness * BILLS_PER.fajo, d: bill.width },
    paquete: { w: bill.length, h: bill.thickness * BILLS_PER.paquete, d: bill.width },
    tarima: { w: PALLET_BASE.w, h: palletH, d: PALLET_BASE.d },
    bloque: {
      w: BLOQUE_PALLETS.cols * PALLET_BASE.w,
      h: BLOQUE_PALLETS.levels * palletH,
      d: BLOQUE_PALLETS.rows * PALLET_BASE.d,
    },
  };
}

export function countUnits(bills: number): Record<UnitKind, number> {
  let rest = bills;
  const take = (kind: UnitKind) => {
    const n = Math.floor(rest / BILLS_PER[kind]);
    rest -= n * BILLS_PER[kind];
    return n;
  };
  const counts = {} as Record<UnitKind, number>;
  if (bills >= BLOQUE_THRESHOLD * BILLS_PER.tarima) counts.bloque = take('bloque');
  else counts.bloque = 0;
  counts.tarima = take('tarima');
  counts.paquete = take('paquete');
  counts.fajo = take('fajo');
  counts.billete = take('billete');
  return counts;
}

// Everything lines a walkway down the middle (x = 0) that runs from the front (z = 0) toward -Z:
// the table and the scale references in the first row, then the money fills the floor around them,
// pallets first and bloques behind. You walk through the exhibit, not around it.
export function computeLayout(amount: number, bill: Denomination, references: Footprint[] = []): Layout {
  const bills = Math.max(0, Math.round(amount / bill.value));
  const counts = countUnits(bills);
  const sizes = unitSizes(bill);
  const placements: Record<UnitKind, Placement[]> = {
    bloque: [],
    tarima: [],
    paquete: [],
    fajo: [],
    billete: [],
  };

  const table = layoutTable(counts, sizes, placements);
  const refs = placeReferences(references, [WALKWAY / 2, table ? -table.minX : WALKWAY / 2]);
  // Floor that's already taken, with room to walk around each thing.
  const standing = [
    ...(table ? [grow(table, TABLE_CLEARANCE)] : []),
    ...references.map((f, i) => grow(footprintRect(refs[i], f), spacing(f))),
  ];

  let floor = table ? (table.maxX - table.minX) * (table.maxZ - table.minZ) : 0;
  const pallets = layoutPallets(counts.tarima, sizes.tarima, placements.tarima, standing);
  if (pallets) floor += pallets.floor;
  const bloques = layoutBloques(counts.bloque, sizes.bloque, placements.bloque, pallets?.zone ?? null, standing);
  floor += bloques;

  const { bounds, height } = measure(placements, sizes, table);
  return { bills, amount: bills * bill.value, counts, sizes, placements, table, references: refs, bounds, floor, height };
}

const grow = (r: Rect, by: number): Rect => ({ minX: r.minX - by, maxX: r.maxX + by, minZ: r.minZ - by, maxZ: r.maxZ + by });
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

// Centers of `count` cells laid out in rows going back from `front`, on both sides of the walkway:
// nearest the walkway first, alternating sides, so a short last row stays balanced. Cells that would
// land on something already standing are skipped, so the money flows around it. The grid is at
// least as wide as what's standing, so nothing sticks out beside an empty patch of floor, and wider
// still if that keeps the whole thing roughly square.
function gridAround(count: number, cell: { w: number; d: number }, gap: number, front: number, standing: Rect[]): Point[] {
  const pitchW = cell.w + gap;
  const pitchD = cell.d + gap;
  const inner = Math.max(WALKWAY, gap) / 2; // the walkway is never narrower than the aisles beside it
  const reach = Math.max(0, ...standing.map((r) => Math.max(r.maxX, -r.minX)));
  const area = count * pitchW * pitchD + standing.reduce((a, r) => a + (r.maxX - r.minX) * (r.maxZ - r.minZ), 0);
  const cols = Math.max(1, Math.round((Math.sqrt(area) / 2 - inner) / pitchW), Math.ceil((reach - inner) / pitchW));

  const cells: Point[] = [];
  for (let row = 0; cells.length < count; row++) {
    const z = front - row * pitchD - cell.d / 2;
    for (let col = 0; col < cols; col++) {
      for (const side of [1, -1]) {
        const x = side * (inner + col * pitchW + cell.w / 2);
        const rect = { minX: x - cell.w / 2, maxX: x + cell.w / 2, minZ: z - cell.d / 2, maxZ: z + cell.d / 2 };
        if (cells.length < count && !standing.some((r) => overlaps(rect, r))) cells.push({ x, z });
      }
    }
  }
  return cells;
}

function cellsRect(cells: Point[], cell: { w: number; d: number }): Rect {
  return cells.reduce((r, c) => union(r, footprintRect(c, cell)), footprintRect(cells[0], cell));
}

// The table stands at the head of the walkway, on its left, so the first reference on the right is
// the first thing you pass.
function layoutTable(
  counts: Record<UnitKind, number>,
  sizes: Record<UnitKind, Size>,
  out: Record<UnitKind, Placement[]>,
): Layout['table'] {
  const { paquete: nPaq, fajo: nFajo, billete: nBill } = counts;
  if (nPaq + nFajo + nBill === 0) return null;

  const cellW = sizes.paquete.w + TABLE_ITEM_GAP;
  const cellD = sizes.paquete.d + TABLE_ITEM_GAP;
  const paqCols = Math.min(nPaq, PAQUETES_PER_ROW);
  const paqRows = Math.ceil(nPaq / PAQUETES_PER_ROW);
  // Paquetes in a grid, then one stack of fajos, then one stack of loose bills.
  const columns = paqCols + (nFajo > 0 ? 1 : 0) + (nBill > 0 ? 1 : 0);
  const width = columns * cellW - TABLE_ITEM_GAP + TABLE_PADDING * 2;
  const depth = Math.max(paqRows, 1) * cellD - TABLE_ITEM_GAP + TABLE_PADDING * 2;

  const right = -WALKWAY / 2;
  const left = right - width + TABLE_PADDING + sizes.paquete.w / 2;
  const back = -TABLE_PADDING - sizes.paquete.d / 2;
  for (let i = 0; i < nPaq; i++) {
    const col = i % PAQUETES_PER_ROW;
    const row = Math.floor(i / PAQUETES_PER_ROW);
    out.paquete.push({ x: left + col * cellW, y: TABLE_HEIGHT, z: back - row * cellD });
  }
  let col = paqCols;
  if (nFajo > 0) {
    for (let i = 0; i < nFajo; i++) {
      out.fajo.push({ x: left + col * cellW, y: TABLE_HEIGHT + i * sizes.fajo.h, z: back });
    }
    col++;
  }
  for (let i = 0; i < nBill; i++) {
    out.billete.push({ x: left + col * cellW, y: TABLE_HEIGHT + i * sizes.billete.h, z: back });
  }

  return { minX: right - width, maxX: right, minZ: -depth, maxZ: 0, height: TABLE_HEIGHT };
}

// Pallets in islands, the islands in a grid around what's standing. Returns the zone they cover.
function layoutPallets(count: number, size: Size, out: Placement[], standing: Rect[]): { zone: Rect; floor: number } | null {
  if (count === 0) return null;
  const levels = count > 1_000 ? 2 : 1;
  const footprints = Math.ceil(count / levels);
  const perIsland = ISLAND.cols * ISLAND.rows;
  const islands = Math.ceil(footprints / perIsland);

  const slotW = size.w + PALLET_GAP;
  const slotD = size.d + PALLET_GAP;
  const island = {
    w: Math.min(footprints, ISLAND.cols) * slotW - PALLET_GAP,
    d: Math.min(Math.ceil(footprints / ISLAND.cols), ISLAND.rows) * slotD - PALLET_GAP,
  };
  const cells = gridAround(islands, island, AISLE, 0, standing);

  for (let i = 0; i < count; i++) {
    const slot = Math.floor(i / levels);
    const level = i % levels;
    const c = cells[Math.floor(slot / perIsland)];
    const s = slot % perIsland;
    out.push({
      x: c.x - island.w / 2 + (s % ISLAND.cols) * slotW + size.w / 2,
      y: level * size.h,
      z: c.z + island.d / 2 - Math.floor(s / ISLAND.cols) * slotD - size.d / 2,
    });
  }
  return { zone: cellsRect(cells, island), floor: cells.length * (island.w + AISLE) * (island.d + AISLE) };
}

// Bloques behind the pallets, as wide as everything in front of them. Returns the floor they cover.
function layoutBloques(count: number, size: Size, out: Placement[], pallets: Rect | null, standing: Rect[]): number {
  if (count === 0) return 0;
  const front = pallets ? pallets.minZ - ZONE_GAP : 0;
  const cells = gridAround(count, size, BLOQUE_AISLE, front, pallets ? [...standing, pallets] : standing);
  for (const c of cells) out.push({ x: c.x, y: 0, z: c.z });
  return count * (size.w + BLOQUE_AISLE) * (size.d + BLOQUE_AISLE);
}

function measure(
  placements: Record<UnitKind, Placement[]>,
  sizes: Record<UnitKind, Size>,
  table: Layout['table'],
): { bounds: Rect; height: number } {
  const bounds: Rect = table
    ? { minX: table.minX, maxX: table.maxX, minZ: table.minZ, maxZ: table.maxZ }
    : { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  let height = table ? table.height : 0;
  for (const kind of UNIT_KINDS) {
    const { w, h, d } = sizes[kind];
    for (const p of placements[kind]) {
      bounds.minX = Math.min(bounds.minX, p.x - w / 2);
      bounds.maxX = Math.max(bounds.maxX, p.x + w / 2);
      bounds.minZ = Math.min(bounds.minZ, p.z - d / 2);
      bounds.maxZ = Math.max(bounds.maxZ, p.z + d / 2);
      height = Math.max(height, p.y + h);
    }
  }
  if (bounds.minX === Infinity) return { bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 }, height: 0 };
  return { bounds, height };
}
