import * as THREE from 'three';
import { box, centered, wheels, type ReferenceSpec } from './shared';

// Vehicles lie along X with the front toward +X, so you see their full length from the entrance.

export const auto: ReferenceSpec = {
  footprint: { w: 4.3, d: 1.75, h: 1.55 },
  build: () => {
    const L = 4.3;
    const W = 1.75;
    const group = new THREE.Group();
    group.add(box(L, 0.7, W, 0xc0392b, 0, 0.3));
    group.add(box(2.2, 0.55, W - 0.15, 0x2b2f36, -0.2, 1.0));
    group.add(wheels(0.32, 0.22, [-1.35, 1.35], W / 2 - 0.05));
    return { object: group, label: 'Auto compacto · 4.3 m', labelHeight: 1.55, solids: [centered(L, W)] };
  },
};

export const autobus: ReferenceSpec = {
  footprint: { w: 12, d: 2.55, h: 3.2 },
  build: () => {
    const dark = 0x24303b;
    const group = new THREE.Group();
    group.add(box(12, 2.75, 2.55, 0x3d7fb8, 0, 0.35));
    group.add(box(11.4, 1.0, 2.57, dark, 0.1, 1.75)); // side windows
    group.add(box(0.05, 1.5, 2.3, dark, 6, 1.3)); // windshield
    group.add(box(1.2, 2.3, 0.05, dark, 4.4, 0.4, 1.28)); // door, on the curb side
    group.add(box(11.6, 0.1, 2.4, 0xd9d4c7, 0, 3.1)); // roof
    group.add(wheels(0.5, 0.3, [-2.9, 3.6], 1.12));
    return {
      object: group,
      label: 'Autobús urbano · 12 m',
      labelHeight: 3.2,
      labelSize: 0.5,
      solids: [centered(12, 2.55)],
    };
  },
};

// A Mexico City Metro car: orange, rubber-tired, four doors per side.
export const vagon: ReferenceSpec = {
  footprint: { w: 16.2, d: 2.5, h: 3.58 },
  build: () => {
    const dark = 0x2a2f36;
    const group = new THREE.Group();
    for (const x of [-5.5, 5.5]) group.add(box(3, 0.7, 2, 0x2b2b2b, x, 0.15)); // bogies
    group.add(wheels(0.45, 0.25, [-6.3, -4.7, 4.7, 6.3], 0.95));
    group.add(box(16.2, 2.6, 2.5, 0xf07a1a, 0, 0.9));
    group.add(box(15.6, 0.9, 2.52, dark, 0, 2.1)); // windows
    for (const x of [-6, -2, 2, 6]) group.add(box(1.3, 2.0, 2.54, 0xa8500f, x, 0.95)); // doors, both sides
    for (const x of [-8.1, 8.1]) group.add(box(0.05, 0.9, 2, dark, x, 2.1)); // driver's windows at both ends
    group.add(box(16, 0.08, 2.3, 0xbfbfbf, 0, 3.5)); // roof
    return {
      object: group,
      label: 'Vagón del Metro CDMX · 16 m',
      labelHeight: 3.6,
      labelSize: 0.5,
      solids: [centered(16.2, 2.5)],
    };
  },
};

// Cab-over tractor pulling a 53-foot (16.15 m) box trailer.
export const trailer: ReferenceSpec = {
  footprint: { w: 22, d: 2.6, h: 4.1 },
  build: () => {
    const red = 0xb32222;
    const group = new THREE.Group();
    const trailerLength = 16.15;
    group.add(box(trailerLength, 2.75, 2.6, 0xeeeeee, -11 + trailerLength / 2, 1.3));
    group.add(wheels(0.5, 0.5, [-9.5, -8.2], 1.05));
    group.add(box(6.2, 0.4, 2.4, 0x2b2b2b, 7.9, 0.6)); // tractor chassis, under the trailer's nose
    group.add(box(1.4, 2.4, 2.4, red, 7.7, 1.0)); // sleeper
    group.add(box(2.4, 2.6, 2.5, red, 9.6, 1.0)); // cab
    group.add(box(0.06, 1.0, 2.2, 0x24303b, 10.82, 2.3)); // windshield
    group.add(wheels(0.52, 0.45, [5.0, 6.3, 10.2], 1.05));
    return {
      object: group,
      label: 'Tráiler con caja de 53 pies · 22 m',
      labelHeight: 4.1,
      labelSize: 0.6,
      solids: [centered(22, 2.6)],
    };
  },
};

// Boeing 737-800: 39.5 m long, 35.8 m wingspan, 12.5 m to the top of the tail.
const PLANE = { length: 39.5, span: 35.8, height: 12.5, radius: 1.88, axisY: 3.2 };

export const avion: ReferenceSpec = {
  footprint: { w: PLANE.length, d: PLANE.span, h: PLANE.height },
  build: () => {
    const { radius: R, axisY: Y } = PLANE;
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 });
    const grey = new THREE.MeshStandardMaterial({ color: 0xc4c9cf, roughness: 0.6 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x1f4e8c, roughness: 0.5 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3038 });
    const group = new THREE.Group();
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z = 0) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    // Fuselage: a 30 m tube, a stretched half-sphere for the nose and a cone tapering up to the tail.
    // Cylinders are built along Y; rotateZ(90°) lays them along X (and turns +Y into -X).
    add(new THREE.CylinderGeometry(R, R, 30, 24).rotateZ(Math.PI / 2), white, 0.25, Y);
    add(new THREE.SphereGeometry(R, 24, 16).scale(4.5 / R, 1, 1), white, 15.25, Y);
    add(new THREE.CylinderGeometry(0.35, R, 5, 24).rotateZ(Math.PI / 2), white, -17.25, Y + 0.5);
    add(new THREE.BoxGeometry(26, 0.22, 2 * R + 0.02), dark, 1.5, Y + 0.45); // cabin windows
    add(new THREE.BoxGeometry(1, 0.4, 2.6), dark, 16.4, Y + 0.6); // cockpit windows

    // Wings and tailplane: top-view outlines, extruded into thin slabs. A Shape is drawn in XY,
    // so rotateX(90°) maps its y onto world Z and the extrusion depth onto -Y (downward).
    const plan = (points: [number, number][], thickness: number) => {
      const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
      return new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false }).rotateX(Math.PI / 2);
    };
    const half = PLANE.span / 2;
    add(
      plan([[2, 1.8], [-6.3, half], [-7.8, half], [-5, 1.8], [-5, -1.8], [-7.8, -half], [-6.3, -half], [2, -1.8]], 0.35),
      grey,
      0,
      2.2, // low wing: underside at 1.85 m, just above your head
    );
    add(plan([[-15.2, 1], [-18.5, 7.2], [-19.6, 7.2], [-18.8, 1], [-18.8, -1], [-19.6, -7.2], [-18.5, -7.2], [-15.2, -1]], 0.25), grey, 0, Y + 0.9);

    // Tail fin: a side-view outline, extruded sideways and centered on the fuselage.
    const fin = new THREE.Shape([[-13.8, 1.3], [-18.4, 8.8], [-19.7, 8.8], [-19.6, 0.3]].map(([x, y]) => new THREE.Vector2(x, y)));
    add(new THREE.ExtrudeGeometry(fin, { depth: 0.3, bevelEnabled: false }).translate(0, 0, -0.15), blue, 0, Y + 0.5);

    for (const z of [-5, 5]) add(new THREE.CylinderGeometry(0.9, 0.8, 3.6, 20).rotateZ(Math.PI / 2), grey, 3.5, 1.45, z); // engines

    // Landing gear: struts down to the wheels.
    for (const [x, z, top] of [[15, 0, Y - R], [-2, -2.9, 1.85], [-2, 2.9, 1.85]]) {
      add(new THREE.CylinderGeometry(0.1, 0.1, top - 0.3), grey, x, 0.3 + (top - 0.3) / 2, z);
    }
    group.add(wheels(0.3, 0.2, [15], 0.2), wheels(0.45, 0.35, [-2], 2.9));

    // Solid where it's lower than your head: the fuselage, the engines and the main wheels.
    // You can walk under the wings.
    const rect = (x: number, z: number, w: number, d: number) => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
    return {
      object: group,
      label: 'Boeing 737-800 · 39.5 m de largo',
      labelHeight: PLANE.height,
      labelSize: 1.2,
      solids: [centered(PLANE.length, 2 * R), rect(3.5, -5, 3.6, 1.8), rect(3.5, 5, 3.6, 1.8), rect(-2, -2.9, 1, 0.6), rect(-2, 2.9, 1, 0.6)],
    };
  },
};
