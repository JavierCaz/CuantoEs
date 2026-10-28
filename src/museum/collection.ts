import data from '../data/presets.json';
import { formatNumber } from '../i18n/format';

// The museum's collection: every exhibit, the themed sala it belongs to, and how to read its figure.

export const SALAS = [
  {
    id: 'tu-dinero',
    nombre: 'Tu dinero',
    escala: 'Escala personal',
    descripcion: 'Salarios, vivienda, alimentación e ingresos de los hogares.',
  },
  {
    id: 'tu-ciudad',
    nombre: 'Tu ciudad',
    escala: 'Escala local',
    descripcion: 'Presupuestos de ciudades, transporte e infraestructura.',
  },
  {
    id: 'tu-pais',
    nombre: 'Tu país',
    escala: 'Escala nacional',
    descripcion: 'Gasto federal, megaproyectos, elecciones, salud, educación y deuda.',
  },
  {
    id: 'las-diferencias',
    nombre: 'Las diferencias',
    escala: 'Escala social',
    descripcion: 'Distribución del ingreso, grandes fortunas y desigualdad.',
  },
] as const;

export type SalaId = (typeof SALAS)[number]['id'];
export type Sala = (typeof SALAS)[number];

// What kind of figure an exhibit shows: a budget that was approved isn't money that was spent,
// and an estimate isn't an official figure.
export const TIPOS = {
  aprobado: 'Presupuesto aprobado',
  oficial: 'Cifra oficial reportada',
  proyectado: 'Cifra proyectada',
  estimado: 'Estimación',
  estadistica: 'Dato estadístico',
  calculo: 'Cálculo del museo a partir de la fuente',
} as const;

export type Tipo = keyof typeof TIPOS;

export interface Preset {
  id: string;
  sala: SalaId;
  titulo: string;
  monto: number; // pesos corrientes (nominales) del año indicado
  año: number | null;
  tipo: Tipo;
  pregunta: string;
  descripcion: string;
  alcance: string; // what the figure includes and leaves out
  fuente: string;
  fuente_url: string;
  consulta: string | null; // when the source was last checked, YYYY-MM-DD
  compara: string[]; // ids of exhibits it's worth comparing against
  referencias: string[]; // scale objects shown in its room, smallest first (see scene/references)
}

export const PRESETS = data as Preset[];

export function salaOf(preset: Preset): Sala {
  return SALAS.find((s) => s.id === preset.sala)!;
}

// Walking order: sala by sala, from the personal to the social; within each, smallest to biggest,
// so every sala builds its own intuition before the next one.
export const ROOMS: Preset[] = SALAS.flatMap((sala) =>
  PRESETS.filter((p) => p.sala === sala.id).sort((a, b) => a.monto - b.monto),
);

export function roomIndex(id: string | null): number {
  return ROOMS.findIndex((r) => r.id === id);
}

// ---------- Comparisons ----------

// "6.7 veces el AIFA", "cabe 3.5 veces en la salud". Ratios are rounded to what a reader can hold
// in their head: two significant figures, whole numbers past a hundred.
export function ratioText(amount: number, other: Preset): string {
  const r = amount / other.monto;
  if (r > 0.9 && r < 1.1) return `Casi lo mismo que ${lower(other.titulo)}`;
  if (r >= 1) return `${times(r)} ${lower(other.titulo)}`;
  return `Cabe ${times(1 / r)} en ${lower(other.titulo)}`;
}

function times(r: number): string {
  const rounded = r < 100 ? Number(r.toPrecision(2)) : Math.round(r);
  return rounded === 1 ? 'una vez' : `${formatNumber(rounded, 1)} veces`;
}

// A title mid-sentence: "Presupuesto de salud 2026" → "el presupuesto de salud 2026",
// "Tren Maya" → "el Tren Maya". Names keep their capitals.
const ARTICLES: Record<string, string> = {
  Un: 'un',
  Una: 'una',
  La: 'la',
  Presupuesto: 'el presupuesto',
  Intereses: 'los intereses',
  Tren: 'el Tren',
  Aeropuerto: 'el Aeropuerto',
  Refinería: 'la Refinería',
};

function lower(title: string): string {
  const [first, ...rest] = title.split(' ');
  return [ARTICLES[first] ?? first, ...rest].join(' ');
}

export function comparisonsFor(preset: Preset): string[] {
  return preset.compara
    .map((id) => PRESETS.find((p) => p.id === id))
    .filter((p): p is Preset => p !== undefined)
    .map((p) => ratioText(preset.monto, p));
}

// ---------- Your own yardstick ----------

// How long someone earning `monthly` (gross) would take to gather `amount`, spending nothing.
export function timeToEarn(amount: number, monthly: number): string {
  const months = amount / monthly;
  if (months < 1) return `${formatNumber(months * 30, 0)} días`;
  if (months < 12) return `${formatNumber(months, 1)} meses`;
  const years = months / 12;
  if (years < 1_000) return `${formatNumber(years, years < 10 ? 1 : 0)} años`;
  if (years < 1_000_000) return `${formatNumber(years / 1_000, 1)} mil años`;
  return `${formatNumber(years / 1_000_000, 1)} millones de años`;
}
