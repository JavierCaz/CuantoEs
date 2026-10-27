import { countWithNoun, formatMXN, formatNumber } from '../i18n/format';

// CONASAMI, salario mínimo general vigente desde el 1 de enero de 2026.
export const SALARIO_MINIMO_DIARIO = 315.04;
// Proyección de población de CONAPO para México, redondeada.
export const POBLACION_MEXICO = 133_000_000;
// A Banxico banknote weighs roughly one gram.
const GRAMS_PER_BILL = 1;

export interface Comparison {
  label: string;
  value: string;
}

export function compare(amount: number, bills: number): Comparison[] {
  return [
    { label: 'Trabajando con salario mínimo', value: minimumWageTime(amount) },
    { label: 'Por cada habitante de México', value: formatMXN(amount / POBLACION_MEXICO) },
    { label: 'Peso de los billetes', value: weight(bills * GRAMS_PER_BILL) },
    { label: 'Contando un billete por segundo, sin parar', value: duration(bills) },
  ];
}

function minimumWageTime(amount: number): string {
  const days = amount / SALARIO_MINIMO_DIARIO;
  if (days < 365) return `${formatNumber(days, 1)} días`;
  return countWithNoun(days / 365, 'años');
}

function weight(grams: number): string {
  if (grams < 1_000) return `${formatNumber(grams)} g`;
  if (grams < 1_000_000) return `${formatNumber(grams / 1_000, 1)} kg`;
  return countWithNoun(grams / 1_000_000, 'toneladas');
}

function duration(seconds: number): string {
  if (seconds < 60) return `${formatNumber(seconds)} segundos`;
  if (seconds < 3_600) return `${formatNumber(seconds / 60, 1)} minutos`;
  if (seconds < 86_400) return `${formatNumber(seconds / 3_600, 1)} horas`;
  if (seconds < 31_557_600) return `${formatNumber(seconds / 86_400, 1)} días`;
  return countWithNoun(seconds / 31_557_600, 'años');
}
