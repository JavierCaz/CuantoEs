import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Rect } from '../money/layout';
import { RULER, type Space } from '../museum/complex';
import { WALL_THICKNESS } from '../museum/rooms';
import { material, tileOf, type MaterialName } from './materials';

// The building itself, from a kit of modular pieces: slabs, walls, portals, columns, benches.
// Every piece is an axis-aligned box in world coordinates with UVs in meters, so all the pieces
// of one material merge into a single mesh: a whole space costs a handful of draw calls.

const T = WALL_THICKNESS;
const SKYLIGHT = 1.4; // width of a longitudinal skylight slot
const SKYLIGHT_SPACING = 9;
const OCULUS = 4;
const COLUMN = 0.9;
const COLUMN_SPACING = 9;
const SLAB = 0.6; // roof thickness
const BENCH = { w: 2.4, d: 0.6, h: 0.45 };

export class Builder {
  private parts = new Map<MaterialName, THREE.BufferGeometry[]>();
  readonly rects: Rect[] = []; // what you can't walk through

  box(name: MaterialName, minX: number, maxX: number, minY: number, maxY: number, minZ: number, maxZ: number, solid = false) {
    if (maxX - minX < 1e-3 || maxY - minY < 1e-3 || maxZ - minZ < 1e-3) return;
    const g = new THREE.BoxGeometry(maxX - minX, maxY - minY, maxZ - minZ);
    g.translate((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    worldUVs(g, tileOf(material(name)));
    const list = this.parts.get(name) ?? [];
    list.push(g);
    this.parts.set(name, list);
    if (solid) this.rects.push({ minX, maxX, minZ, maxZ });
  }

  build(): THREE.Group {
    const group = new THREE.Group();
    for (const [name, geometries] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries), material(name));
      for (const g of geometries) g.dispose();
      mesh.castShadow = name !== 'agua' && name !== 'grava';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

// Box UVs measured in meters across each face, divided by the texture's tile size: textures keep
// their real scale on a 2 m bench and on a 200 m wall alike.
function worldUVs(g: THREE.BufferGeometry, [tu, tv]: [number, number]) {
  const pos = g.attributes.position;
  const normal = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = [pos.getX(i), pos.getY(i), pos.getZ(i)];
    const [nx, ny] = [Math.abs(normal.getX(i)), Math.abs(normal.getY(i))];
    if (nx > 0.5) uv.setXY(i, z / tu, y / tv);
    else if (ny > 0.5) uv.setXY(i, x / tu, z / tv);
    else uv.setXY(i, x / tu, y / tv);
  }
}

// One space's shell: floor, walls with their portals, roof, and the fittings of its kind.
export function buildSpace(b: Builder, space: Space, next: Space | undefined) {
  const { area, wallHeight: H, kind } = space;
  const { minX, maxX, minZ, maxZ } = area;
  const outdoors = kind === 'plaza' || kind === 'patio' || kind === 'reflexion';

  b.box(outdoors ? 'volcanica' : 'pulido', minX - T / 2, maxX + T / 2, -0.3, 0, minZ - T / 2, maxZ + T / 2);

  // Front and back walls, broken by the portals on the axis, with a lintel over each.
  const across = (z: number, portal: Space['front']) => {
    if (!portal) return b.box('concreto', minX - T / 2, maxX + T / 2, 0, H, z - T / 2, z + T / 2);
    const w = portal.width / 2;
    b.box('concreto', minX - T / 2, -w, 0, H, z - T / 2, z + T / 2);
    b.box('concreto', w, maxX + T / 2, 0, H, z - T / 2, z + T / 2);
    b.box('concreto', -w, w, portal.height, H, z - T / 2, z + T / 2);
  };
  across(maxZ, space.front);
  across(minZ, space.back);
  // Side walls; in each patio one of them is painted terracota, as in Barragán's courtyards.
  b.box(kind === 'patio' ? 'terracota' : 'concreto', minX - T / 2, minX + T / 2, 0, H, minZ + T / 2, maxZ - T / 2);
  b.box('concreto', maxX - T / 2, maxX + T / 2, 0, H, minZ + T / 2, maxZ - T / 2);

  if (space.roof === 'tragaluces') skylightRoof(b, area, H);
  if (space.roof === 'oculo') oculusRoof(b, area, H);
  if (space.roof === 'tragaluces' && kind === 'sala') columns(b, area, H);

  if (kind === 'vestibulo') {
    for (const { plinth: p } of RULER) {
      if (p) b.box('cantera', p.minX, p.maxX, 0, p.height, space.origin.z + p.minZ, space.origin.z + p.maxZ, true);
    }
  }
  if (kind === 'patio') {
    // Benches before the sala's stele (see Museum), the dry garden across the axis.
    bench(b, -5.5, (minZ + maxZ) / 2 + 3.5, 'x');
    bench(b, -5.5, (minZ + maxZ) / 2 - 3.5, 'x');
  }
  if (kind === 'reflexion') {
    // An espejo de agua off the axis, a cantera curb around it, benches facing it.
    const pool = { minX: 3.5, maxX: 10, minZ: minZ + 5, maxZ: maxZ - 7 };
    b.box('cantera', pool.minX - 0.3, pool.maxX + 0.3, 0, 0.35, pool.minZ - 0.3, pool.maxZ + 0.3, true);
    b.box('agua', pool.minX, pool.maxX, 0.35, 0.37, pool.minZ, pool.maxZ);
    for (const z of [pool.minZ + 3, pool.maxZ - 3]) bench(b, 2, z, 'z');
  }
  if (kind === 'sala') bench(b, -4, space.spawn.z + 1.5, 'x');

  if (next && space.back) passage(b, space.back, area.minZ, next.area.maxZ, Math.min(H, next.wallHeight));
}

// A deep portal of cantera between two spaces: side walls, a ceiling and a threshold.
function passage(b: Builder, portal: NonNullable<Space['back']>, fromZ: number, toZ: number, height: number) {
  const w = portal.width / 2;
  const top = Math.max(portal.height + 1.2, Math.min(height, portal.height + 3));
  b.box('cantera', -w - T, -w, 0, top, toZ + T / 2, fromZ - T / 2, true);
  b.box('cantera', w, w + T, 0, top, toZ + T / 2, fromZ - T / 2, true);
  b.box('cantera', -w - T, w + T, portal.height, top, toZ + T / 2, fromZ - T / 2);
  b.box('cantera', -w, w, -0.3, 0.02, toZ - T / 2, fromZ + T / 2);
}

// A flat concrete roof cut by skylights running the length of the hall: bands of sun move across
// the floor through the day, and the hall gets the pronounced shadows of a nave.
function skylightRoof(b: Builder, area: Rect, H: number) {
  const width = area.maxX - area.minX;
  const slots = Math.max(1, Math.round(width / SKYLIGHT_SPACING));
  const step = width / slots;
  let from = area.minX - T / 2;
  for (let i = 0; i < slots; i++) {
    const center = area.minX + step * (i + 0.5);
    b.box('concreto', from, center - SKYLIGHT / 2, H, H + SLAB, area.minZ - T / 2, area.maxZ + T / 2);
    // Deep beams across the slot every few meters, so the light falls in bars.
    for (let z = area.maxZ - 3; z > area.minZ + 1; z -= 3) {
      b.box('concreto', center - SKYLIGHT / 2, center + SKYLIGHT / 2, H - 0.4, H + SLAB, z - 0.15, z + 0.15);
    }
    from = center + SKYLIGHT / 2;
  }
  b.box('concreto', from, area.maxX + T / 2, H, H + SLAB, area.minZ - T / 2, area.maxZ + T / 2);
}

// A roof with a square opening in the middle: a single shaft of light in the vestíbulo.
function oculusRoof(b: Builder, area: Rect, H: number) {
  const cx = (area.minX + area.maxX) / 2;
  const cz = (area.minZ + area.maxZ) / 2;
  const o = OCULUS / 2;
  const [x0, x1, z0, z1] = [area.minX - T / 2, area.maxX + T / 2, area.minZ - T / 2, area.maxZ + T / 2];
  b.box('concreto', x0, x1, H, H + SLAB, z0, cz - o);
  b.box('concreto', x0, x1, H, H + SLAB, cz + o, z1);
  b.box('concreto', x0, cx - o, H, H + SLAB, cz - o, cz + o);
  b.box('concreto', cx + o, x1, H, H + SLAB, cz - o, cz + o);
}

// Free-standing columns down both sides of a nave, clear of the exhibit (see SIDE_MARGIN).
function columns(b: Builder, area: Rect, H: number) {
  const inset = 1.6;
  for (let z = area.maxZ - 6; z > area.minZ + 3; z -= COLUMN_SPACING) {
    for (const x of [area.minX + inset, area.maxX - inset]) {
      b.box('concreto', x - COLUMN / 2, x + COLUMN / 2, 0, H, z - COLUMN / 2, z + COLUMN / 2, true);
    }
  }
}

// A wooden bench on two cantera blocks, its long side along X or Z.
function bench(b: Builder, x: number, z: number, along: 'x' | 'z') {
  const [w, d] = along === 'x' ? [BENCH.w, BENCH.d] : [BENCH.d, BENCH.w];
  const leg = 0.3;
  for (const s of [-1, 1]) {
    const lx = along === 'x' ? x + s * (w / 2 - leg) : x;
    const lz = along === 'z' ? z + s * (d / 2 - leg) : z;
    const [hw, hd] = along === 'x' ? [leg / 2, d / 2 - 0.05] : [w / 2 - 0.05, leg / 2];
    b.box('cantera', lx - hw, lx + hw, 0, BENCH.h - 0.08, lz - hd, lz + hd);
  }
  b.box('madera', x - w / 2, x + w / 2, BENCH.h - 0.08, BENCH.h, z - d / 2, z + d / 2, true);
}
