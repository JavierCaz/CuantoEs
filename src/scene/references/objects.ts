import * as THREE from 'three';
import { box, centered, type ReferenceSpec } from './shared';

// Things you could carry money in, for the rooms where the money still fits on a table.

export const mochila: ReferenceSpec = {
  footprint: { w: 0.32, d: 0.24, h: 0.42 },
  build: () => {
    const group = new THREE.Group();
    group.add(box(0.32, 0.4, 0.16, 0x2f6fb5)); // main compartment
    group.add(box(0.26, 0.18, 0.05, 0x285e9a, 0, 0.04, 0.1)); // front pocket
    group.add(box(0.1, 0.03, 0.03, 0x1d2a3a, 0, 0.4)); // handle on top
    for (const x of [-0.09, 0.09]) group.add(box(0.045, 0.34, 0.02, 0x1d2a3a, x, 0.04, -0.09)); // straps
    return { object: group, label: 'Mochila escolar · 42 cm', labelHeight: 0.42, solids: [centered(0.32, 0.24)] };
  },
};

export const maletin: ReferenceSpec = {
  footprint: { w: 0.44, d: 0.12, h: 0.38 },
  build: () => {
    const group = new THREE.Group();
    group.add(box(0.44, 0.32, 0.11, 0x4a2f1d)); // standing on its long edge
    group.add(box(0.44, 0.015, 0.115, 0xb08a4a, 0, 0.25)); // brass trim at the lid's seam
    for (const x of [-0.06, 0.06]) group.add(box(0.015, 0.035, 0.02, 0x2a1a10, x, 0.32));
    group.add(box(0.135, 0.02, 0.025, 0x2a1a10, 0, 0.355)); // handle
    return { object: group, label: 'Maletín · 44 × 32 cm', labelHeight: 0.38, solids: [centered(0.44, 0.12)] };
  },
};

// A carry-on, 55 × 35 × 23 cm, with its telescopic handle pulled out.
export const maleta: ReferenceSpec = {
  footprint: { w: 0.36, d: 0.24, h: 1.0 },
  build: () => {
    const group = new THREE.Group();
    group.add(box(0.35, 0.5, 0.23, 0x7a2e3b, 0, 0.05)); // shell, lifted by the wheels
    for (const y of [0.18, 0.36]) group.add(box(0.355, 0.012, 0.235, 0x5e2330, 0, y)); // ribs
    const wheelGeometry = new THREE.CylinderGeometry(0.025, 0.025, 0.02, 12);
    wheelGeometry.rotateZ(Math.PI / 2); // axle along X
    const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    for (const x of [-0.14, 0.14]) {
      for (const z of [-0.09, 0.09]) {
        const wheel = new THREE.Mesh(wheelGeometry, black);
        wheel.position.set(x, 0.025, z);
        group.add(wheel);
      }
    }
    for (const x of [-0.08, 0.08]) group.add(box(0.015, 0.42, 0.015, 0x9a9a9a, x, 0.55, -0.1)); // handle rods
    group.add(box(0.19, 0.03, 0.03, 0x1a1a1a, 0, 0.97, -0.1)); // grip
    return { object: group, label: 'Maleta de mano · 55 × 35 × 23 cm', labelHeight: 1.0, solids: [centered(0.36, 0.24)] };
  },
};

export const silla: ReferenceSpec = {
  footprint: { w: 0.46, d: 0.46, h: 0.9 },
  build: () => {
    const group = new THREE.Group();
    const wood = 0x8a5a33;
    for (const x of [-0.2, 0.2]) {
      for (const z of [-0.2, 0.2]) group.add(box(0.035, 0.43, 0.035, wood, x, 0, z));
    }
    group.add(box(0.46, 0.04, 0.46, wood, 0, 0.43)); // seat, 47 cm up
    for (const x of [-0.2, 0.2]) group.add(box(0.035, 0.43, 0.035, wood, x, 0.47, -0.2)); // back posts
    group.add(box(0.44, 0.16, 0.025, wood, 0, 0.72, -0.2)); // backrest
    return { object: group, label: 'Silla · asiento a 47 cm', labelHeight: 0.9, solids: [centered(0.46, 0.46)] };
  },
};
