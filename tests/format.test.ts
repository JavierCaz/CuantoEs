import { describe, expect, it } from 'vitest';
import { alternateReading, amountInWords, countWithNoun, formatMXN, parseAmount, shortAmount } from '../src/i18n/format';

describe('amountInWords', () => {
  it.each([
    [500, '500'],
    [1_000, 'mil'],
    [50_000, '50 mil'],
    [1_000_000, 'un millón'],
    [2_500_000, '2.5 millones'],
    [1_000_000_000, 'mil millones'],
    [12_345_678_500, '12.3 mil millones'],
    [313_385_000_000, '313 mil millones'],
    [999_900_000_000, 'un billón'],
    [1_000_000_000_000, 'un billón'],
    [10_193_683_700_000, '10.2 billones'],
  ])('%d → %s', (n, words) => {
    expect(amountInWords(n)).toBe(words);
  });
});

describe('countWithNoun', () => {
  it('adds "de" after millón/billón words only', () => {
    expect(countWithNoun(88_600_000, 'años')).toBe('88.6 millones de años');
    expect(countWithNoun(3_000, 'años')).toBe('3 mil años');
    expect(countWithNoun(12, 'años')).toBe('12 años');
  });
});

describe('alternateReading', () => {
  it('explains billón vs billion', () => {
    expect(alternateReading(10_193_683_700_000)).toBe('= 10.2 millones de millones');
    expect(alternateReading(313_385_000_000)).toBe('en inglés: 313 billion');
    expect(alternateReading(5_000_000)).toBeNull();
  });
});

describe('shortAmount', () => {
  it.each([
    [1_000_000, '$1 millón'],
    [1_000_000_000, '$1 mil millones'],
    [1_000_000_000_000, '$1 billón'],
    [115_000, '$115 mil'],
    [74_535_000_000, '$74.5 mil millones'],
  ])('%d → %s', (n, text) => {
    expect(shortAmount(n)).toBe(text);
  });
});

describe('formatMXN', () => {
  it('uses es-MX grouping', () => {
    expect(formatMXN(10_193_683_700_000)).toBe('$10,193,683,700,000');
  });
});

describe('parseAmount', () => {
  it.each([
    ['1500000', 1_500_000],
    ['1,500,000', 1_500_000],
    ['$1,500,000 MXN', 1_500_000],
    ['2.5 mil millones', 2_500_000_000],
    ['2,5 mil millones', 2_500_000_000],
    ['300 millones', 300_000_000],
    ['300 mdp', 300_000_000],
    ['74 mil mdp', 74_000_000_000],
    ['313 mmdp', 313_000_000_000],
    ['10.2 billones', 10_200_000_000_000],
    ['10.2 millones de millones', 10_200_000_000_000],
    ['un millón', 1_000_000],
    ['UN BILLÓN de pesos', 1_000_000_000_000],
    ['mil millones', 1_000_000_000],
    ['500 mil', 500_000],
  ])('"%s" → %d', (text, value) => {
    expect(parseAmount(text)).toBe(value);
  });

  it.each(['', 'hola', '12 manzanas', '-5'])('rejects "%s"', (text) => {
    expect(parseAmount(text)).toBeNull();
  });
});
