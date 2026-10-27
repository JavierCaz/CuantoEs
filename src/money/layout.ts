import type { Denomination } from './denominations';

// Pure layout: turns an amount of money into physical units and where they sit.
// No Three.js here — just numbers in meters — so it's easy to test and reason about.

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
  bounds: Rect; // footprint of all content
  height: number; // tallest point of the content
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

export function computeLayout(amount: number, bill: Denomination): Layout {
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

  // Zones go from the front (z = 0, near the entrance) toward -Z:
  // table with small units → tarimas → bloques.
  let front = 0;
  const table = layoutTable(counts, sizes, placements, front);
  if (table) front = table.minZ - ZONE_GAP;

  const palletDepth = layoutPallets(counts.tarima, sizes.tarima, placements.tarima, front);
  if (palletDepth > 0) front -= palletDepth + ZONE_GAP;

  layoutBloques(counts.bloque, sizes.bloque, placements.bloque, front);

  const { bounds, height } = measure(placements, sizes, table);
  return { bills, amount: bills * bill.value, counts, sizes, placements, table, bounds, height };
}

function layoutTable(
  counts: Record<UnitKind, number>,
  sizes: Record<UnitKind, Size>,
  out: Record<UnitKind, Placement[]>,
  front: number,
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

  const left = -width / 2 + TABLE_PADDING + sizes.paquete.w / 2;
  const back = front - TABLE_PADDING - sizes.paquete.d / 2;
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

  return { minX: -width / 2, maxX: width / 2, minZ: front - depth, maxZ: front, height: TABLE_HEIGHT };
}

// Returns the depth (along Z) used by the pallet zone.
function layoutPallets(count: number, size: Size, out: Placement[], front: number): number {
  if (count === 0) return 0;
  const levels = count > 1_000 ? 2 : 1;
  const footprints = Math.ceil(count / levels);
  const perIsland = ISLAND.cols * ISLAND.rows;
  const islands = Math.ceil(footprints / perIsland);

  const slotW = size.w + PALLET_GAP;
  const slotD = size.d + PALLET_GAP;
  const islandW = Math.min(footprints, ISLAND.cols) * slotW - PALLET_GAP;
  const islandD = Math.min(Math.ceil(footprints / ISLAND.cols), ISLAND.rows) * slotD - PALLET_GAP;
  // Pick a column count that makes the whole zone roughly square.
  const islandCols = Math.max(1, Math.ceil(Math.sqrt((islands * (islandD + AISLE)) / (islandW + AISLE))));
  const islandRows = Math.ceil(islands / islandCols);
  const zoneW = Math.min(islands, islandCols) * (islandW + AISLE) - AISLE;
  const zoneD = islandRows * (islandD + AISLE) - AISLE;

  for (let i = 0; i < count; i++) {
    const slot = Math.floor(i / levels);
    const level = i % levels;
    const island = Math.floor(slot / perIsland);
    const s = slot % perIsland;
    const x =
      -zoneW / 2 + (island % islandCols) * (islandW + AISLE) + (s % ISLAND.cols) * slotW + size.w / 2;
    const z =
      front - Math.floor(island / islandCols) * (islandD + AISLE) - Math.floor(s / ISLAND.cols) * slotD - size.d / 2;
    out.push({ x, y: level * size.h, z });
  }
  return zoneD;
}

function layoutBloques(count: number, size: Size, out: Placement[], front: number) {
  if (count === 0) return;
  const cols = Math.max(1, Math.ceil(Math.sqrt((count * (size.d + BLOQUE_AISLE)) / (size.w + BLOQUE_AISLE))));
  const zoneW = Math.min(count, cols) * (size.w + BLOQUE_AISLE) - BLOQUE_AISLE;
  for (let i = 0; i < count; i++) {
    out.push({
      x: -zoneW / 2 + (i % cols) * (size.w + BLOQUE_AISLE) + size.w / 2,
      y: 0,
      z: front - Math.floor(i / cols) * (size.d + BLOQUE_AISLE) - size.d / 2,
    });
  }
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
