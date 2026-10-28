import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Rect } from '../money/layout';
import type { Builder } from './Architecture';

// Jardines secos: agaves, órganos and mezquites on gravel beds, with a few volcanic boulders.
// Each kind of plant is one geometry built once, drawn with one InstancedMesh per garden.

type Kind = 'agave' | 'organo' | 'tronco' | 'copa' | 'roca';

const COLORS: Record<Kind, number> = {
  agave: 0x7c9a86, // blue-green maguey
  organo: 0x4f6b45,
  tronco: 0x4a3a2c,
  copa: 0x6d7a45, // mezquite's small olive leaves
  roca: 0x3a3734,
};

// How much floor each one blocks, as a half-width.
const SOLID: Partial<Record<Kind, number>> = { agave: 0.6, organo: 0.35, tronco: 0.3, roca: 0.5 };

let geometries: Record<Kind, THREE.BufferGeometry> | null = null;
const materials = new Map<Kind, THREE.MeshStandardMaterial>();

function shapes(): Record<Kind, THREE.BufferGeometry> {
  if (geometries) return geometries;

  // A rosette of thick pointed leaves, each a flattened cone leaning out.
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 14; i++) {
    const length = 0.7 + (i % 3) * 0.15;
    const leaf = new THREE.ConeGeometry(0.09, length, 4);
    leaf.scale(1, 1, 0.35);
    leaf.translate(0, length / 2, 0);
    leaf.rotateZ(i < 5 ? 0.3 : i < 10 ? 0.75 : 1.15);
    leaf.rotateY((i * 2.4) % (Math.PI * 2));
    leaves.push(leaf.toNonIndexed());
  }

  // Órgano: a cluster of upright ribbed columns of different heights.
  const stems: THREE.BufferGeometry[] = [];
  [[0, 0, 3.2], [0.32, 0.1, 2.4], [-0.28, 0.18, 2.8], [0.08, -0.32, 1.9]].forEach(([x, z, h]) => {
    const stem = new THREE.CylinderGeometry(0.14, 0.16, h, 8);
    stem.translate(x, h / 2, z);
    const cap = new THREE.SphereGeometry(0.14, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.translate(x, h, z);
    stems.push(stem.toNonIndexed(), cap.toNonIndexed());
  });

  // Mezquite: a low, twisted trunk splitting in three, under a wide flat crown.
  const limbs: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.14, 0.2, 1.4, 6);
  trunk.translate(0, 0.7, 0);
  limbs.push(trunk.toNonIndexed());
  for (let i = 0; i < 3; i++) {
    const limb = new THREE.CylinderGeometry(0.06, 0.1, 1.8, 5);
    limb.translate(0, 0.9, 0);
    limb.rotateZ(0.7);
    limb.rotateY(i * 2.1);
    limb.translate(0, 1.3, 0);
    limbs.push(limb.toNonIndexed());
  }
  const crown: THREE.BufferGeometry[] = [];
  [[0, 0, 1.6], [1.2, 0.4, 1.2], [-1.1, 0.6, 1.3], [0.3, -1.2, 1.1], [-0.4, 1.3, 1]].forEach(([x, z, r]) => {
    const puff = new THREE.IcosahedronGeometry(r, 0);
    puff.scale(1, 0.45, 1);
    puff.translate(x, 2.6 + Math.abs(x) * 0.15, z);
    crown.push(puff.toNonIndexed());
  });

  const rock = new THREE.DodecahedronGeometry(0.5, 0);
  rock.scale(1, 0.6, 0.8);
  rock.translate(0, 0.2, 0);

  geometries = {
    agave: mergeGeometries(leaves),
    organo: mergeGeometries(stems),
    tronco: mergeGeometries(limbs),
    copa: mergeGeometries(crown),
    roca: rock.toNonIndexed(),
  };
  for (const g of Object.values(geometries)) g.computeVertexNormals();
  return geometries;
}

function materialFor(kind: Kind) {
  let m = materials.get(kind);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: COLORS[kind], roughness: 0.9, flatShading: true });
    m.userData.shared = true;
    materials.set(kind, m);
  }
  return m;
}

// A tiny seeded random generator, so every visit grows the same garden.
function random(seed: string) {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

interface Plant {
  kind: Kind;
  x: number;
  z: number;
  scale: number;
  yaw: number;
}

// A dry garden on `bed`: gravel, a cantera edge, one mezquite and agaves, órganos and rocks
// around it. The bed's footprint goes into the builder; the plants come back as one group.
export function garden(b: Builder, bed: Rect, seed: string, rects: Rect[]): THREE.Group {
  const rand = random(seed);
  const plants: Plant[] = [];
  const cx = (bed.minX + bed.maxX) / 2;
  const cz = (bed.minZ + bed.maxZ) / 2;

  b.box('grava', bed.minX, bed.maxX, 0, 0.04, bed.minZ, bed.maxZ);
  b.box('cantera', bed.minX - 0.25, bed.maxX + 0.25, 0, 0.12, bed.minZ - 0.25, bed.minZ);
  b.box('cantera', bed.minX - 0.25, bed.maxX + 0.25, 0, 0.12, bed.maxZ, bed.maxZ + 0.25);
  b.box('cantera', bed.minX - 0.25, bed.minX, 0, 0.12, bed.minZ, bed.maxZ);
  b.box('cantera', bed.maxX, bed.maxX + 0.25, 0, 0.12, bed.minZ, bed.maxZ);

  const add = (kind: Kind, x: number, z: number, scale = 1) => {
    const r = (SOLID[kind] ?? 0) * scale;
    const clear = plants.every((p) => Math.hypot(p.x - x, p.z - z) > r + (SOLID[p.kind] ?? 0) * p.scale + 0.2);
    if (!clear) return;
    plants.push({ kind, x, z, scale, yaw: rand() * Math.PI * 2 });
  };
  add('tronco', cx, cz, 1);
  const inside = (margin: number) => ({
    x: bed.minX + margin + rand() * (bed.maxX - bed.minX - margin * 2),
    z: bed.minZ + margin + rand() * (bed.maxZ - bed.minZ - margin * 2),
  });
  const area = (bed.maxX - bed.minX) * (bed.maxZ - bed.minZ);
  for (let i = 0; i < area / 2.5; i++) {
    const p = inside(0.7);
    const roll = rand();
    if (Math.hypot(p.x - cx, p.z - cz) < 1.2) continue; // the mezquite's trunk
    if (roll < 0.55) add('agave', p.x, p.z, 0.7 + rand() * 0.6);
    else if (roll < 0.8) add('organo', p.x, p.z, 0.7 + rand() * 0.5);
    else add('roca', p.x, p.z, 0.6 + rand() * 1.2);
  }

  const group = new THREE.Group();
  const geometry = shapes();
  const matrix = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (const kind of ['agave', 'organo', 'tronco', 'roca'] as Kind[]) {
    const list = plants.filter((p) => p.kind === kind);
    if (list.length === 0) continue;
    const parts: Kind[] = kind === 'tronco' ? ['tronco', 'copa'] : [kind];
    for (const part of parts) {
      const mesh = new THREE.InstancedMesh(geometry[part], materialFor(part), list.length);
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.yaw);
        mesh.setMatrixAt(i, matrix.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale)));
      });
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      // The geometry is shared by every garden; disposing one garden mustn't take it from the rest.
      mesh.userData.sharedGeometry = true;
      group.add(mesh);
    }
  }
  for (const p of plants) {
    const r = (SOLID[p.kind] ?? 0) * p.scale;
    if (r > 0) rects.push({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
  }
  return group;
}
