// Spanish (Mexico) number wording. Remember: in Spanish a "billón" is 10^12
// (a million millions), while the English "billion" (10^9) is "mil millones".

const SCALES = [
  { value: 1e12, one: 'un billón', many: 'billones' },
  { value: 1e9, one: 'mil millones', many: 'mil millones' },
  { value: 1e6, one: 'un millón', many: 'millones' },
  { value: 1e3, one: 'mil', many: 'mil' },
];

const round3 = (n: number) => Number(n.toPrecision(3));

export function formatNumber(n: number, maxDecimals = 0): string {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: maxDecimals }).format(n);
}

export function formatMXN(n: number): string {
  return `$${formatNumber(n, n < 10 ? 2 : 0)}`;
}

// 12_345_678_500 → "12.3 mil millones"; 1e12 → "un billón"
export function amountInWords(n: number): string {
  for (const scale of SCALES) {
    const q = round3(n / scale.value);
    if (q < 1) continue;
    if (q >= 1000 && scale.value < 1e12) continue; // 999.9 mil millones rounds up to un billón
    return q === 1 ? scale.one : `${formatNumber(q, 2)} ${scale.many}`;
  }
  return formatNumber(round3(n), 2);
}

// Headline style with a peso sign: "$1 millón", "$1 mil millones", "$74.5 mil millones"
export function shortAmount(n: number): string {
  return `$${amountInWords(n).replace(/^un /, '1 ').replace(/^mil/, '1 mil')}`;
}

// "88.6 millones de años", "3 mil años", "un millón de casas"
export function countWithNoun(n: number, noun: string): string {
  const words = amountInWords(n);
  return /(millón|millones|billón|billones)$/.test(words) ? `${words} de ${noun}` : `${words} ${noun}`;
}

// The other ways to read the same number, to make the billón/billion difference explicit.
export function alternateReading(n: number): string | null {
  if (n >= 1e12) return `= ${formatNumber(round3(n / 1e12), 2)} millones de millones`;
  if (n >= 1e9) return `en inglés: ${formatNumber(round3(n / 1e9), 2)} billion`;
  return null;
}

const MULTIPLIERS: [RegExp, number][] = [
  [/^(mil billones)$/, 1e15],
  [/^(billon|billones|millones de millones|bdp)$/, 1e12],
  [/^(mil millones|miles de millones|mmdp|mil mdp)$/, 1e9],
  [/^(millon|millones|mdp|mm)$/, 1e6],
  [/^(mil|k)$/, 1e3],
  [/^$/, 1],
];

// Understands "2.5 mil millones", "300 mdp", "1,500,000", "$10.2 billones", "un millón".
export function parseAmount(text: string): number | null {
  const s = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip accents: millón → millon
    .replace(/\$|mxn|\bde pesos\b|\bpesos?\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const match = s.match(/^([\d.,]+)?\s*(.*)$/);
  if (!match) return null;
  const [, digits, rawWords] = match;
  let words = rawWords.trim();

  let base = 1;
  if (digits) {
    // "1,500,000" uses commas as thousands separators; "2,5" uses a decimal comma.
    const normalized = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(digits)
      ? digits.replace(/,/g, '')
      : digits.replace(',', '.');
    base = Number(normalized);
  } else {
    words = words.replace(/^un /, '');
    if (!words) return null;
  }

  const multiplier = MULTIPLIERS.find(([re]) => re.test(words))?.[1];
  if (multiplier === undefined || !Number.isFinite(base) || base < 0) return null;
  return Math.round(base * multiplier);
}
