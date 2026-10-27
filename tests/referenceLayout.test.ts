import { describe, expect, it } from 'vitest';
import { WALKWAY, footprintRect, placeReferences } from '../src/museum/referenceLayout';
import { ROOMS } from '../src/museum/rooms';
import { REFERENCES, TEMPORAL_REFERENCES, type ReferenceId } from '../src/scene/references';

const sets: [string, ReferenceId[]][] = [
  ...ROOMS.map((r) => [r.id, r.referencias as ReferenceId[]] as [string, ReferenceId[]]),
  ['sala temporal', TEMPORAL_REFERENCES],
];

describe('placeReferences', () => {
  it.each(sets)('%s: references stand apart, beside the walkway, in the front row', (_, ids) => {
    const footprints = ids.map((id) => REFERENCES[id].footprint);
    const rects = placeReferences(footprints).map((p, i) => footprintRect(p, footprints[i]));
    rects.forEach((r, i) => {
      expect(r.maxZ).toBeCloseTo(0); // the exhibit's front edge is at z = 0
      expect(r.minX >= WALKWAY / 2 || r.maxX <= -WALKWAY / 2).toBe(true);
      for (const other of rects.slice(i + 1)) {
        const overlap = r.minX < other.maxX && r.maxX > other.minX && r.minZ < other.maxZ && r.maxZ > other.minZ;
        expect(overlap).toBe(false);
      }
    });
  });

  it('puts the first reference on the right and the next on the left', () => {
    const [a, b] = placeReferences([
      { w: 1, d: 1, h: 1 },
      { w: 1, d: 1, h: 1 },
    ]);
    expect(a.x).toBeGreaterThan(0);
    expect(b.x).toBeLessThan(0);
  });

  it('starts a row past whatever is already on that side', () => {
    const [a, b] = placeReferences(
      [
        { w: 1, d: 1, h: 1 },
        { w: 1, d: 1, h: 1 },
      ],
      [WALKWAY / 2, 6],
    );
    expect(a.x - 0.5).toBe(WALKWAY / 2); // nothing on the right yet: right against the walkway
    expect(b.x + 0.5).toBeLessThan(-6); // the table is on the left: a step past it
  });

  it('gives each room its own references, apart from the person who stands in every one', () => {
    const shown = ROOMS.flatMap((r) => r.referencias).filter((id) => id !== 'persona');
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('grows the references with the amount', () => {
    const biggest = (ids: string[]) =>
      Math.max(...ids.map((id) => REFERENCES[id as ReferenceId].footprint).map((f) => f.w * f.d));
    const sizes = ROOMS.map((r) => biggest(r.referencias));
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });
});
