import * as THREE from 'three';
import { DEFAULT_BILL } from '../money/denominations';
import type { Layout, Rect } from '../money/layout';
import { MoneyRenderer, moneyObstacles } from '../money/MoneyRenderer';
import { formatMXN, shortAmount } from '../i18n/format';
import { PRESETS, ROOMS, SALAS, TIPOS, comparisonsFor, salaOf } from '../museum/collection';
import { RULER, type Complex, type Space } from '../museum/complex';
import { WALL_THICKNESS } from '../museum/rooms';
import { Builder, buildSpace } from './Architecture';
import { disposeObject } from './dispose';
import { CARBON } from './palette';
import { References, type ReferenceId } from './references';
import { ACCENT, MUTED, Signs, type Line } from './Signage';
import { garden } from './Vegetation';

// The whole museum in the scene. The building is merged into a few meshes and always drawn;
// what's inside each space (money, references, signs, gardens) is drawn only near you, and the
// money only drops into place the first time its space comes into view.

const T = WALL_THICKNESS;
const AHEAD = 2; // spaces drawn ahead of the one you're in: you see down the axis through the portals
const BEHIND = 1;

interface Part {
  space: Space;
  contents: THREE.Group;
  money: { renderer: MoneyRenderer; layout: Layout }[];
  shown: boolean;
}

export class Museum {
  readonly group = new THREE.Group();
  readonly rects: Rect[] = [];
  private readonly parts: Part[];

  constructor(
    readonly complex: Complex,
    private readonly options: { anisotropy: number; reducedMotion: boolean },
  ) {
    const builder = new Builder();
    const { spaces } = complex;
    this.parts = spaces.map((space, i) => {
      buildSpace(builder, space, spaces[i + 1]);
      return this.furnish(builder, space, spaces[i + 1]);
    });
    this.group.add(builder.build(), ...this.parts.map((p) => p.contents));
    this.rects.push(...complex.walls, ...builder.rects);
  }

  // Draw the spaces around the one you're in, and drop in any money seen for the first time.
  focus(index: number) {
    this.parts.forEach((part, i) => {
      part.contents.visible = i >= index - BEHIND && i <= index + AHEAD;
      if (!part.contents.visible || part.shown) return;
      part.shown = true;
      for (const m of part.money) m.renderer.show(m.layout, !this.options.reducedMotion);
    });
  }

  update(dt: number) {
    for (const part of this.parts) if (part.shown) for (const m of part.money) m.renderer.update(dt);
  }

  dispose() {
    disposeObject(this.group);
  }

  private furnish(builder: Builder, space: Space, next: Space | undefined): Part {
    const contents = new THREE.Group();
    contents.visible = false;
    const signs = new Signs();
    contents.add(signs.group);

    const money = space.exhibits.map((exhibit) => {
      const renderer = new MoneyRenderer(DEFAULT_BILL, this.options.anisotropy);
      renderer.group.position.set(exhibit.origin.x, 0, exhibit.origin.z);
      contents.add(renderer.group);
      const shift = (r: Rect) => ({ minX: r.minX + exhibit.origin.x, maxX: r.maxX + exhibit.origin.x, minZ: r.minZ + exhibit.origin.z, maxZ: r.maxZ + exhibit.origin.z });
      this.rects.push(...moneyObstacles(exhibit.layout).map(shift));
      if (exhibit.references.length) {
        const references = new References(
          exhibit.references.map((r) => r.id as ReferenceId),
          exhibit.references.map((r) => r.at),
          this.options.anisotropy,
        );
        contents.add(references.group);
        this.rects.push(...references.rects);
      }
      return { renderer, layout: exhibit.layout };
    });

    const plants: Rect[] = [];
    for (const bed of gardens(space)) contents.add(garden(builder, bed, `${space.id}:${bed.minX}`, plants));
    this.rects.push(...plants);

    furnishings[space.kind](signs, builder, space);
    if (next && space.back) overPortal(signs, space, next);
    signs.arrows(space.path);
    this.rects.push(...signs.rects);
    return { space, contents, money, shown: false };
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
      return [{ minX: 3.5, maxX: maxX - 1.5, minZ: minZ + 3, maxZ: maxZ - 3 }];
    case 'reflexion':
      return [{ minX: minX + 1.5, maxX: -4, minZ: maxZ - 11, maxZ: maxZ - 3 }];
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
        text: 'Cada sala muestra una cifra real en billetes de $500, junto a objetos conocidos a escala real. Sigue el eje a través de los pórticos.',
        size: 0.075,
        wrap: true,
      },
      { text: 'W A S D o joystick · Shift para correr · V vista aérea · M música', size: 0.065, color: MUTED, wrap: true },
    ]);
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
    builder.box('concreto', -9, -3.5, 0, 4.2, z - 0.3, z + 0.3, true);
    signs.onWall({ x: -6.25, z: z + 0.3 }, 1.2, towardZ, 4.6, [
      { text: `SALA ${n} DE ${SALAS.length}`, size: 0.14, color: ACCENT, bold: true },
      { text: sala.nombre, size: 0.55, bold: true },
      { text: sala.escala, size: 0.18, color: MUTED },
      { text: sala.descripcion, size: 0.13, wrap: true },
      { text: `${count} ${count === 1 ? 'exposición' : 'exposiciones'}`, size: 0.11, color: MUTED },
    ]);
  },

  sala(signs, _, space) {
    const preset = ROOMS[space.room!];
    const sala = salaOf(preset);
    const inSala = ROOMS.filter((r) => r.sala === sala.id);
    signs.gate({ x: 0, z: space.spawn.z - 3.5 }, 3.8, [
      { text: `SALA ${SALAS.indexOf(sala) + 1} · ${sala.nombre.toUpperCase()} · ${inSala.indexOf(preset) + 1} DE ${inSala.length}`, size: 0.12, color: MUTED, bold: true },
      { text: preset.titulo, size: 0.22, bold: true },
      { text: shortAmount(preset.monto), size: 0.18, color: ACCENT },
      { text: preset.pregunta, size: 0.13, wrap: true },
    ]);
    // The cédula: what kind of figure it is, what it covers, where it comes from.
    const consulted = preset.consulta ? `Consultada el ${new Date(preset.consulta + 'T12:00').toLocaleDateString('es-MX', { dateStyle: 'long' })}` : null;
    signs.post({ x: 3, z: space.spawn.z + 1.5 }, { x: -0.6, z: 0.8 }, 1.7, [
      { text: TIPOS[preset.tipo].toUpperCase(), size: 0.075, color: ACCENT, bold: true, wrap: true },
      { text: `${formatMXN(preset.monto)}${preset.año ? ` · ${preset.año}` : ''}`, size: 0.1, bold: true },
      { text: preset.descripcion, size: 0.06, wrap: true },
      { text: preset.alcance, size: 0.055, color: MUTED, wrap: true },
      { text: 'PARA COMPARAR', size: 0.06, color: ACCENT, bold: true },
      ...comparisonsFor(preset).map((text) => ({ text, size: 0.06, wrap: true })),
      { text: `Fuente: ${preset.fuente}`, size: 0.05, color: MUTED, wrap: true },
      ...(consulted ? [{ text: consulted, size: 0.05, color: MUTED }] : []),
    ]);
  },

  reflexion(signs, _, space) {
    signs.post({ x: -2.6, z: space.spawn.z - 3 }, towardZ, 2.2, [
      { text: 'FIN DEL RECORRIDO', size: 0.09, color: ACCENT, bold: true },
      { text: 'La arquitectura permanece; las cifras cambian.', size: 0.13, bold: true, wrap: true },
      { text: 'Vuelve a cualquier sala desde el menú, o escribe un monto para abrir la Sala temporal.', size: 0.075, wrap: true },
      { text: '¿Cuánto tiempo necesitarías tú? Escribe tu ingreso mensual en el menú y cada sala te lo dirá.', size: 0.075, color: MUTED, wrap: true },
    ]);
    // Every source in the museum, on the long wall, to check and come back to.
    const lines: Line[] = PRESETS.map((p) => ({ text: `${p.titulo} — ${p.fuente}${p.año ? ` (${p.año})` : ''}`, size: 0.11 }));
    signs.onWall({ x: space.area.minX + T / 2, z: space.area.minZ + 8 }, 1, towardX, 11, [
      { text: 'FUENTES', size: 0.16, color: ACCENT, bold: true },
      ...lines,
    ], { align: 'left', pad: 0.3 });
  },

  temporal(signs, _, space) {
    const amount = space.exhibits[0].layout.amount;
    signs.gate({ x: 0, z: space.spawn.z - 3.5 }, 3.6, [
      { text: 'SALA TEMPORAL', size: 0.13, color: MUTED, bold: true },
      { text: 'Tu monto', size: 0.22, bold: true },
      { text: shortAmount(amount), size: 0.18, color: ACCENT },
      { text: 'Vuelve al museo por el pórtico detrás de ti', size: 0.12, wrap: true },
    ]);
  },
};

// Over every portal, on the side you walk toward: where it leads.
function overPortal(signs: Signs, space: Space, next: Space) {
  const preset = next.room !== undefined ? ROOMS[next.room] : undefined;
  const room = space.wallHeight - space.back!.height;
  if (room < 1) return;
  signs.onWall({ x: 0, z: space.area.minZ + T / 2 }, space.back!.height + 0.25, towardZ, 4.4, [
    { text: 'SIGUIENTE', size: 0.12, color: ACCENT, bold: true },
    { text: next.title, size: 0.2, bold: true },
    ...(preset ? [{ text: shortAmount(preset.monto), size: 0.15, color: MUTED }] : []),
  ]);
}
