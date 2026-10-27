// The soundtrack as layers: every room plays the same piece, and the amount decides how loud
// each layer is. Four moods follow the tour, from an everyday amount to one no one can picture:
//
//   Familiaridad  warm ambient: soft piano and nylon guitar, something close and everyday
//   Curiosidad    electronic textures: a light pulse comes in, and more layers with it
//   Asombro       expansive ambient: wide chords and sustained sounds that carry the sense of scale
//   Reflexión     minimalism: the music thins out and leaves room to look at the figures

export const LAYERS = ['piano', 'guitar', 'pulse', 'texture', 'pad', 'drone', 'bell'] as const;
export type Layer = (typeof LAYERS)[number];
export type Mix = Record<Layer, number>; // gain per layer, 0..1

export interface Mood {
  name: string;
  at: number; // the amount where this mood plays on its own; in between, the two nearest blend
  mix: Mix;
}

// Anchored on the museum's own rooms, an order of magnitude or more apart, so the tour walks
// the whole arc: a year of minimum wage feels familiar, a million sparks curiosity, the big
// public works bring awe, and the federal budget is left to reflection.
export const MOODS: Mood[] = [
  {
    name: 'Familiaridad',
    at: 1e5,
    mix: { piano: 0.7, guitar: 0.8, pulse: 0, texture: 0, pad: 0.15, drone: 0, bell: 0 },
  },
  {
    name: 'Curiosidad',
    at: 1e6,
    mix: { piano: 0.45, guitar: 0.4, pulse: 0.55, texture: 0.5, pad: 0.35, drone: 0, bell: 0 },
  },
  {
    name: 'Asombro',
    at: 3e10,
    mix: { piano: 0.2, guitar: 0, pulse: 0.12, texture: 0.35, pad: 0.9, drone: 0.7, bell: 0.2 },
  },
  {
    name: 'Reflexión',
    at: 1e13,
    mix: { piano: 0, guitar: 0, pulse: 0, texture: 0, pad: 0.3, drone: 0.2, bell: 0.7 },
  },
];

// The mix for an amount: a blend of the two moods around it, measured in orders of magnitude
// (so $10 millones sits between un millón and $30 mil millones by how many zeros it has).
export function mixFor(amount: number): Mix {
  const x = Math.log10(Math.max(amount, 1));
  const i = MOODS.findIndex((m) => Math.log10(m.at) > x);
  if (i === 0) return { ...MOODS[0].mix };
  if (i === -1) return { ...MOODS[MOODS.length - 1].mix };
  const [a, b] = [MOODS[i - 1], MOODS[i]];
  const t = (x - Math.log10(a.at)) / (Math.log10(b.at) - Math.log10(a.at));
  const mix = {} as Mix;
  for (const layer of LAYERS) mix[layer] = a.mix[layer] + (b.mix[layer] - a.mix[layer]) * t;
  return mix;
}
