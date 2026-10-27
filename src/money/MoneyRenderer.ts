import * as THREE from 'three';
import { PALLET_BASE, unitSizes, type Layout, type Placement, type Size, type UnitKind } from './layout';
import type { Denomination } from './denominations';
import { billFace, palletSide, paperEdge, repeated } from './textures';

const DROP_DURATION = 0.7; // seconds for one unit to fall
const STAGGER = 1.4; // seconds between the first and last unit starting to fall

// BoxGeometry takes one material per face, in this order: +X, -X, +Y (top), -Y, +Z, -Z.
type FaceMaterials = THREE.Material[];

interface Animated {
  mesh: THREE.InstancedMesh;
  list: Placement[];
  size: Size;
  delays: Float32Array;
  dropHeight: number;
}

// Draws a Layout with one InstancedMesh per kind of unit: one geometry + one material
// set, N positions. The GPU draws all N copies in a single draw call.
export class MoneyRenderer {
  readonly group = new THREE.Group();
  private readonly materials: Record<UnitKind, FaceMaterials>;
  private readonly tableMaterial = new THREE.MeshStandardMaterial({ color: 0x5a4a3a });
  private readonly matrix = new THREE.Matrix4();
  private animated: Animated[] = [];
  private time = 0;

  constructor(bill: Denomination, anisotropy: number) {
    this.materials = createMaterials(bill, anisotropy);
  }

  show(layout: Layout) {
    this.clear();
    const { sizes, placements } = layout;
    const depth = Math.max(1, -layout.bounds.minZ);

    for (const kind of ['bloque', 'tarima', 'paquete', 'fajo', 'billete'] as UnitKind[]) {
      const list = placements[kind];
      if (list.length === 0) continue;
      const size = sizes[kind];
      const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(size.w, size.h, size.d),
        this.materials[kind],
        list.length,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false; // instances move during the drop; re-enabled when it ends

      // Units near the entrance land first, then a wave rolls toward the back.
      const delays = new Float32Array(list.length);
      list.forEach((p, i) => {
        const jitter = ((i * 2654435761) % 1000) / 1000; // cheap deterministic "random"
        delays[i] = (-p.z / depth) * STAGGER + jitter * 0.15 + p.y * 0.3; // higher units land later
      });

      this.animated.push({ mesh, list, size, delays, dropHeight: 3 + size.h * 2 });
      this.group.add(mesh);
    }

    if (layout.table) {
      const t = layout.table;
      const table = new THREE.Mesh(
        new THREE.BoxGeometry(t.maxX - t.minX, t.height, t.maxZ - t.minZ),
        this.tableMaterial,
      );
      table.position.set((t.minX + t.maxX) / 2, t.height / 2, (t.minZ + t.maxZ) / 2);
      table.castShadow = table.receiveShadow = true;
      this.group.add(table);
    }

    this.time = 0;
    this.update(0);
  }

  // Called every frame by the render loop.
  update(dt: number) {
    if (this.animated.length === 0) return;
    this.time += dt;
    let running = false;

    for (const a of this.animated) {
      a.list.forEach((p, i) => {
        const t = THREE.MathUtils.clamp((this.time - a.delays[i]) / DROP_DURATION, 0, 1);
        if (t < 1) running = true;
        const lift = (1 - easeOutBounce(t)) * a.dropHeight;
        // Placements are bottom-centers; a box's position is its center, so lift by half its height.
        this.matrix.makeTranslation(p.x, p.y + a.size.h / 2 + lift, p.z);
        a.mesh.setMatrixAt(i, this.matrix);
      });
      a.mesh.instanceMatrix.needsUpdate = true; // re-upload the matrices to the GPU
    }

    if (!running) {
      for (const a of this.animated) {
        a.mesh.computeBoundingSphere();
        a.mesh.frustumCulled = true;
      }
      this.animated = [];
    }
  }

  // Footprints of everything solid, for collision.
  obstacles(layout: Layout) {
    const rects = [];
    const footprint = (p: Placement, s: Size) => ({
      minX: p.x - s.w / 2,
      maxX: p.x + s.w / 2,
      minZ: p.z - s.d / 2,
      maxZ: p.z + s.d / 2,
    });
    for (const kind of ['tarima', 'bloque'] as UnitKind[]) {
      for (const p of layout.placements[kind]) {
        if (p.y === 0) rects.push(footprint(p, layout.sizes[kind])); // stacked ones share a footprint
      }
    }
    if (layout.table) rects.push(layout.table);
    return rects;
  }

  private clear() {
    this.animated = [];
    for (const child of [...this.group.children]) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose(); // materials are shared between rebuilds, so they stay
      if (mesh instanceof THREE.InstancedMesh) mesh.dispose();
      this.group.remove(mesh);
    }
  }
}

function createMaterials(bill: Denomination, anisotropy: number): Record<UnitKind, FaceMaterials> {
  const sizes = unitSizes(bill);
  const stacksX = Math.floor(PALLET_BASE.w / bill.length);
  const stacksZ = Math.floor(PALLET_BASE.d / bill.width);
  const woodFraction = PALLET_BASE.h / sizes.tarima.h;

  const mat = (map: THREE.Texture) => {
    map.anisotropy = anisotropy; // keeps textures sharp on surfaces seen at a grazing angle
    return new THREE.MeshStandardMaterial({ map, roughness: 0.85 });
  };
  const plain = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 });

  const face = billFace(false);
  const bandFace = billFace(true);
  const edge = paperEdge(false);
  const bandEdge = paperEdge(true);
  const sideAlongX = palletSide(stacksX, woodFraction); // the faces facing ±Z span X
  const sideAlongZ = palletSide(stacksZ, woodFraction);
  const wood = plain(0x5e4429);

  const B = { cols: sizes.bloque.w / PALLET_BASE.w, rows: sizes.bloque.d / PALLET_BASE.d, levels: sizes.bloque.h / sizes.tarima.h };

  const fajoSides = [mat(edge), mat(edge), mat(bandFace), mat(bandFace), mat(bandEdge), mat(bandEdge)];
  const paqueteEdge = mat(repeated(edge, 1, 20));
  const paqueteBandEdge = mat(repeated(bandEdge, 1, 20));
  const palletZ = mat(sideAlongZ);
  const palletX = mat(sideAlongX);
  const bloqueZ = mat(repeated(sideAlongZ, B.rows, B.levels));
  const bloqueX = mat(repeated(sideAlongX, B.cols, B.levels));

  return {
    billete: [plain(bill.color), plain(bill.color), mat(face), mat(face), plain(bill.color), plain(bill.color)],
    fajo: fajoSides,
    paquete: [paqueteEdge, paqueteEdge, fajoSides[2], fajoSides[3], paqueteBandEdge, paqueteBandEdge],
    tarima: [palletZ, palletZ, mat(repeated(face, stacksX, stacksZ)), wood, palletX, palletX],
    bloque: [
      bloqueZ,
      bloqueZ,
      mat(repeated(face, stacksX * B.cols, stacksZ * B.rows)),
      wood,
      bloqueX,
      bloqueX,
    ],
  };
}

// Same idea as a CSS easing curve: maps linear time 0→1 to a bouncy landing.
function easeOutBounce(t: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
}
