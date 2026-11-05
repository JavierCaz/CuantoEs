import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Rect } from '../../money/layout';
import { Model, box, cached, contactShadow, cylinder, extrude, lathe, outline, rbox, tire, wheel } from './kit';
import { centered, type ReferenceSpec } from './shared';

// Boeing 737-800: 39.5 m long, 35.8 m wingspan, 12.5 m to the top of the tail. It's built with the
// nose toward +X, then turned to point it at the entrance (+Z), parallel to the visitors' path: you
// walk in to meet the nose and carry on down the length of the fuselage.
const PLANE = { length: 39.5, span: 35.8, height: 12.5, radius: 1.88, axisY: 3.2 };
const { radius: R, axisY: Y } = PLANE;
const WING_ROOT = 2.26; // top of the wing where it meets the body: its underside clears your head
const DIHEDRAL = Math.tan((6 * Math.PI) / 180); // the wings rise 6° toward the tips

const WHITE = 0xf5f5f2;
const BELLY = 0xc3c9d0;
const BLUE = 0x1f4e8c;
const WING = 0xbfc5cc;
const GLASS = 0x1c2630;
const DARK = 0x3a3e44;

// ---------- Fuselage ----------

// The fuselage's radius along its length: a tail cone, the long tube of the cabin, a rounded nose.
// Turned on a lathe, every section is a circle; bend() then reshapes the two ends.
const NOSE = {
  start: 14.6, // where the cabin's tube ends
  length: 5.15,
  // Along the nose, every tenth of the way to the tip: the height of the section's center (meters from
  // the fuselage's axis) and how much of the round section it keeps in height and in width. The top
  // line falls steeply first, along the windshield, then rounds over the radome to a tip that sits
  // low, as on the real plane; the underside stays nearly level until close to the tip.
  center: [0, -0.02, -0.1, -0.28, -0.45, -0.54, -0.59, -0.62, -0.63, -0.62, -0.6],
  height: [1, 0.99, 0.96, 0.88, 0.8, 0.76, 0.75, 0.76, 0.78, 0.8, 0.8],
  width: [1, 1, 1.01, 1.02, 1.03, 1.01, 0.97, 0.93, 0.89, 0.86, 0.85],
};
// The cockpit windows, as fractions of the nose's length: the front panes on the steep stretch of its
// top, the side windows reaching a little further back.
const COCKPIT = { front: 0.2, side: 0.15, end: 0.4 };

function radiusAt(x: number): number {
  if (x > NOSE.start) return R * Math.pow(Math.max(0, 1 - ((x - NOSE.start) / NOSE.length) ** 2), 0.6);
  if (x < -12.2) return R * (1 - 0.88 * ((-12.2 - x) / 7.55) ** 1.6);
  return R;
}
const noseAt = (s: number) => NOSE.start + NOSE.length * s;
const STATIONS = [
  ...Array.from({ length: 14 }, (_, i) => -19.75 + (7.55 * i) / 14),
  -12.2,
  // Every 5% of the nose, closer together near the tip, where it curves fastest.
  ...[...Array.from({ length: 19 }, (_, i) => i * 0.05), 0.93, 0.955, 0.975, 0.99, 1].map(noseAt),
];

// A smooth curve through evenly spaced values (Catmull-Rom), at t from 0 (the first) to 1 (the last).
function curve(values: number[], t: number): number {
  const f = THREE.MathUtils.clamp(t, 0, 1) * (values.length - 1);
  const i = Math.min(Math.floor(f), values.length - 2);
  const u = f - i;
  const [p0, p1, p2, p3] = [values[Math.max(i - 1, 0)], values[i], values[i + 1], values[Math.min(i + 2, values.length - 1)]];
  const [v0, v1] = [(p2 - p0) / 2, (p3 - p1) / 2];
  return ((2 * p1 - 2 * p2 + v0 + v1) * u + (3 * p2 - 3 * p1 - 2 * v0 - v1)) * u * u + v0 * u + p1;
}

// The tail cone sweeps up: each ring rises by how much it has narrowed, so the top stays level while
// the underside climbs toward the tail. The nose's rings move to the centers and proportions in NOSE.
function bend(g: THREE.BufferGeometry) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = [p.getX(i), p.getY(i), p.getZ(i)];
    if (x < -12.2) p.setY(i, y + (R - Math.hypot(y, z)) * 0.82);
    if (x > NOSE.start) {
      const s = (x - NOSE.start) / NOSE.length;
      p.setY(i, curve(NOSE.center, s) + y * curve(NOSE.height, s));
      p.setZ(i, z * curve(NOSE.width, s));
    }
  }
}

// A strip of the skin between two angles around the axis, over the stations from `from` to `to`
// along X, raised `lift` off the surface. Around the axis, 0 is the +Z flank, π/2 the belly and 3π/2
// the top. A strip uses the same stations as the skin under it, so it follows it exactly.
function skin(phiStart: number, phiLength: number, from = -Infinity, to = Infinity, lift = 0): THREE.BufferGeometry {
  const xs = STATIONS.filter((x) => x >= from - 1e-6 && x <= to + 1e-6);
  const points: [number, number][] = xs.map((x) => [radiusAt(x) + lift, x]);
  if (from === -Infinity) points.unshift([0, xs[0]]); // closes the tail
  const segments = Math.max(2, Math.round((phiLength / (Math.PI * 2)) * 48));
  const g = lathe(points, segments, phiStart, phiLength);
  g.rotateZ(-Math.PI / 2); // the lathe turns around Y; lay its axis along X, nose toward +X
  bend(g);
  g.computeVertexNormals(); // bent, the lathe's own normals no longer fit. (Every strip stops short of a full turn, so it has no seam to smooth over.)
  return g.translate(0, Y, 0);
}

// ---------- Wings ----------

// A top-view outline [x, z] extruded into a slab whose top is at y = 0: thinner toward the tip
// (`taper`) and rising toward it (dihedral). A Shape is drawn in XY, so rotateX(90°) maps its y onto
// world Z and the extrusion onto -Y, downward.
function wing(points: [number, number][], thickness: number, root: number, tip: number, dihedral: number, taper: number) {
  const bevel = thickness * 0.22;
  const g = new THREE.ExtrudeGeometry(outline(points), {
    depth: thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelOffset: -bevel,
    bevelSegments: 2,
  });
  g.rotateX(Math.PI / 2).translate(0, -bevel, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = Math.abs(p.getZ(i));
    const t = THREE.MathUtils.clamp((z - root) / (tip - root), 0, 1);
    p.setY(i, p.getY(i) * (1 - taper * t) + Math.max(0, z - root) * dihedral);
  }
  return toCreasedNormals(g, Math.PI / 5);
}

// The engine nacelle's radius along its axis, from the exhaust to the intake: [radius, x].
const NACELLE: [number, number][] = [[0.5, -1.55], [0.66, -1.25], [0.82, -0.55], [0.9, 0.4], [0.89, 1.3], [0.83, 1.8], [0.74, 1.95]];
const ENGINE = { x: 2.6, y: 1.45, z: 5 };
const MAIN_GEAR = { x: -2.2, z: 2.9 };

const airplane = cached(() => {
  const m = new Model();
  const half = PLANE.span / 2;

  // Livery: white, a blue cheatline under the windows, a white pinstripe, a grey belly.
  const TAU = Math.PI * 2;
  const bands: [number, number, number][] = [
    [3.0414, TAU + 0.1002 - 3.0414, WHITE],
    [0.1002, 0.1525, BLUE],
    [0.2527, 0.2141, WHITE],
    [0.4668, 2.208, BELLY],
    [2.6748, 0.2141, WHITE],
    [2.8889, 0.1525, BLUE],
  ];
  for (const [start, length, color] of bands) m.add(skin(start, length), color, 'gloss');
  // The cockpit: on each side of a center post, a front pane on the steep slope of the nose, looking
  // ahead, and a side window beside it. Angles count from the top (3π/2) toward each flank.
  for (const s of [-1, 1]) {
    const pane = (a: number, b: number, from: number) =>
      skin(s === 1 ? Math.PI * 1.5 + a : Math.PI * 1.5 - b, b - a, noseAt(from), noseAt(COCKPIT.end), 0.012);
    m.add(pane(0.04, 0.62, COCKPIT.front), GLASS, 'glass');
    m.add(pane(0.68, 1.27, COCKPIT.side), GLASS, 'glass');
  }
  // A row of cabin windows down each side.
  for (let x = 13.3; x > -11.6; x -= 0.53) {
    for (const s of [-1, 1]) m.add(box(0.2, 0.3, 0.09, x, Y + 0.3 - 0.15, s * 1.857), GLASS, 'glass');
  }
  m.add(new THREE.SphereGeometry(1, 24, 12).scale(6, 0.95, 2.3).translate(-1.4, Y - 1.2, 0), BELLY, 'gloss'); // wing-to-body fairing

  // Wings, swept back, each built on its own so it rises cleanly from the body; winglets at the tips.
  const span = (s: 1 | -1, pts: [number, number][]) => pts.map(([x, z]) => [x, s * z] as [number, number]);
  for (const s of [-1, 1] as const) {
    m.add(wing(span(s, [[2, 1.6], [-6.3, half], [-7.8, half], [-5, 1.6]]), 0.42, 1.6, half, DIHEDRAL, 0.65).translate(0, WING_ROOT, 0), WING, 'satin');
    const tipTop = WING_ROOT + (half - 1.6) * DIHEDRAL;
    const winglet = extrude([[-6.3, 0], [-7.75, 2.35], [-8.25, 2.4], [-7.8, 0]], 0.12, 0.04);
    m.add(winglet.rotateX(s * 0.22).translate(0, tipTop - 0.09, s * (half - 0.05)), WHITE, 'satin');
    m.add(new THREE.SphereGeometry(0.1, 8, 6).translate(-6.6, tipTop - 0.05, s * (half + 0.02)), s === 1 ? 0x31d15c : 0xff3b30, 'lamp'); // navigation lights
    // Tailplane: the same idea, smaller.
    m.add(wing(span(s, [[-15.2, 0.8], [-18.5, 7.2], [-19.6, 7.2], [-18.8, 0.8]]), 0.25, 0.8, 7.2, Math.tan(0.12), 0.5).translate(0, Y + 0.9, 0), WHITE, 'satin');
  }
  // Tail fin, with the long fillet that runs forward along the top of the fuselage.
  m.add(extrude([[-10.6, 1.25], [-13.0, 1.65], [-14.4, 2.3], [-18.3, 8.8], [-19.65, 8.8], [-19.55, 0.2], [-12, 0.5]], 0.32, 0.1).translate(0, Y + 0.5, 0), BLUE, 'satin');
  m.add(cylinder(0.2, 0.06, 'x', -19.77, Y + (R - radiusAt(-19.75)) * 0.82, 0, 12), DARK); // APU exhaust
  m.add(new THREE.SphereGeometry(0.09, 8, 6).translate(-3, Y + R + 0.05, 0), 0xff3b30, 'lamp'); // beacon

  // Engines under the wings: nacelle, polished intake lip, fan and spinner, exhaust cone, pylon.
  // The nacelle's underside is flattened, as on the real 737, to keep it off the runway.
  for (const s of [-1, 1]) {
    const { x, y, z } = ENGINE;
    const nacelle = lathe(NACELLE, 32).rotateZ(-Math.PI / 2);
    const p = nacelle.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < -0.5) p.setY(i, -0.5 + (p.getY(i) + 0.5) * 0.5);
    nacelle.computeVertexNormals();
    m.add(nacelle.translate(x, y, s * z), WHITE, 'gloss');
    m.add(new THREE.TorusGeometry(0.77, 0.055, 8, 32).rotateY(Math.PI / 2).translate(x + 1.93, y, s * z), 0xd5d9de, 'metal');
    m.add(cylinder(0.73, 0.04, 'x', x + 1.75, y, s * z, 32), DARK, 'satin');
    m.add(cylinder(0.22, 0.4, 'x', x + 1.95, y, s * z, 16, 0.01), 0xd5d9de, 'metal');
    m.add(cylinder(0.05, 0.8, 'x', x - 1.8, y, s * z, 16, 0.4), 0x6b7076, 'metal');
    m.add(rbox(4.2, 0.36, 0.26, 0.1, x - 0.6, 2.14, s * z), WING, 'satin');
  }

  // Landing gear: twin nose wheels, and two pairs of main wheels on struts under the wings.
  m.add(cylinder(0.09, 1.0, 'y', 15.2, 0.85, 0, 10), 0xaeb3b9, 'metal');
  for (const s of [-1, 1] as const) wheel(m, 15.2, 0.34, s * 0.2, 0.34, 0.18, s, { spokes: 0, rimRatio: 0.55 });
  for (const s of [-1, 1] as const) {
    m.add(cylinder(0.13, 1.45, 'y', MAIN_GEAR.x, 1.2, s * MAIN_GEAR.z, 12), 0xaeb3b9, 'metal');
    wheel(m, MAIN_GEAR.x, 0.55, s * (MAIN_GEAR.z + 0.22), 0.55, 0.34, s, { spokes: 0, rimRatio: 0.55 });
    tire(m, MAIN_GEAR.x, 0.55, s * (MAIN_GEAR.z - 0.22), 0.55, 0.34);
  }

  const group = m.build();
  group.add(contactShadow(36, 4, 3, 0.3));
  group.rotation.y = -Math.PI / 2; // the nose from +X to +Z, toward the entrance
  return group;
});

// Solid where it's lower than your head: the fuselage, the engines and the main wheels.
// You can walk under the wings.
const rect = (x: number, z: number, w: number, d: number) => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
// A floor rectangle in the model's frame, turned with it: rotation.y = -π/2 takes (x, z) to (-z, x).
const turn = (r: Rect): Rect => ({ minX: -r.maxZ, maxX: -r.minZ, minZ: r.minX, maxZ: r.maxX });

export const avion: ReferenceSpec = {
  footprint: { w: PLANE.span, d: PLANE.length, h: PLANE.height }, // turned: the wings across, the fuselage along the path
  build: () => ({
    object: airplane(),
    label: 'Boeing 737-800 · 39.5 m de largo',
    labelHeight: PLANE.height,
    labelSize: 1.2,
    solids: [
      centered(PLANE.length, 2 * R),
      ...[-1, 1].map((s) => rect(ENGINE.x, s * ENGINE.z, 4.2, 1.8)),
      ...[-1, 1].map((s) => rect(MAIN_GEAR.x, s * MAIN_GEAR.z, 1, 0.9)),
    ].map(turn),
  }),
};
