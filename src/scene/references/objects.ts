import * as THREE from 'three';
import { Model, bar, cached, contactShadow, cylinder, rbox } from './kit';
import { centered, type ReferenceSpec } from './shared';

// Things you could carry money in, for the rooms where the money still fits on a table.
// All of them face +Z, toward the entrance.

// A handle: half a ring standing in the XY plane, its ends at y, `height` tall.
const loop = (width: number, height: number, thickness: number, y: number, z = 0) =>
  new THREE.TorusGeometry(width / 2, thickness, 6, 14, Math.PI).scale(1, height / (width / 2), 1).translate(0, y, z);

// ---------- Backpack ----------

const backpack = cached(() => {
  const BLUE = 0x2f6fb5;
  const POCKET = 0x285e9a;
  const STRAP = 0x1d2a3a;
  const m = new Model();
  m.add(rbox(0.3, 0.39, 0.15, 0.05, 0, 0.01, -0.01, 2), BLUE); // main compartment, soft and round
  m.add(rbox(0.3, 0.04, 0.152, 0.018, 0, 0.005, -0.01), STRAP); // reinforced base
  m.add(rbox(0.24, 0.17, 0.06, 0.03, 0, 0.05, 0.075, 2), POCKET); // front pocket
  // Zippers: an arch on the front of the main compartment, a line across the pocket, yellow pulls.
  m.add(loop(0.19, 0.145, 0.005, 0.2, 0.066), STRAP);
  m.add(rbox(0.2, 0.008, 0.008, 0.003, 0, 0.19, 0.103, 1), STRAP);
  m.add(rbox(0.016, 0.035, 0.008, 0.004, 0.06, 0.28, 0.071, 1), 0xf2c94c, 'satin');
  m.add(rbox(0.035, 0.016, 0.008, 0.004, 0.07, 0.175, 0.106, 1), 0xf2c94c, 'satin');
  m.add(loop(0.07, 0.03, 0.008, 0.38, -0.02), STRAP); // grab handle on top
  // Shoulder straps down the back: flat bands bowed out from the bag, as if worn.
  for (const x of [-0.085, 0.085]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x * 0.7, 0.37, -0.075),
      new THREE.Vector3(x, 0.31, -0.122),
      new THREE.Vector3(x * 1.1, 0.16, -0.125),
      new THREE.Vector3(x * 1.2, 0.05, -0.088),
    ]);
    // The band's cross-section: thickness along the curve's normal, width along its binormal (X).
    const band = new THREE.Shape([[-0.005, -0.024], [0.005, -0.024], [0.005, 0.024], [-0.005, 0.024]].map(([a, b]) => new THREE.Vector2(a, b)));
    m.add(new THREE.ExtrudeGeometry(band, { steps: 12, bevelEnabled: false, extrudePath: path }), STRAP);
  }
  const group = m.build();
  group.add(contactShadow(0.3, 0.2, 0.12, 0.45));
  return group;
});

export const mochila: ReferenceSpec = {
  footprint: { w: 0.32, d: 0.24, h: 0.42 },
  build: () => ({ object: backpack(), label: 'Mochila escolar · 42 cm', labelHeight: 0.42, solids: [centered(0.32, 0.24)] }),
};

// ---------- Briefcase ----------

const briefcase = cached(() => {
  const LEATHER = 0x4a2f1d;
  const BRASS = 0xc9a25e;
  const m = new Model();
  m.add(rbox(0.44, 0.32, 0.11, 0.016, 0, 0.012, 0, 2), LEATHER, 'satin'); // standing on its long edge
  m.add(rbox(0.446, 0.012, 0.116, 0.006, 0, 0.245, 0), BRASS, 'metal'); // metal frame at the lid's seam
  for (const x of [-0.13, 0.13]) {
    m.add(rbox(0.04, 0.034, 0.012, 0.004, x, 0.24, 0.058, 1), BRASS, 'metal'); // latches
    for (const z of [-0.035, 0.035]) m.add(rbox(0.022, 0.012, 0.022, 0.006, x * 1.35, 0, z, 1), BRASS, 'metal'); // feet
  }
  for (const x of [-0.065, 0.065]) m.add(rbox(0.022, 0.016, 0.03, 0.005, x, 0.33, 0, 1), BRASS, 'metal'); // handle mounts
  m.add(loop(0.13, 0.035, 0.01, 0.335), 0x2a1a10, 'satin'); // handle
  const group = m.build();
  group.add(contactShadow(0.42, 0.1, 0.1, 0.45));
  return group;
});

export const maletin: ReferenceSpec = {
  footprint: { w: 0.44, d: 0.12, h: 0.38 },
  build: () => ({ object: briefcase(), label: 'Maletín · 44 × 32 cm', labelHeight: 0.38, solids: [centered(0.44, 0.12)] }),
};

// ---------- Carry-on ----------

// A hard-shell carry-on, 55 × 35 × 23 cm, on four spinner wheels, with its telescopic handle pulled out.
const carryOn = cached(() => {
  const SHELL = 0x7a2e3b;
  const RIB = 0x6a2532;
  const DARK = 0x1f1f22;
  const m = new Model();
  m.add(rbox(0.35, 0.5, 0.23, 0.045, 0, 0.05, 0, 2), SHELL, 'gloss'); // shell, lifted by the wheels
  m.add(rbox(0.356, 0.506, 0.02, 0.045, 0, 0.047, 0, 2), DARK, 'satin'); // zipper all around the middle
  for (const z of [-0.116, 0.116]) {
    for (const x of [-0.1, 0, 0.1]) m.add(rbox(0.03, 0.42, 0.012, 0.006, x, 0.09, z, 1), RIB, 'gloss'); // raised ribs
  }
  for (const x of [-0.14, 0.14]) {
    for (const z of [-0.085, 0.085]) {
      m.add(rbox(0.05, 0.03, 0.05, 0.012, x, 0.032, z, 1), DARK, 'satin'); // wheel housing
      for (const dx of [-0.011, 0.011]) m.add(cylinder(0.024, 0.01, 'x', x + dx, 0.024, z, 12), DARK, 'satin'); // twin wheels
    }
  }
  // Telescopic handle out of the back of the top, and a carry handle on top.
  m.add(rbox(0.21, 0.02, 0.05, 0.008, 0, 0.545, -0.075, 1), DARK, 'satin');
  for (const x of [-0.08, 0.08]) m.add(cylinder(0.0075, 0.42, 'y', x, 0.75, -0.075, 8), 0xb9bdc2, 'metal');
  m.add(rbox(0.2, 0.034, 0.034, 0.015, 0, 0.945, -0.075), DARK, 'satin');
  m.add(loop(0.11, 0.035, 0.01, 0.55, 0.035), DARK, 'satin');
  const group = m.build();
  group.add(contactShadow(0.34, 0.22, 0.12, 0.45));
  return group;
});

export const maleta: ReferenceSpec = {
  footprint: { w: 0.36, d: 0.24, h: 1.0 },
  build: () => ({ object: carryOn(), label: 'Maleta de mano · 55 × 35 × 23 cm', labelHeight: 1.0, solids: [centered(0.36, 0.24)] }),
};

// ---------- Chair ----------

// A plain wooden chair. Turned stretchers brace the legs; the back legs rise past the seat and lean
// back to hold the backrest.
const chair = cached(() => {
  const WOOD = 0x80522f;
  const SEAT = 0x94643b;
  const m = new Model();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const leg = (from: THREE.Vector3, to: THREE.Vector3, r = 0.017) => m.add(bar(from, to, r, 10), WOOD, 'satin');
  for (const x of [-0.195, 0.195]) {
    leg(v(x, 0, 0.195), v(x, 0.44, 0.19), 0.018); // front legs
    leg(v(x, 0, -0.19), v(x, 0.45, -0.195)); // back legs, then leaning back above the seat
    leg(v(x, 0.45, -0.195), v(x, 0.9, -0.255));
    leg(v(x, 0.15, 0.19), v(x, 0.15, -0.19), 0.009); // side stretchers
    m.add(rbox(0.022, 0.06, 0.36, 0.006, x, 0.37, 0, 1), WOOD, 'satin'); // apron under the seat
  }
  leg(v(-0.195, 0.19, 0.19), v(0.195, 0.19, 0.19), 0.009); // front stretcher
  m.add(rbox(0.36, 0.06, 0.022, 0.006, 0, 0.37, 0.19, 1), WOOD, 'satin');
  m.add(rbox(0.36, 0.06, 0.022, 0.006, 0, 0.37, -0.19, 1), WOOD, 'satin');
  m.add(rbox(0.46, 0.036, 0.44, 0.014, 0, 0.43, 0.006), SEAT, 'satin'); // seat, its top 47 cm up
  // Backrest: a top rail and three slats, leaning with the back legs. Each is built around its own
  // center, tilted, then moved onto the line of the legs at its height.
  const lean = (w: number, h: number, d: number, r: number, x: number, bottom: number) => {
    const y = bottom + h / 2;
    return rbox(w, h, d, r, 0, -h / 2, 0, 1).rotateX(-0.133).translate(x, y, -0.195 - (y - 0.45) * 0.133);
  };
  m.add(lean(0.4, 0.085, 0.024, 0.01, 0, 0.78), WOOD, 'satin');
  for (const x of [-0.1, 0, 0.1]) m.add(lean(0.04, 0.29, 0.014, 0.006, x, 0.49), WOOD, 'satin');
  const group = m.build();
  group.add(contactShadow(0.42, 0.42, 0.14, 0.32));
  return group;
});

export const silla: ReferenceSpec = {
  footprint: { w: 0.46, d: 0.46, h: 0.9 },
  build: () => ({ object: chair(), label: 'Silla · asiento a 47 cm', labelHeight: 0.9, solids: [centered(0.46, 0.46)] }),
};
