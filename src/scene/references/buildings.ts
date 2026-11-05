import { Model, box, cached, contactShadow, cylinder, lathe, rbox } from './kit';
import { centered, type ReferenceSpec } from './shared';

const W = 8;
const D = 6;
const H = 2.6;
const ROOF = H + 0.15; // top of the slab
const TANK = { x: -2.7, z: -1.5, base: 0.25, height: 1.3 }; // the tinaco on its concrete base
const TOP = ROOF + TANK.base + TANK.height;

const WALL = 0xeaa97e;
const BASE = 0xb5644a;
const CONCRETE = 0xcfc9bd;
const TRIM = 0xf2efe8; // aluminum window frames, painted white
const IRON = 0x1f1f1f;
const DOOR = 0x2e5e57;
const GLASS = 0x3b5263;

// A one-story social-interest house as built all over Mexico, front door facing +Z (toward the
// entrance): painted block walls on a darker base, a flat concrete roof with a low parapet, a black
// water tank (tinaco) and a gas tank on the roof, iron bars on the windows.
const house = cached(() => {
  const m = new Model();
  const front = D / 2;
  m.add(box(W, H, D), WALL, 'satin');
  m.add(box(W + 0.02, 0.4, D + 0.02), BASE, 'satin'); // a darker band where the walls meet the street
  m.add(box(W + 0.3, 0.15, D + 0.3, 0, H), CONCRETE); // losa: the flat concrete roof
  // Pretil: a low parapet around the roof's edge, capped in concrete.
  const [pw, pd, t] = [W + 0.3, D + 0.3, 0.12];
  for (const s of [-1, 1]) {
    m.add(box(pw, 0.3, t, 0, ROOF, s * (pd - t) / 2), WALL, 'satin');
    m.add(box(t, 0.3, pd - t * 2, s * (pw - t) / 2, ROOF, 0), WALL, 'satin');
    m.add(box(pw + 0.04, 0.04, t + 0.04, 0, ROOF + 0.3, s * (pd - t) / 2), CONCRETE);
    m.add(box(t + 0.04, 0.04, pd - t * 2, s * (pw - t) / 2, ROOF + 0.3, 0), CONCRETE);
  }

  // The tinaco: a ribbed black tank, 1.1 m across, its lid on top.
  const k = TANK.height / 1.45;
  const tank: [number, number][] = [
    [0, 0], [0.5, 0], [0.55, 0.05], [0.55, 0.25], [0.53, 0.3], [0.55, 0.35], [0.55, 0.6], [0.53, 0.65],
    [0.55, 0.7], [0.55, 0.95], [0.53, 1.0], [0.55, 1.05], [0.55, 1.2], [0.45, 1.32], [0.27, 1.37], [0.27, 1.45], [0, 1.45],
  ];
  m.add(rbox(1.3, TANK.base, 1.3, 0.03, TANK.x, ROOF, TANK.z, 1), CONCRETE);
  m.add(lathe(tank.map(([r, y]) => [r, y * k]), 28).translate(TANK.x, ROOF + TANK.base, TANK.z), 0x1d1d1f, 'satin');
  // A stationary gas tank lying on two legs, with its valve on top.
  m.add(cylinder(0.32, 1.1, 'x', 2.4, ROOF + 0.55, -1.8, 20), 0xf0eeea, 'satin');
  for (const s of [-1, 1]) {
    m.add(lathe([[0.32, 0], [0.3, 0.1], [0.2, 0.2], [0, 0.24]], 20).rotateZ(-s * Math.PI / 2).translate(2.4 + s * 0.55, ROOF + 0.55, -1.8), 0xf0eeea, 'satin');
    m.add(box(0.08, 0.3, 0.5, 2.4 + s * 0.4, ROOF, -1.8), 0x8a8a86);
  }
  m.add(cylinder(0.05, 0.12, 'y', 2.4, ROOF + 0.9, -1.8, 10), 0xc9a25e, 'metal');

  // Front door: a steel door with raised panels, in a white frame, over a concrete step.
  m.add(box(1.15, 2.22, 0.05, -1.5, 0, front + 0.005), TRIM, 'satin');
  m.add(rbox(0.95, 2.08, 0.05, 0.01, -1.5, 0.02, front + 0.03, 1), DOOR, 'gloss');
  for (const y of [0.22, 1.18]) for (const dx of [-0.22, 0.22]) m.add(rbox(0.36, 0.78, 0.03, 0.01, -1.5 + dx, y, front + 0.06, 1), 0x346a62, 'gloss');
  m.add(rbox(0.035, 0.12, 0.05, 0.01, -1.15, 0.98, front + 0.08, 1), 0xc9a25e, 'metal');
  m.add(box(1.3, 0.12, 0.15, -1.5, 0, front + 0.075), CONCRETE);
  m.add(rbox(0.12, 0.16, 0.08, 0.02, -0.72, 2.0, front + 0.04, 1), IRON, 'satin'); // porch lamp
  m.add(cylinder(0.05, 0.08, 'y', -0.72, 1.98, front + 0.08, 10), 0xffe6a8, 'lamp');

  // Front window: a sliding aluminum window behind iron bars (herrería).
  const wx = 1.8;
  m.add(box(1.5, 1.2, 0.06, wx, 0.95, front), TRIM, 'satin');
  m.add(box(1.36, 1.06, 0.02, wx, 1.02, front + 0.032), GLASS, 'glass');
  m.add(box(0.04, 1.06, 0.03, wx, 1.02, front + 0.045), TRIM, 'satin');
  m.add(box(1.62, 0.06, 0.12, wx, 0.89, front + 0.03), CONCRETE); // sill
  for (let i = 0; i < 12; i++) m.add(box(0.018, 1.14, 0.018, wx - 0.66 + i * 0.12, 0.98, front + 0.12), IRON, 'satin');
  for (const y of [1.0, 1.55, 2.08]) m.add(box(1.42, 0.03, 0.012, wx, y, front + 0.12), IRON, 'satin');
  // Small barred windows on the sides.
  for (const s of [-1, 1]) {
    const x = s * W / 2;
    m.add(box(0.06, 0.7, 0.8, x, 1.4, -0.8), TRIM, 'satin');
    m.add(box(0.02, 0.58, 0.68, x + s * 0.032, 1.46, -0.8), GLASS, 'glass');
    for (let i = 0; i < 6; i++) m.add(box(0.018, 0.72, 0.018, x + s * 0.11, 1.39, -1.1 + i * 0.12), IRON, 'satin');
  }

  // A rainwater downspout from the roof, and the electricity meter in its box by the door.
  m.add(cylinder(0.045, 2.8, 'y', 3.86, 1.4, front + 0.07, 10), 0x8f9195, 'satin');
  m.add(cylinder(0.045, 0.28, 'z', 3.86, 2.7, front - 0.05, 10), 0x8f9195, 'satin');
  m.add(rbox(0.32, 0.42, 0.14, 0.02, 3.1, 1.35, front + 0.07, 1), 0xb7b8b3, 'satin');
  m.add(box(0.16, 0.14, 0.02, 3.1, 1.55, front + 0.145), GLASS, 'glass');
  m.add(cylinder(0.022, 0.95, 'y', 3.1, 2.25, front + 0.04, 8), 0x8f9195, 'satin');

  const group = m.build();
  group.add(contactShadow(W, D, 0.9, 0.45));
  return group;
});

export const casa: ReferenceSpec = {
  footprint: { w: W + 0.3, d: D + 0.3, h: TOP },
  build: () => ({ object: house(), label: 'Casa de interés social · 48 m²', labelHeight: TOP, solids: [centered(W + 0.3, D + 0.3)] }),
};
