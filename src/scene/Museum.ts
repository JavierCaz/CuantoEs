import * as THREE from 'three';
import { DEFAULT_BILL } from '../money/denominations';
import type { Layout, Rect } from '../money/layout';
import { MoneyRenderer, moneyObstacles } from '../money/MoneyRenderer';
import { formatMXN, shortAmount } from '../i18n/format';
import { GROUPED_ROOMS, GRUPOS, PRESETS, ROOMS, SALAS, TIPOS, comparisonsFor, salaOf, type Preset } from '../museum/collection';
import { CEDULA, GATE_AHEAD, PAD_SIZE, RULER, cedulaSides, padAt, type Complex, type Space } from '../museum/complex';
import type { Point } from '../museum/referenceLayout';
import { WALL_THICKNESS } from '../museum/rooms';
import { Collider } from '../controls/collision';
import { Builder, buildSpace } from './Architecture';
import { disposeObject } from './dispose';
import { CARBON, DORADO, VERDE } from './palette';
import { References, type ReferenceId } from './references';
import { ACCENT, MUTED, Signs, type Line } from './Signage';
import { garden } from './Vegetation';

// The whole museum in the scene. The building is merged into a few meshes and always drawn;
// what's inside each space (money, references, signs, gardens) is drawn only near you, and the
// money only drops into place the first time its space comes into view.
//
// A hall holds one variant per exhibit in its group (money, references, title gate and cédula),
// one of them on show: its pads switch which, and only the variant on show is solid.

const T = WALL_THICKNESS;
const AHEAD = 2; // spaces drawn ahead of the one you're in: you see down the axis through the portals
const BEHIND = 1;
const PAD_TOP = 0.03; // the pads stand just proud of the floor, like a slab you step up onto

// One exhibit of a space: what's drawn while it's on show, and what's solid.
interface Variant {
  layout: Layout;
  group: THREE.Group;
  rects: Rect[];
}

interface Part {
  space: Space;
  contents: THREE.Group;
  money: MoneyRenderer | null; // one renderer per space, redrawn for whichever variant is on show
  variants: Variant[];
  active: number;
  pads: THREE.Mesh[];
  shown: boolean;
}

export class Museum {
  readonly group = new THREE.Group();
  readonly collider: Collider;
  private readonly parts: Part[];
  private readonly padMaterials = {
    idle: new THREE.MeshStandardMaterial({ color: VERDE, roughness: 0.6 }),
    active: new THREE.MeshStandardMaterial({ color: DORADO, emissive: DORADO, emissiveIntensity: 0.35, roughness: 0.4 }),
  };

  // `choices`: which exhibit each group shows, by group id → preset id; the smallest by default.
  constructor(
    readonly complex: Complex,
    private readonly options: { anisotropy: number; reducedMotion: boolean; choices: Record<string, string> },
  ) {
    const builder = new Builder();
    const { spaces } = complex;
    const rects: Rect[] = [];
    this.parts = spaces.map((space, i) => {
      buildSpace(builder, space, spaces[i + 1]);
      return this.furnish(builder, space, spaces[i + 1], rects);
    });
    this.group.add(builder.build(), ...this.parts.map((p) => p.contents));
    rects.push(...complex.walls, ...builder.rects);
    this.collider = new Collider([...rects, ...this.parts.flatMap((p) => p.variants[p.active]?.rects ?? [])]);
  }

  // Draw the spaces around the one you're in, and drop in any money seen for the first time.
  focus(index: number) {
    this.parts.forEach((part, i) => {
      part.contents.visible = i >= index - BEHIND && i <= index + AHEAD;
      if (!part.contents.visible || part.shown) return;
      part.shown = true;
      this.drop(part);
    });
  }

  // The exhibit on show in a hall, if it's one of the collection's.
  presetAt(index: number): Preset | undefined {
    const { space, active } = this.parts[index];
    return space.rooms ? ROOMS[space.rooms[active]] : undefined;
  }

  layoutAt(index: number): Layout | undefined {
    const part = this.parts[index];
    return part.variants[part.active]?.layout;
  }

  // The exhibit whose pad you're standing on, if any.
  padAt(index: number, p: Point): number | null {
    return padAt(this.parts[index].space, p)?.exhibit ?? null;
  }

  // Put another exhibit of the hall on show: it becomes solid and drops in, the last one goes.
  select(index: number, exhibit: number): boolean {
    const part = this.parts[index];
    if (exhibit === part.active || !part.variants[exhibit]) return false;
    const before = part.variants[part.active];
    const after = part.variants[exhibit];
    before.group.visible = false;
    this.collider.remove(before.rects);
    after.group.visible = true;
    this.collider.add(after.rects);
    part.active = exhibit;
    part.pads.forEach((pad, i) => (pad.material = i === exhibit ? this.padMaterials.active : this.padMaterials.idle));
    if (part.shown) this.drop(part);
    return true;
  }

  update(dt: number) {
    for (const part of this.parts) if (part.shown) part.money?.update(dt);
  }

  dispose() {
    disposeObject(this.group);
  }

  private drop(part: Part) {
    const variant = part.variants[part.active];
    if (part.money && variant) part.money.show(variant.layout, !this.options.reducedMotion);
  }

  private furnish(builder: Builder, space: Space, next: Space | undefined, rects: Rect[]): Part {
    const contents = new THREE.Group();
    contents.visible = false;
    const signs = new Signs();
    contents.add(signs.group);

    const choice = space.grupo ? this.options.choices[space.grupo] : undefined;
    const active = Math.max(0, space.rooms?.findIndex((i) => ROOMS[i].id === choice) ?? 0);

    let money: MoneyRenderer | null = null;
    if (space.exhibits.length) {
      money = new MoneyRenderer(DEFAULT_BILL, this.options.anisotropy);
      const { origin } = space.exhibits[0]; // a hall's exhibits all start at its entrance
      money.group.position.set(origin.x, 0, origin.z);
      contents.add(money.group);
    }

    const variants = space.exhibits.map((exhibit, i): Variant => {
      const group = new THREE.Group();
      group.visible = i === active;
      contents.add(group);
      const shift = (r: Rect) => ({ minX: r.minX + exhibit.origin.x, maxX: r.maxX + exhibit.origin.x, minZ: r.minZ + exhibit.origin.z, maxZ: r.maxZ + exhibit.origin.z });
      const solid = moneyObstacles(exhibit.layout).map(shift);
      if (exhibit.references.length) {
        const references = new References(
          exhibit.references.map((r) => r.id as ReferenceId),
          exhibit.references.map((r) => r.at),
          this.options.anisotropy,
        );
        group.add(references.group);
        solid.push(...references.rects);
      }
      if (space.rooms) {
        const own = new Signs();
        hallSigns(own, space, i);
        group.add(own.group);
        solid.push(...own.rects);
      }
      return { layout: exhibit.layout, group, rects: solid };
    });

    const pads = (space.pads ?? []).map((pad) => {
      const { minX, maxX, minZ, maxZ } = pad.rect;
      builder.box('cantera', minX - 0.08, maxX + 0.08, 0, PAD_TOP - 0.005, minZ - 0.08, maxZ + 0.08);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(maxX - minX, 0.01, maxZ - minZ), pad.exhibit === active ? this.padMaterials.active : this.padMaterials.idle);
      mesh.position.set((minX + maxX) / 2, PAD_TOP, (minZ + maxZ) / 2);
      mesh.receiveShadow = true;
      contents.add(mesh);
      // Its label lies on the floor just before it, read as you walk up.
      const preset = ROOMS[space.rooms![pad.exhibit]];
      signs.floor({ x: (minX + maxX) / 2, z: maxZ + 0.12 }, PAD_SIZE + 0.16, [
        { text: preset.titulo, size: 0.15, bold: true, wrap: true },
        { text: shortAmount(preset.monto), size: 0.16, color: ACCENT, bold: true },
      ]);
      return mesh;
    });

    const plants: Rect[] = [];
    for (const bed of gardens(space)) contents.add(garden(builder, bed, `${space.id}:${bed.minX}`, plants));
    rects.push(...plants);

    furnishings[space.kind](signs, builder, space);
    if (next && space.back) overPortal(signs, space, next);
    signs.arrows(space.path);
    rects.push(...signs.rects);
    return { space, contents, money, variants, active, pads, shown: false };
  }
}

// ---------- What each kind of space holds ----------

const cz = (s: Space) => (s.area.minZ + s.area.maxZ) / 2;
const towardX = { x: 1, z: 0 };
const towardMinusX = { x: -1, z: 0 };
const towardZ = { x: 0, z: 1 };

function gardens(space: Space): Rect[] {
  const { minX, maxX, minZ, maxZ } = space.area;
  switch (space.kind) {
    case 'plaza':
      return [
        { minX: minX + 2, maxX: -4.5, minZ: minZ + 3, maxZ: maxZ - 10 },
        { minX: 4.5, maxX: maxX - 2, minZ: minZ + 3, maxZ: maxZ - 10 },
      ];
    case 'patio':
      // Low planting under the sala's directory, kept off the back wall so it doesn't hide it.
      return [{ minX: 3.5, maxX: maxX - 1, minZ: minZ + 3.5, maxZ: maxZ - 2 }];
    case 'reflexion':
      // Toward the entrance, clear of the sources on the same wall.
      return [{ minX: minX + 1.5, maxX: -4, minZ: maxZ - 9, maxZ: maxZ - 3 }];
    default:
      return [];
  }
}

type Furnish = (signs: Signs, builder: Builder, space: Space) => void;

const furnishings: Record<Space['kind'], Furnish> = {
  plaza(signs, _, space) {
    // The name, cut into the concrete over the monumental portal.
    signs.onWall({ x: 0, z: space.area.minZ + T / 2 }, 9.8, towardZ, 16, [{ text: '¿Cuánto es?', size: 2.4, color: CARBON, bold: true }], {
      background: null,
    });
    signs.post({ x: 2.8, z: space.spawn.z - 3 }, towardZ, 2.2, [
      { text: 'CÓMO RECORRER EL MUSEO', size: 0.09, color: ACCENT, bold: true },
      { text: 'De lo cotidiano a lo monumental', size: 0.15, bold: true, wrap: true },
      {
        text: 'Cada sala muestra cifras reales en billetes de $500, junto a objetos conocidos a escala real. Sigue el eje a través de los pórticos; donde haya varias cifras, pisa una losa para elegir cuál ver.',
        size: 0.075,
        wrap: true,
      },
      { text: 'W A S D o joystick · doble W para correr · V vista aérea · M música', size: 0.065, color: MUTED, wrap: true },
    ]);
    // The route ahead, on the left wall by the entrance: every stop, in order.
    signs.onWall({ x: space.area.minX + T / 2, z: space.area.maxZ - 4 }, 1.2, towardX, 4.4, [
      { text: 'EL RECORRIDO', size: 0.12, color: ACCENT, bold: true },
      { text: 'Vestíbulo · cómo leer el museo', size: 0.13 },
      ...SALAS.map((sala, i): Line => ({ text: `Sala ${i + 1} · ${sala.nombre} — ${sala.escala}`, size: 0.13, bold: true })),
      { text: 'Patio de reflexión · fuentes y salida', size: 0.13 },
    ], { align: 'left', pad: 0.3 });
  },

  vestibulo(signs, _, space) {
    // A label over each step of the ruler; the first one also gives the bill's real size.
    RULER.forEach((step, i) => {
      signs.onWall({ x: space.area.minX + T / 2, z: space.origin.z + step.z }, 1.7, towardX, 2.2, [
        { text: formatMXN(step.amount), size: 0.2, bold: true },
        { text: step.caption, size: 0.085 },
        { text: i === 0 ? '14.8 × 6.5 cm, una décima de milímetro de grueso' : '× 10', size: 0.075, color: i === 0 ? MUTED : ACCENT, bold: i > 0 },
      ]);
    });
    signs.onWall({ x: space.area.maxX - T / 2, z: cz(space) }, 1.1, towardMinusX, 5.2, [
      { text: 'CÓMO LEER EL MUSEO', size: 0.12, color: ACCENT, bold: true },
      { text: 'Todo el dinero está en billetes de $500, el de mayor denominación: así ocupa el menor espacio posible.', size: 0.12, wrap: true },
      { text: 'En el muro de enfrente, cada paso vale diez veces el anterior: de un billete a una tarima de un millón de billetes, $500 millones. Las salas grandes empiezan ahí.', size: 0.12, wrap: true },
      { text: 'Junto al dinero hay objetos conocidos a escala real: una persona de 1.70 m, autos, casas, canchas. El piso de las salas está hecho de losas de 1 m.', size: 0.12, wrap: true },
      { text: 'Las cifras están en pesos corrientes del año indicado, sin ajustar por inflación. Cada sala dice si es un presupuesto aprobado, una cifra oficial, una estimación o un cálculo del museo.', size: 0.1, color: MUTED, wrap: true },
    ]);
  },

  patio(signs, builder, space) {
    const sala = SALAS.find((s) => s.id === space.sala)!;
    const n = SALAS.indexOf(sala) + 1;
    const count = ROOMS.filter((r) => r.sala === sala.id).length;
    // A freestanding concrete stele with the sala's name, beside the axis.
    const z = cz(space);
    builder.box('concreto', -7.2, -2.8, 0, 4.2, z - 0.3, z + 0.3, true);
    signs.onWall({ x: -5, z: z + 0.3 }, 1.2, towardZ, 4, [
      { text: `SALA ${n} DE ${SALAS.length}`, size: 0.14, color: ACCENT, bold: true },
      { text: sala.nombre, size: 0.55, bold: true },
      { text: sala.escala, size: 0.18, color: MUTED },
      { text: sala.descripcion, size: 0.13, wrap: true },
      { text: `${count} ${count === 1 ? 'exposición' : 'exposiciones'}`, size: 0.11, color: MUTED },
    ]);
    // Every figure in it, hall by hall in the order you'll walk them, on the back wall beside the way in.
    const halls = GROUPED_ROOMS.filter((g) => g.grupo.sala === sala.id);
    signs.onWall({ x: 5, z: space.area.minZ + T / 2 }, 1.2, towardZ, 4.4, [
      { text: 'EN ESTA SALA', size: 0.12, color: ACCENT, bold: true },
      ...halls.flatMap(({ grupo, rooms }): Line[] => [
        { text: grupo.nombre, size: 0.14, bold: true },
        ...rooms.map((i): Line => ({ text: `${ROOMS[i].titulo} · ${shortAmount(ROOMS[i].monto)}`, size: 0.1, color: MUTED })),
      ]),
    ], { align: 'left', pad: 0.3 });
  },

  // A hall's signs belong to the exhibit on show: see hallSigns.
  sala() {},

  reflexion(signs, _, space) {
    signs.post({ x: -2.6, z: space.spawn.z - 3 }, towardZ, 2.2, [
      { text: 'FIN DEL RECORRIDO', size: 0.09, color: ACCENT, bold: true },
      { text: 'La arquitectura permanece; las cifras cambian.', size: 0.13, bold: true, wrap: true },
      { text: 'Vuelve a cualquier sala desde el menú, o escribe un monto para abrir la Sala temporal.', size: 0.075, wrap: true },
      { text: '¿Cuánto tiempo necesitarías tú? Escribe tu ingreso mensual en el menú y cada sala te lo dirá.', size: 0.075, color: MUTED, wrap: true },
    ]);
    // Every source in the museum, on the long wall, to check and come back to.
    const lines: Line[] = PRESETS.map((p) => ({ text: `${p.titulo} — ${p.fuente}${p.año ? ` (${p.año})` : ''}`, size: 0.11 }));
    signs.onWall({ x: space.area.minX + T / 2, z: space.area.minZ + 7 }, 1, towardX, 11, [
      { text: 'FUENTES', size: 0.16, color: ACCENT, bold: true },
      ...lines,
    ], { align: 'left', pad: 0.3 });
    // Across the water, the whole climb, sala by sala, from the smallest figure to the largest.
    signs.onWall({ x: space.area.maxX - T / 2, z: space.area.minZ + 10 }, 1.2, towardMinusX, 5, [
      { text: 'LO QUE RECORRISTE', size: 0.12, color: ACCENT, bold: true },
      ...SALAS.flatMap((sala): Line[] => [
        { text: sala.nombre, size: 0.17, bold: true },
        { text: amountsLine(ROOMS.filter((r) => r.sala === sala.id).map((r) => r.monto)), size: 0.12, color: MUTED },
      ]),
      { text: 'Las mismas cifras de las noticias, ahora con tamaño.', size: 0.1, wrap: true },
    ], { align: 'left', pad: 0.3 });
  },

  temporal(signs, _, space) {
    const amount = space.exhibits[0].layout.amount;
    signs.gate({ x: 0, z: space.spawn.z - GATE_AHEAD }, 3.6, [
      { text: 'SALA TEMPORAL', size: 0.13, color: MUTED, bold: true },
      { text: 'Tu monto', size: 0.22, bold: true },
      { text: shortAmount(amount), size: 0.18, color: ACCENT },
      { text: 'Vuelve al museo por el pórtico detrás de ti', size: 0.12, wrap: true },
    ]);
  },
};

// A hall's title gate and cédula, for one of its exhibits.
function hallSigns(signs: Signs, space: Space, exhibit: number) {
  const rooms = space.rooms!;
  const preset = ROOMS[rooms[exhibit]];
  const sala = salaOf(preset);
  const grupo = GRUPOS.find((g) => g.id === space.grupo)!;
  const several = rooms.length > 1;
  signs.gate({ x: 0, z: space.spawn.z - GATE_AHEAD }, 3.8, [
    { text: `SALA ${SALAS.indexOf(sala) + 1} · ${sala.nombre.toUpperCase()}`, size: 0.12, color: MUTED, bold: true },
    { text: `${grupo.nombre.toUpperCase()}${several ? ` · ${exhibit + 1} DE ${rooms.length}` : ''}`, size: 0.1, color: MUTED, bold: true },
    { text: preset.titulo, size: 0.22, bold: true },
    { text: shortAmount(preset.monto), size: 0.18, color: ACCENT },
    { text: preset.pregunta, size: 0.13, wrap: true },
    ...(several ? [{ text: 'Pisa una losa para ver otra cifra', size: 0.1, color: ACCENT }] : []),
  ]);
  // The cédula: what kind of figure it is, what it covers, where it comes from. Beside the gate,
  // ahead of the pads, so it's in view when you step on one.
  const consulted = preset.consulta ? `Consultada el ${new Date(preset.consulta + 'T12:00').toLocaleDateString('es-MX', { dateStyle: 'long' })}` : null;
  const lines: Line[] = [
    { text: TIPOS[preset.tipo].toUpperCase(), size: 0.075, color: ACCENT, bold: true, wrap: true },
    { text: `${formatMXN(preset.monto)}${preset.año ? ` · ${preset.año}` : ''}`, size: 0.1, bold: true },
    { text: preset.descripcion, size: 0.06, wrap: true },
    { text: preset.alcance, size: 0.055, color: MUTED, wrap: true },
    { text: 'PARA COMPARAR', size: 0.06, color: ACCENT, bold: true },
    ...comparisonsFor(preset).map((text) => ({ text, size: 0.06, wrap: true })),
    { text: `Fuente: ${preset.fuente}`, size: 0.05, color: MUTED, wrap: true },
    ...(consulted ? [{ text: consulted, size: 0.05, color: MUTED }] : []),
  ];
  for (const side of cedulaSides(space)) {
    signs.post({ x: side * CEDULA.x, z: space.spawn.z - GATE_AHEAD }, { x: -side * CEDULA.turn, z: 1 }, CEDULA.width, lines);
  }
}

// Over every portal, on the side you walk toward: where it leads.
function overPortal(signs: Signs, space: Space, next: Space) {
  const amounts = (next.rooms ?? []).map((i) => ROOMS[i].monto);
  const room = space.wallHeight - space.back!.height;
  if (room < 1) return;
  const lines: Line[] = [
    { text: 'SIGUIENTE', size: 0.12, color: ACCENT, bold: true },
    { text: next.title, size: 0.2, bold: true },
  ];
  if (amounts.length) lines.push({ text: amountsLine(amounts), size: amounts.length === 1 ? 0.15 : 0.13, color: MUTED });
  signs.onWall({ x: 0, z: space.area.minZ + T / 2 }, space.back!.height + 0.25, towardZ, 4.4, lines);
}

// One figure, or how many and from which to which.
function amountsLine(amounts: number[]): string {
  if (amounts.length === 1) return shortAmount(amounts[0]);
  return `${amounts.length} cifras, de ${shortAmount(Math.min(...amounts))} a ${shortAmount(Math.max(...amounts))}`;
}
