import * as THREE from 'three';
import { box, centered, type ReferenceSpec } from './shared';

const W = 8;
const D = 6;
const H = 2.6;

// A one-story social-interest house, front door facing +Z (toward the entrance).
export const casa: ReferenceSpec = {
  footprint: { w: W + 0.3, d: D + 0.3, h: H + 0.2 },
  build: () => {
    const group = new THREE.Group();
    group.add(box(W, H, D, 0xe8a87c));
    group.add(box(W + 0.3, 0.2, D + 0.3, 0xd9d4c7, 0, H)); // flat concrete roof (losa)
    group.add(box(0.95, 2.1, 0.05, 0x6b3e26, -1.5, 0, D / 2)); // door
    group.add(box(1.4, 1.1, 0.05, 0x9fc5e8, 1.8, 1.0, D / 2)); // window
    return {
      object: group,
      label: 'Casa de interés social · 48 m²',
      labelHeight: H + 0.2,
      solids: [centered(W + 0.3, D + 0.3)],
    };
  },
};
