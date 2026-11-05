import * as THREE from 'three';
import { Model, bar, box, cached, contactShadow, cylinder, extrude, panel, rbox, tire, wheel, type WheelStyle } from './kit';
import { centered, type ReferenceSpec } from './shared';

// Vehicles lie along X with the front toward +X, so you see their full length from the entrance.
// A body is its side profile extruded across its width, with the wheel arches cut out of it;
// windows, lights and trim are laid on top.

const GLASS = 0x1c2630;
const TRIM = 0x26282c; // black plastic and rubber: bumpers, grilles, mirrors, seals
const HEADLIGHT = 0xfff4dc;
const TAILLIGHT = 0xd4202c;
const AMBER = 0xffa431;
const PLATE = 0xf2f0ea;
const CHROME = 0xd9dce0;
const STEEL_WHEEL: WheelStyle = { spokes: 0, rim: 0xc9ccd1, face: 0x55595f, rimRatio: 0.6 };

// The bottom edge of a side profile, drawn from the back toward the front, with an arch over each axle.
function sill(shape: THREE.Shape, y: number, axles: number[], wheelY: number, archRadius: number, toX: number) {
  for (const x of [...axles].sort((a, b) => a - b)) {
    const a = Math.asin((wheelY - y) / archRadius); // where the arch meets the sill
    shape.lineTo(x - archRadius * Math.cos(a), y);
    shape.absarc(x, wheelY, archRadius, Math.PI + a, -a, true); // over the top of the wheel
  }
  shape.lineTo(toX, y);
}

// A flat piece laid on the side of a body, `along` the length at height y: windows, stripes,
// doors. It spans the whole width plus a hair, so one box shows on both sides.
const sides = (along: number, height: number, width: number, x: number, y: number, r = 0) =>
  r > 0 ? rbox(along, height, width, r, x, y, 0, 1) : box(along, height, width, x, y, 0);

// ---------- Compact car ----------

const car = cached(() => {
  const W = 1.75;
  const CABIN = W - 0.2; // the cabin is narrower than the body
  const PAINT = 0xa81d25;
  const R = 0.31;
  const axles = [-1.28, 1.32];
  const m = new Model();

  const body = new THREE.Shape();
  body.moveTo(2.07, 0.2);
  body.lineTo(2.15, 0.34); // bumper
  body.lineTo(2.15, 0.55);
  body.quadraticCurveTo(2.14, 0.72, 1.96, 0.78); // the nose rounds up into the hood
  body.lineTo(0.8, 0.92); // hood, rising to the base of the windshield
  body.lineTo(-1.45, 0.95); // waistline
  body.lineTo(-1.98, 0.97); // trunk lid
  body.quadraticCurveTo(-2.15, 0.97, -2.16, 0.8);
  body.lineTo(-2.17, 0.36);
  body.lineTo(-2.09, 0.2);
  sill(body, 0.2, axles, R, 0.38, 2.07);
  m.add(extrude(body, W, 0.08), PAINT, 'gloss');

  const cabin = new THREE.Shape();
  cabin.moveTo(0.95, 0.86);
  cabin.lineTo(0.82, 0.92);
  cabin.lineTo(0, 1.41); // windshield
  cabin.quadraticCurveTo(-0.45, 1.5, -0.95, 1.43); // roof
  cabin.lineTo(-1.52, 0.97); // rear window
  cabin.lineTo(-1.62, 0.86);
  m.add(extrude(cabin, CABIN, 0.1), PAINT, 'gloss');

  // Glass: windshield and rear window on the cabin's slopes, side windows on its flanks. The cabin's
  // rounded edges stay painted around them, as pillars.
  m.add(panel(0.82, 0.92, 0, 1.41, CABIN - 0.24, 0.012, 0.002, 0.04), GLASS, 'glass');
  m.add(panel(-0.95, 1.43, -1.52, 0.97, CABIN - 0.24, 0.012, 0.002, 0.05), GLASS, 'glass');
  const windows: [number, number][][] = [
    [[0.46, 0.99], [-0.1, 1.3], [-0.42, 1.33], [-0.42, 0.99]],
    [[-0.52, 0.99], [-0.52, 1.33], [-0.93, 1.3], [-1.3, 0.99]],
  ];
  for (const window of windows) {
    for (const s of [-1, 1]) m.add(extrude(window, 0.012).translate(0, 0, s * (CABIN / 2 + 0.004)), GLASS, 'glass');
  }

  // Nose: grille, air intake, headlights on the rounded corners, the plate in the middle.
  m.add(rbox(0.03, 0.1, 0.66, 0.02, 2.155, 0.45, 0), TRIM, 'satin');
  m.add(rbox(0.04, 0.08, 1.1, 0.02, 2.11, 0.22, 0), TRIM, 'satin');
  m.add(rbox(0.02, 0.11, 0.32, 0.006, 2.16, 0.33, 0, 1), PLATE, 'satin');
  for (const s of [-1, 1]) m.add(panel(2.122, 0.656, 2.039, 0.743, 0.38, 0.03, -0.012).translate(0, 0, s * 0.54), HEADLIGHT, 'lamp');
  // Tail: lights at the corners, the plate, a black lower bumper.
  for (const s of [-1, 1]) m.add(rbox(0.04, 0.13, 0.42, 0.015, -2.165, 0.7, s * 0.56), TAILLIGHT, 'lamp');
  m.add(rbox(0.02, 0.11, 0.32, 0.006, -2.175, 0.45, 0, 1), PLATE, 'satin');
  m.add(rbox(0.05, 0.08, 1.2, 0.02, -2.11, 0.22, 0), TRIM, 'satin');

  // Flanks: a black sill between the wheels, door handles, mirrors on stalks.
  m.add(box(1.84, 0.1, W + 0.01, 0.02, 0.2, 0), TRIM, 'satin');
  m.add(box(4.0, 0.12, W - 0.3, 0, 0.14, 0), TRIM); // underbody: no daylight under the car
  for (const s of [-1, 1]) {
    for (const x of [0.12, -0.85]) m.add(rbox(0.12, 0.024, 0.02, 0.008, x, 0.78, s * (W / 2), 1), TRIM, 'satin');
    m.add(rbox(0.06, 0.04, 0.12, 0.01, 0.66, 0.91, s * 0.8, 1), TRIM, 'satin');
    m.add(rbox(0.1, 0.085, 0.15, 0.03, 0.64, 0.94, s * 0.9), PAINT, 'gloss');
  }
  for (const x of axles) for (const s of [-1, 1] as const) wheel(m, x, R, s * (W / 2 - 0.11), R, 0.21, s);

  const group = m.build();
  group.add(contactShadow(4.1, 1.6, 0.5, 0.55));
  return group;
});

export const auto: ReferenceSpec = {
  footprint: { w: 4.3, d: 1.75, h: 1.55 },
  build: () => ({ object: car(), label: 'Auto compacto · 4.3 m', labelHeight: 1.55, solids: [centered(4.3, 1.75)] }),
};

// ---------- City bus ----------

// A 12 m low-floor city bus: white, with a green band, a destination sign and doors on the curb side (+Z).
const bus = cached(() => {
  const W = 2.55;
  const WHITE = 0xf1efe9;
  const GREEN = 0x2e8a5c;
  const R = 0.5;
  const axles = [-2.75, 3.5];
  const m = new Model();

  const body = new THREE.Shape();
  body.moveTo(5.93, 0.3);
  body.lineTo(6.0, 0.42);
  body.lineTo(6.0, 1.05);
  body.lineTo(5.94, 2.7); // the windshield leans back a little
  body.quadraticCurveTo(5.92, 2.97, 5.62, 2.98);
  body.lineTo(-5.72, 2.98);
  body.quadraticCurveTo(-5.99, 2.97, -6.0, 2.72);
  body.lineTo(-6.0, 0.42);
  body.lineTo(-5.93, 0.3);
  sill(body, 0.3, axles, R, 0.6, 5.93);
  m.add(extrude(body, W, 0.12), WHITE, 'gloss');

  // Livery and glazing on both flanks: a green band, a black window band split by pillars, a dark sill.
  m.add(sides(11.7, 0.26, W + 0.008, 0, 1.12), GREEN, 'gloss');
  m.add(sides(11.2, 1.14, W + 0.01, 0.05, 1.47), GLASS, 'glass');
  for (let x = -5.0; x < 5.4; x += 1.45) m.add(sides(0.07, 1.14, W + 0.014, x, 1.47), TRIM, 'satin');
  for (const [from, to] of [[-5.98, -3.33], [-2.17, 2.92], [4.08, 5.95]]) m.add(sides(to - from, 0.13, W + 0.01, (from + to) / 2, 0.3), TRIM, 'satin');

  // Doors on the curb side: two glass leaves in a black frame, front and middle.
  for (const x of [4.95, 0]) {
    m.add(rbox(1.25, 2.33, 0.03, 0.03, x, 0.36, W / 2 + 0.012, 1), TRIM, 'satin');
    for (const dx of [-0.3, 0.3]) m.add(rbox(0.54, 2.08, 0.02, 0.02, x + dx, 0.48, W / 2 + 0.026, 1), GLASS, 'glass');
  }

  // Front: windshield, destination sign above it, headlights, bumper, plate.
  m.add(panel(5.9975, 1.12, 5.9516, 2.38, W - 0.3, 0.014, 0.002), GLASS, 'glass');
  m.add(panel(5.951, 2.42, 5.9415, 2.68, 1.9, 0.02, 0.002), TRIM, 'satin');
  m.add(panel(5.951, 2.46, 5.9425, 2.64, 1.5, 0.01, 0.02), AMBER, 'lamp');
  for (const s of [-1, 1]) m.add(rbox(0.05, 0.13, 0.42, 0.03, 6.0, 0.62, s * 0.86), HEADLIGHT, 'lamp');
  m.add(rbox(0.14, 0.26, W - 0.04, 0.05, 5.97, 0.3, 0), TRIM, 'satin');
  m.add(rbox(0.02, 0.15, 0.32, 0.006, 6.045, 0.31, 0, 1), PLATE, 'satin');
  // Back: rear window, tall taillights, engine grille, bumper.
  m.add(panel(-6.0, 2.55, -6.0, 1.8, W - 0.32, 0.014, 0.002), GLASS, 'glass');
  for (const s of [-1, 1]) m.add(rbox(0.04, 0.62, 0.18, 0.02, -6.01, 0.62, s * 1.05), TAILLIGHT, 'lamp');
  m.add(rbox(0.03, 0.5, 1.5, 0.02, -6.005, 0.66, 0), TRIM, 'satin');
  m.add(rbox(0.12, 0.22, W - 0.04, 0.05, -5.97, 0.3, 0), TRIM, 'satin');

  // Air conditioning on the roof, and the mirrors on arms curving out over the windshield.
  m.add(rbox(3.4, 0.21, 1.8, 0.09, 0.8, 2.97, 0), 0xd8d5ce, 'satin');
  for (const s of [-1, 1]) {
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, s * z);
    m.add(bar(v(5.82, 2.72, 1.18), v(6.2, 2.66, 1.22), 0.028), TRIM, 'satin');
    m.add(bar(v(6.2, 2.66, 1.22), v(6.24, 2.22, 1.19), 0.028), TRIM, 'satin');
    m.add(rbox(0.06, 0.36, 0.2, 0.03, 6.24, 1.9, s * 1.16), TRIM, 'satin');
  }
  for (const x of axles) for (const s of [-1, 1] as const) wheel(m, x, R, s * (W / 2 - 0.19), R, 0.32, s, STEEL_WHEEL);

  const group = m.build();
  group.add(contactShadow(11.8, 2.4, 0.8, 0.55));
  return group;
});

export const autobus: ReferenceSpec = {
  footprint: { w: 12, d: 2.55, h: 3.2 },
  build: () => ({ object: bus(), label: 'Autobús urbano · 12 m', labelHeight: 3.2, labelSize: 0.5, solids: [centered(12, 2.55)] }),
};

// ---------- Metro car ----------

// A Mexico City Metro car: orange, rubber-tired, four doors per side, a driver's cab at each end.
// Its cross-section (sides and an arched roof) is drawn as [z, y] and extruded along the length.
const metroCar = cached(() => {
  const L = 16.2;
  const W = 2.5;
  const ORANGE = 0xf07a1a;
  const DOOR = 0xdb6a12;
  const m = new Model();
  const lengthwise = (g: THREE.BufferGeometry) => g.rotateY(Math.PI / 2); // the extrusion runs along X

  m.add(lengthwise(extrude([[-W / 2, 0.95], [W / 2, 0.95], [W / 2, 2.9], [-W / 2, 2.9]], L, 0.16)), ORANGE, 'gloss');
  const roof = new THREE.Shape();
  roof.moveTo(-W / 2, 2.9);
  roof.lineTo(W / 2, 2.9);
  roof.quadraticCurveTo(W / 2 - 0.02, 3.22, W / 2 - 0.34, 3.36);
  roof.lineTo(-W / 2 + 0.34, 3.36);
  roof.quadraticCurveTo(-W / 2 + 0.02, 3.22, -W / 2, 2.9);
  m.add(lengthwise(extrude(roof, L, 0.16)), 0xd9d6cf, 'satin');

  // Flanks: a dark skirt, a cream stripe, windows in black frames between the doors.
  m.add(sides(L - 0.32, 0.2, W + 0.01, 0, 0.95), TRIM, 'satin');
  m.add(sides(L - 0.32, 0.08, W + 0.01, 0, 1.52), 0xf3ead8, 'satin');
  const doors = [-6, -2, 2, 6];
  const bays: [number, number][] = [[-7.75, -6.7], [-5.3, -2.7], [-1.3, 1.3], [2.7, 5.3], [6.7, 7.75]];
  for (const [from, to] of bays) {
    const count = to - from > 2 ? 2 : 1;
    const step = (to - from) / count;
    for (let i = 0; i < count; i++) {
      const x = from + step * (i + 0.5);
      m.add(sides(step - 0.25, 0.94, W + 0.014, x, 1.72, 0.08), TRIM, 'satin');
      m.add(sides(step - 0.35, 0.84, W + 0.02, x, 1.77, 0.06), GLASS, 'glass');
    }
  }
  for (const x of doors) {
    m.add(sides(1.3, 1.92, W + 0.016, x, 0.98, 0.04), DOOR, 'gloss');
    m.add(sides(0.03, 1.92, W + 0.022, x, 0.98), TRIM, 'satin');
    for (const dx of [-0.32, 0.32]) m.add(sides(0.46, 0.78, W + 0.026, x + dx, 1.82, 0.05), GLASS, 'glass');
  }

  // Both ends are cabs: windshield split by a post, destination sign, headlights.
  for (const e of [-1, 1]) {
    const x = e * (L / 2 + 0.006);
    m.add(box(0.012, 0.62, 1.86, x, 1.9, 0), GLASS, 'glass');
    m.add(box(0.016, 0.62, 0.07, x, 1.9, 0), TRIM, 'satin');
    m.add(box(0.012, 0.22, 1.1, x, 2.56, 0), TRIM, 'satin');
    m.add(box(0.016, 0.12, 0.9, x, 2.61, 0), AMBER, 'lamp');
    m.add(box(0.012, 0.2, W - 0.34, x, 0.97, 0), TRIM, 'satin');
    for (const s of [-1, 1]) m.add(rbox(0.03, 0.13, 0.26, 0.02, x, 1.22, s * 0.78, 1), HEADLIGHT, 'lamp');
  }

  // Roof equipment; underneath, the frame, its equipment boxes and two rubber-tired bogies with
  // horizontal guide wheels at their ends.
  for (const x of [-4.2, 4.2]) m.add(rbox(2.4, 0.16, 1.3, 0.06, x, 3.33, 0), 0xc4c1ba, 'satin');
  m.add(box(L - 4.4, 0.4, W - 0.5, 0, 0.55, 0), TRIM);
  for (const x of [-1.6, 1.6]) m.add(rbox(1.6, 0.32, W - 0.36, 0.04, x, 0.6, 0), 0x3a3d42, 'satin');
  for (const xb of [-5.5, 5.5]) {
    m.add(rbox(3.1, 0.34, 1.7, 0.05, xb, 0.3, 0), 0x2f3236, 'satin');
    for (const dx of [-0.75, 0.75]) {
      for (const s of [-1, 1]) {
        tire(m, xb + dx, 0.45, s * 0.98, 0.45, 0.3); // rubber tires; their hubs barely show under the skirt
        m.add(cylinder(0.27, 0.26, 'z', xb + dx, 0.45, s * 0.98, 16), 0x55595f, 'satin');
      }
    }
    for (const dx of [-1.38, 1.38]) for (const s of [-1, 1]) m.add(cylinder(0.2, 0.1, 'y', xb + dx, 0.36, s * 0.98, 16), TRIM);
  }

  const group = m.build();
  group.add(contactShadow(16, 2.3, 0.8, 0.5));
  return group;
});

export const vagon: ReferenceSpec = {
  footprint: { w: 16.2, d: 2.5, h: 3.58 },
  build: () => ({ object: metroCar(), label: 'Vagón del Metro CDMX · 16 m', labelHeight: 3.6, labelSize: 0.5, solids: [centered(16.2, 2.5)] }),
};

// ---------- Tractor-trailer ----------

// A long-nosed tractor, like most on Mexican highways, pulling a 53-foot (16.15 m) box trailer.
const truck = cached(() => {
  const W = 2.6;
  const RED = 0xb32222;
  const WHITE = 0xf1f1ec;
  const ALUMINUM = 0xb7bcc2;
  const FRAME = 0x232427;
  const m = new Model();

  // A pair of dual wheels on each side of an axle: only the outer wheel's rim shows.
  const duals = (x: number) => {
    for (const s of [-1, 1] as const) {
      wheel(m, x, 0.5, s * (W / 2 - 0.16), 0.5, 0.27, s, STEEL_WHEEL);
      tire(m, x, 0.5, s * (W / 2 - 0.46), 0.5, 0.27);
    }
  };

  // ----- The trailer: white box, aluminum rails and posts, rear doors, side skirts -----
  const front = 5.15;
  const rear = front - 16.15;
  const cx = (front + rear) / 2;
  m.add(rbox(16.15, 2.75, W, 0.05, cx, 1.3, 0), WHITE, 'satin');
  for (const y of [1.28, 3.93]) m.add(box(16.16, 0.12, W + 0.02, cx, y, 0), ALUMINUM, 'metal');
  for (let x = rear + 0.6; x < front - 0.3; x += 1.2) m.add(box(0.05, 2.62, W + 0.016, x, 1.38, 0), ALUMINUM, 'metal');
  m.add(box(0.02, 2.6, W - 0.12, rear - 0.005, 1.38, 0), 0xe2e2dc, 'satin'); // rear doors
  m.add(box(0.03, 2.6, 0.03, rear - 0.012, 1.38, 0), FRAME);
  for (const z of [-0.95, -0.38, 0.38, 0.95]) m.add(cylinder(0.022, 2.5, 'y', rear - 0.04, 2.68, z, 8), ALUMINUM, 'metal'); // lock rods
  for (const y of [1.7, 2.7, 3.7]) for (const s of [-1, 1]) m.add(box(0.04, 0.1, 0.18, rear - 0.02, y, s * 1.2), FRAME);
  for (const s of [-1, 1]) m.add(rbox(0.04, 0.12, 0.26, 0.02, rear - 0.02, 1.42, s * 1.04, 1), TAILLIGHT, 'lamp');
  // Rear underride bar, striped red and white with reflective tape, on two struts.
  for (let i = 0; i < 6; i++) m.add(box(0.1, 0.12, 0.38, rear + 0.2, 0.46, -0.95 + i * 0.38), i % 2 ? WHITE : RED, 'satin');
  for (const s of [-1, 1]) m.add(box(0.08, 0.74, 0.08, rear + 0.2, 0.56, s * 0.7), FRAME);
  for (const s of [-1, 1]) m.add(box(7.5, 0.74, 0.03, -3.6, 0.52, s * (W / 2 - 0.03)), 0x3a3d42, 'satin'); // skirts
  for (const s of [-1, 1]) {
    m.add(box(0.12, 0.98, 0.12, 2.7, 0.32, s * 0.85), 0x8a8f96, 'metal'); // landing gear
    m.add(box(0.3, 0.05, 0.3, 2.7, 0.27, s * 0.85), 0x8a8f96, 'metal');
  }
  m.add(box(2.7, 0.3, 1.2, -8.7, 0.98, 0), FRAME); // the sliding axle frame
  for (const s of [-1, 1]) m.add(box(0.02, 0.62, 0.6, -10.05, 0.2, s * 0.98), FRAME);
  duals(-9.3);
  duals(-8.05);

  // ----- The tractor -----
  for (const s of [-1, 1]) m.add(box(7.6, 0.25, 0.22, 6.9, 0.72, s * 0.45), FRAME); // frame rails
  m.add(rbox(1.4, 0.14, 1.6, 0.03, 4.55, 1.12, 0), FRAME); // fifth wheel, under the trailer's nose
  m.add(rbox(0.26, 0.42, 2.5, 0.06, 10.86, 0.42, 0), CHROME, 'metal'); // bumper

  const hood = new THREE.Shape();
  hood.moveTo(10.84, 0.85);
  hood.lineTo(10.88, 1.68);
  hood.quadraticCurveTo(10.86, 1.95, 10.5, 2.0);
  hood.lineTo(9.05, 2.2);
  hood.lineTo(9.05, 0.85);
  m.add(extrude(hood, 1.62, 0.14), RED, 'gloss');
  m.add(rbox(0.08, 0.8, 1.0, 0.03, 10.9, 0.86, 0), CHROME, 'metal'); // grille
  for (let y = 0.95; y < 1.6; y += 0.11) m.add(box(0.02, 0.05, 0.88, 10.945, y, 0), FRAME);
  for (const s of [-1, 1]) m.add(rbox(0.08, 0.2, 0.22, 0.03, 10.84, 1.15, s * 0.66), HEADLIGHT, 'lamp');
  // Front fenders arching over the steer wheels.
  const fender = new THREE.Shape();
  fender.absarc(0, 0, 0.7, 0, Math.PI, false);
  fender.absarc(0, 0, 0.6, Math.PI, 0, true);
  for (const s of [-1, 1]) {
    m.add(extrude(fender, 0.46, 0.05).translate(9.9, 0.52, s * 1.02), RED, 'gloss');
    m.add(rbox(0.06, 0.08, 0.16, 0.02, 10.55, 0.62, s * 1.12, 1), AMBER, 'lamp'); // turn signals
  }

  const cab = new THREE.Shape();
  cab.moveTo(9.15, 1.0);
  cab.lineTo(9.15, 2.18);
  cab.lineTo(8.72, 3.02); // windshield, raked back
  cab.quadraticCurveTo(8.62, 3.12, 8.4, 3.12);
  cab.lineTo(7.88, 3.12);
  cab.lineTo(7.88, 1.0);
  m.add(extrude(cab, 2.45, 0.1), RED, 'gloss');
  m.add(panel(9.15, 2.18, 8.72, 3.02, 2.17, 0.02, 0.002, 0.05), GLASS, 'glass');
  m.add(panel(9.15, 2.18, 8.72, 3.02, 0.06, 0.03, 0.01, 0.05), FRAME); // center post of the split windshield
  for (const s of [-1, 1]) {
    m.add(extrude([[8.98, 2.25], [8.66, 2.88], [8.05, 2.9], [8.05, 2.25]], 0.012).translate(0, 0, s * 1.229), GLASS, 'glass');
    m.add(rbox(0.12, 0.03, 0.02, 0.01, 8.2, 1.98, s * 1.23, 1), CHROME, 'metal'); // door handle
  }
  m.add(rbox(1.45, 2.12, 2.45, 0.08, 7.18, 1.0, 0), RED, 'gloss'); // sleeper
  m.add(sides(0.45, 0.25, 2.47, 7.2, 2.5, 0.04), GLASS, 'glass');
  const fairing = new THREE.Shape(); // the roof fairing that lifts the air over the trailer
  fairing.moveTo(8.62, 3.06);
  fairing.quadraticCurveTo(8.0, 3.85, 7.0, 3.95);
  fairing.lineTo(6.46, 3.95);
  fairing.lineTo(6.46, 3.06);
  m.add(extrude(fairing, 2.4, 0.12), RED, 'gloss');

  for (const s of [-1, 1]) {
    m.add(cylinder(0.085, 2.85, 'y', 6.33, 2.55, s * 1.12, 12), CHROME, 'metal'); // exhaust stacks
    m.add(cylinder(0.32, 1.25, 'x', 7.15, 0.72, s * 0.95, 20), CHROME, 'metal'); // fuel tanks
    for (const dx of [-0.45, 0.45]) m.add(cylinder(0.325, 0.05, 'x', 7.15 + dx, 0.72, s * 0.95, 20), FRAME);
    for (const y of [0.42, 0.78]) m.add(rbox(0.5, 0.06, 0.3, 0.02, 8.5, y, s * 1.12, 1), FRAME); // steps
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, s * z);
    m.add(bar(v(9.02, 2.35, 1.2), v(9.06, 2.35, 1.42), 0.02), FRAME);
    m.add(rbox(0.07, 0.52, 0.2, 0.03, 9.06, 2.0, s * 1.45), FRAME, 'satin'); // mirrors
    m.add(box(0.02, 0.6, 0.55, 3.1, 0.2, s * 1.0), FRAME); // mud flaps
  }
  for (const s of [-1, 1] as const) wheel(m, 9.9, 0.52, s * (W / 2 - 0.17), 0.52, 0.3, s, STEEL_WHEEL);
  duals(5.1);
  duals(3.82);

  const group = m.build();
  group.add(contactShadow(21.8, 2.5, 0.8, 0.5));
  return group;
});

export const trailer: ReferenceSpec = {
  footprint: { w: 22, d: 2.6, h: 4.1 },
  build: () => ({ object: truck(), label: 'Tráiler con caja de 53 pies · 22 m', labelHeight: 4.1, labelSize: 0.6, solids: [centered(22, 2.6)] }),
};

