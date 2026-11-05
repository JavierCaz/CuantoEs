import { describe, expect, it } from 'vitest';
import { GROUPED_ROOMS, GRUPOS, PRESETS, ROOMS, SALAS, TIPOS, comparisonsFor, grupoOf, ratioText, timeToEarn } from '../src/museum/collection';
import { REFERENCES, TEMPORAL_REFERENCES } from '../src/scene/references';

const byId = (id: string) => PRESETS.find((p) => p.id === id)!;

describe('the collection', () => {
  it('walks sala by sala, group by group, smallest to biggest within each group', () => {
    const salas = ROOMS.map((r) => SALAS.findIndex((s) => s.id === r.sala));
    expect(salas).toEqual([...salas].sort((a, b) => a - b));
    expect(ROOMS).toHaveLength(PRESETS.length);
    expect(GROUPED_ROOMS.flatMap((g) => g.rooms)).toEqual(ROOMS.map((_, i) => i));
    for (const { rooms } of GROUPED_ROOMS) {
      const amounts = rooms.map((i) => ROOMS[i].monto);
      expect(amounts).toEqual([...amounts].sort((a, b) => a - b));
    }
    for (const sala of SALAS) expect(GRUPOS.some((g) => g.sala === sala.id)).toBe(true);
  });

  it('puts every exhibit in exactly one group, in its own sala', () => {
    const ids = GRUPOS.flatMap((g) => [...g.presets]);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(PRESETS.map((p) => p.id).sort());
    expect(new Set(GRUPOS.map((g) => g.id)).size).toBe(GRUPOS.length);
    for (const p of PRESETS) expect(grupoOf(p).sala).toBe(p.sala);
    // Group ids name halls, preset ids name exhibits: the URL and the panel tell them apart.
    for (const g of GRUPOS) expect(PRESETS.map((p) => p.id)).not.toContain(g.id);
  });

  it.each(PRESETS.map((p) => [p.id, p] as const))('%s: says what kind of figure it is and where it comes from', (_, p) => {
    expect(new Set(PRESETS.map((q) => q.id)).size).toBe(PRESETS.length);
    expect(Object.keys(TIPOS)).toContain(p.tipo);
    expect(p.monto).toBeGreaterThanOrEqual(500);
    expect(p.pregunta).toMatch(/^¿.+\?$/);
    expect(p.alcance.length).toBeGreaterThan(20);
    expect(p.fuente.length).toBeGreaterThan(0);
    expect(p.fuente_url).toMatch(/^https:\/\//);
    if (p.consulta !== null) expect(p.consulta).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const id of p.compara) {
      expect(id).not.toBe(p.id);
      expect(PRESETS.map((q) => q.id)).toContain(id);
    }
    expect(p.referencias[0]).toBe('persona'); // every hall has someone for scale
  });

  it('only uses reference ids that exist', () => {
    const ids = [...PRESETS.flatMap((r) => r.referencias), ...TEMPORAL_REFERENCES];
    for (const id of ids) expect(REFERENCES).toHaveProperty(id);
  });

  it('keeps the derived figures consistent with the ones they come from', () => {
    const pef = byId('pef-2026').monto;
    expect(byId('dia-de-gobierno').monto).toBeCloseTo(pef / 365, -1);
    expect(byId('vida-salario-minimo').monto).toBeCloseTo(byId('salario-minimo-anual').monto * 40, 0);
    expect(byId('km-tren-interurbano').monto).toBeCloseTo(byId('tren-interurbano').monto / 57.7, -1);
  });
});

describe('comparisons', () => {
  it('reads ratios both ways', () => {
    const tren = byId('tren-maya');
    const aifa = byId('aifa');
    expect(ratioText(tren.monto, aifa)).toBe('6.7 veces el Aeropuerto Felipe Ángeles (AIFA)');
    expect(ratioText(aifa.monto, tren)).toBe('Cabe 6.7 veces en el Tren Maya');
    expect(ratioText(byId('refineria-olmeca').monto, byId('seguridad-2026'))).toMatch(/^Casi lo mismo que el presupuesto/);
  });

  it('rounds big ratios to whole numbers', () => {
    expect(ratioText(byId('fortuna-slim').monto, byId('vida-salario-minimo'))).toBe('480,397 veces una vida de trabajo con salario mínimo');
  });

  it('has something to compare in every hall', () => {
    for (const p of PRESETS) expect(comparisonsFor(p).length).toBeGreaterThan(0);
  });
});

describe('timeToEarn', () => {
  it('measures an amount in your own working time', () => {
    expect(timeToEarn(1_000_000, 10_000)).toBe('8.3 años');
    expect(timeToEarn(5_000, 10_000)).toBe('15 días');
    expect(timeToEarn(60_000, 10_000)).toBe('6 meses');
    expect(timeToEarn(10_193_683_700_000, 10_000)).toBe('84.9 millones de años');
  });
});
