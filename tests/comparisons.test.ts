import { describe, expect, it } from 'vitest';
import { compare } from '../src/money/comparisons';

const values = (amount: number) => compare(amount, amount / 500).map((c) => c.value);

describe('compare', () => {
  it('describes un millón', () => {
    expect(values(1_000_000)).toEqual(['8.7 años', '$0.01', '2 kg', '33.3 minutos']);
  });

  it('describes the 2026 federal budget', () => {
    expect(values(10_193_683_700_000)).toEqual([
      '88.6 millones de años',
      '$76,644',
      '20.4 mil toneladas',
      '646 años',
    ]);
  });
});
