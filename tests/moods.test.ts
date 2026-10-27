import { describe, expect, it } from 'vitest';
import { LAYERS, MOODS, mixFor } from '../src/audio/moods';
import { ROOMS } from '../src/museum/rooms';

const loudest = (amount: number) => {
  const mix = mixFor(amount);
  // The mood whose mix is closest to this one.
  const distance = (m: (typeof MOODS)[number]) => LAYERS.reduce((d, l) => d + (m.mix[l] - mix[l]) ** 2, 0);
  return MOODS.reduce((a, b) => (distance(b) < distance(a) ? b : a)).name;
};

describe('mixFor', () => {
  it('plays each mood on its own at its anchor amount', () => {
    for (const mood of MOODS) expect(mixFor(mood.at)).toEqual(mood.mix);
  });

  it('holds the first and last moods past either end', () => {
    expect(mixFor(500)).toEqual(MOODS[0].mix);
    expect(mixFor(0)).toEqual(MOODS[0].mix);
    expect(mixFor(1e15)).toEqual(MOODS[MOODS.length - 1].mix);
  });

  it('blends halfway, in orders of magnitude, between two moods', () => {
    const [a, b] = MOODS;
    const mid = mixFor(Math.sqrt(a.at * b.at));
    for (const layer of LAYERS) expect(mid[layer]).toBeCloseTo((a.mix[layer] + b.mix[layer]) / 2);
  });

  it('keeps every layer between 0 and 1', () => {
    for (let exp = 2; exp <= 15; exp += 0.25) {
      for (const level of Object.values(mixFor(10 ** exp))) {
        expect(level).toBeGreaterThanOrEqual(0);
        expect(level).toBeLessThanOrEqual(1);
      }
    }
  });

  it('walks the whole arc over the museum tour', () => {
    const moods = ROOMS.map((r) => loudest(r.monto));
    expect(moods[0]).toBe('Familiaridad');
    expect(moods).toContain('Curiosidad');
    expect(moods).toContain('Asombro');
    expect(moods[moods.length - 1]).toBe('Reflexión');
  });
});
