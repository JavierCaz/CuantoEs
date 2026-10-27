import { describe, expect, it } from 'vitest';
import { DEFAULT_BILL } from '../src/money/denominations';
import { BILLS_PER, UNIT_KINDS, computeLayout, unitSizes, type Layout } from '../src/money/layout';
import { WALKWAY, footprintRect } from '../src/museum/referenceLayout';

const totalBills = (layout: Layout) =>
  UNIT_KINDS.reduce((sum, kind) => sum + layout.placements[kind].length * BILLS_PER[kind], 0);

describe('computeLayout', () => {
  it.each([
    0,
    500,
    1_000_000, // un millón
    12_345_678_500, // touches every unit below bloque
    500_000_000, // exactly one tarima
    291_000_000_000, // presupuesto CDMX-sized
    10_200_000_000_000, // PEF-sized
    50_000_000_000_000, // above the bloque threshold
  ])('represents %d MXN exactly', (amount) => {
    const layout = computeLayout(amount, DEFAULT_BILL);
    expect(layout.amount).toBe(amount);
    expect(totalBills(layout)).toBe(amount / 500);
    for (const kind of UNIT_KINDS) {
      expect(layout.placements[kind]).toHaveLength(layout.counts[kind]);
    }
  });

  it('rounds to the nearest whole bill', () => {
    expect(computeLayout(1_234, DEFAULT_BILL).amount).toBe(1_000);
    expect(computeLayout(1_250, DEFAULT_BILL).amount).toBe(1_500);
  });

  it('uses the biggest units first', () => {
    const { counts } = computeLayout(12_345_678_500, DEFAULT_BILL);
    expect(counts).toEqual({ bloque: 0, tarima: 24, paquete: 345, fajo: 13, billete: 57 });
  });

  it('only uses bloques for huge amounts', () => {
    expect(computeLayout(10_200_000_000_000, DEFAULT_BILL).counts.bloque).toBe(0);
    expect(computeLayout(50_000_000_000_000, DEFAULT_BILL).counts.bloque).toBe(50);
  });

  it('builds a $500 pallet from 8 × 15 stacks about 83 cm tall', () => {
    const { tarima } = unitSizes(DEFAULT_BILL);
    expect(tarima.h - 0.15).toBeCloseTo(1_000_000 / 120 * 0.0001, 6);
  });

  it('never overlaps two pallets on the same level', () => {
    const { placements, sizes } = computeLayout(3_000_000_000_000, DEFAULT_BILL);
    const seen = new Set<string>();
    for (const p of placements.tarima) {
      const key = `${Math.round(p.x / sizes.tarima.w)},${Math.round(p.y * 100)},${Math.round(p.z / sizes.tarima.d)}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('leaves the walkway clear and flows around the references, bloques too', () => {
    const references = [
      { w: 0.5, d: 0.5, h: 1.7 },
      { w: 30, d: 20, h: 3 },
      { w: 110, d: 75, h: 2.5 },
    ];
    const layout = computeLayout(50_250_000_000_000, DEFAULT_BILL, references); // 50 bloques and 500 tarimas
    const standing = layout.references.map((p, i) => footprintRect(p, references[i]));
    for (const kind of ['tarima', 'bloque'] as const) {
      expect(layout.placements[kind].length).toBeGreaterThan(0);
      for (const p of layout.placements[kind]) {
        const r = footprintRect(p, layout.sizes[kind]);
        expect(r.minX >= WALKWAY / 2 - 1e-9 || r.maxX <= -WALKWAY / 2 + 1e-9).toBe(true);
        for (const s of standing) {
          expect(r.minX < s.maxX && r.maxX > s.minX && r.minZ < s.maxZ && r.maxZ > s.minZ).toBe(false);
        }
      }
    }
  });

  it('keeps all content inside the reported bounds', () => {
    const layout = computeLayout(10_200_000_000_000, DEFAULT_BILL);
    for (const p of layout.placements.tarima) {
      expect(p.x).toBeGreaterThan(layout.bounds.minX);
      expect(p.x).toBeLessThan(layout.bounds.maxX);
      expect(p.z).toBeGreaterThan(layout.bounds.minZ);
      expect(p.z).toBeLessThan(layout.bounds.maxZ);
    }
  });
});
