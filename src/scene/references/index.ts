import * as THREE from 'three';
import type { Rect } from '../../money/layout';
import type { Point } from '../../museum/referenceLayout';
import { disposeObject } from '../dispose';
import { casa } from './buildings';
import { maleta, maletin, mochila, silla } from './objects';
import { persona } from './people';
import { alberca, basquetbol, futbol, porteria } from './sports';
import { makeLabel, type Reference, type ReferenceSpec } from './shared';
import { auto, autobus, avion, trailer, vagon } from './vehicles';

// Every scale reference a room can show, by the id presets.json uses in "referencias".
export const REFERENCES = {
  persona,
  mochila,
  maletin,
  maleta,
  silla,
  auto,
  autobus,
  vagon,
  trailer,
  avion,
  casa,
  porteria,
  basquetbol,
  alberca,
  futbol,
} satisfies Record<string, ReferenceSpec>;

export type ReferenceId = keyof typeof REFERENCES;

// The set the Sala temporal shows for any typed amount: today's street scene.
export const TEMPORAL_REFERENCES: ReferenceId[] = ['persona', 'auto', 'casa'];

// One room's references, built at the positions the room planner chose for them.
export class References {
  readonly group = new THREE.Group();
  readonly rects: Rect[] = [];

  constructor(ids: ReferenceId[], positions: Point[], anisotropy: number) {
    ids.forEach((id, i) => this.place(REFERENCES[id].build(anisotropy), positions[i]));
  }

  dispose() {
    disposeObject(this.group);
  }

  private place(item: Reference, { x, z }: Point) {
    item.object.position.set(x, 0, z);
    castShadows(item.object);
    this.group.add(item.object);

    if (item.label) {
      const size = item.labelSize ?? 0.35;
      const label = makeLabel(item.label, size);
      label.position.set(x, (item.labelHeight ?? 0) + size * 1.7, z);
      this.group.add(label);
    }

    const shift = (r: Rect) => ({ minX: x + r.minX, maxX: x + r.maxX, minZ: z + r.minZ, maxZ: z + r.maxZ });
    this.rects.push(...item.solids.map(shift));
  }
}

function castShadows(object: THREE.Object3D) {
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.receiveShadow = true;
    // See-through things (the goal net) would cast a solid shadow, so they don't cast at all.
    o.castShadow = !(o.material as THREE.Material).transparent;
  });
}
