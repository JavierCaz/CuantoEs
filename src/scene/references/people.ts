import * as THREE from 'three';
import { Model, cached, contactShadow, cylinder, lathe, rbox } from './kit';
import { centered, type ReferenceSpec } from './shared';

const HEIGHT = 1.7;

const SKIN = 0xc68a5e;
const SHIRT = 0xe0a33a;
const JEANS = 0x34435f;
const HAIR = 0x241a14;
const SHOE = 0x2d2f33;
const SOLE = 0xece7dd;
const BELT = 0x3b2a1f;

// Bodies are wider than they are deep: lathes come out round, so squash them front to back.
const flatten = (g: THREE.BufferGeometry, depth = 0.62) => g.scale(1, 1, depth);

// A 1.70 m adult in jeans and a polo shirt, facing +Z (toward the entrance). Proportions follow the
// usual drawing rules: the head is ~1/7.5 of the height, the legs about half, and the fingertips
// reach mid-thigh.
const person = cached(() => {
  const m = new Model();

  for (const side of [-1, 1]) {
    // Legs: turned profiles, tapering from the thigh to the ankle.
    const leg = lathe([[0, 0.06], [0.05, 0.065], [0.055, 0.3], [0.059, 0.5], [0.068, 0.7], [0.08, 0.9], [0.06, 0.97], [0, 0.98]], 14);
    m.add(leg.translate(side * 0.092, 0, 0), JEANS);
    // Sneakers: a white sole under a rounded upper, the toes forward.
    m.add(rbox(0.104, 0.028, 0.27, 0.012, side * 0.095, 0, 0.035, 1), SOLE, 'satin');
    m.add(rbox(0.094, 0.08, 0.24, 0.036, side * 0.095, 0.016, 0.03, 2), SHOE, 'satin');

    // Arms hang from the shoulder, a little out from the body and bent forward at the elbow.
    // Each part is built hanging from the origin, then swung into place.
    const swing = (g: THREE.BufferGeometry) => g.rotateZ(side * 0.07).translate(side * 0.18, 1.378, 0);
    const forearm = (g: THREE.BufferGeometry) => g.rotateX(-0.12).translate(0, -0.28, 0);
    m.add(swing(new THREE.SphereGeometry(0.05, 10, 6).scale(1, 0.9, 1)), SHIRT); // the shoulder, round under the sleeve
    m.add(swing(cylinder(0.05, 0.17, 'y', 0, -0.08, 0, 12, 0.05)), SHIRT); // short sleeve
    m.add(swing(new THREE.CapsuleGeometry(0.037, 0.15, 2, 8).translate(0, -0.19, 0)), SKIN, 'satin');
    m.add(swing(forearm(new THREE.CapsuleGeometry(0.033, 0.19, 2, 8).translate(0, -0.12, 0))), SKIN, 'satin');
    // The hand: a flattened mitten, the palm facing the leg.
    m.add(swing(forearm(new THREE.SphereGeometry(0.043, 8, 6).scale(0.6, 1.3, 0.95).translate(0, -0.3, 0.004))), SKIN, 'satin');
  }

  // Hips in jeans, a belt, and the shirt tucked in above it.
  m.add(flatten(lathe([[0, 0.8], [0.125, 0.81], [0.15, 0.88], [0.152, 0.97], [0.146, 1.0], [0, 1.0]], 20), 0.66), JEANS);
  m.add(flatten(lathe([[0.152, 0.962], [0.156, 0.966], [0.156, 0.996], [0.152, 1.0]], 20), 0.66), BELT, 'satin');
  m.add(rbox(0.045, 0.032, 0.012, 0.004, 0, 0.965, 0.103, 1), 0xb39256, 'satin'); // buckle
  // The torso: chest widest, the shoulders sloping in to the base of the neck.
  const torso = lathe([[0, 0.99], [0.146, 1.0], [0.148, 1.08], [0.154, 1.18], [0.163, 1.28], [0.166, 1.34], [0.162, 1.382], [0.128, 1.418], [0.07, 1.448], [0, 1.455]], 20);
  m.add(flatten(torso), SHIRT);
  m.add(new THREE.TorusGeometry(0.056, 0.013, 4, 16).rotateX(Math.PI / 2).scale(1, 1, 0.85).translate(0, 1.448, -0.003), SHIRT); // collar

  // Neck and head. The head is egg-shaped; hair is the top of a slightly bigger sphere sharing its
  // center, tilted back: it reaches lower behind the head than over the forehead. (Offsetting it
  // instead would let the head poke through where the two surfaces cross, in a jagged line.)
  const headY = HEIGHT - 0.11;
  const head = (g: THREE.BufferGeometry) => g.scale(0.9, 1.1, 1).translate(0, headY, 0.01);
  m.add(cylinder(0.045, 0.12, 'y', 0, 1.49, 0, 12), SKIN, 'satin');
  m.add(head(new THREE.SphereGeometry(0.1, 18, 12)), SKIN, 'satin');
  m.add(head(new THREE.SphereGeometry(0.106, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.55).rotateX(-0.36)), HAIR, 'satin');
  m.add(new THREE.SphereGeometry(0.019, 8, 6).scale(0.8, 1, 0.9).translate(0, headY - 0.022, 0.106), SKIN, 'satin'); // nose
  for (const side of [-1, 1]) {
    m.add(new THREE.SphereGeometry(0.023, 8, 6).scale(0.45, 1, 0.75).translate(side * 0.087, headY - 0.008, 0.004), SKIN, 'satin'); // ears
  }

  const group = m.build();
  group.add(contactShadow(0.36, 0.34, 0.22, 0.42, 0, 0.02));
  return group;
});

export const persona: ReferenceSpec = {
  footprint: { w: 0.5, d: 0.5, h: HEIGHT },
  build: () => ({ object: person(), label: 'Persona · 1.70 m', labelHeight: HEIGHT, solids: [centered(0.5, 0.5)] }),
};
