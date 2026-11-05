import * as THREE from 'three';
import type { Rect } from '../../money/layout';
import { EYE_HEIGHT } from '../../controls/Player';
import { Model, bar, box, cached, cylinder, extrude, lathe, rbox, reflective } from './kit';
import { makeLabel, paintedFloor, type ReferenceSpec } from './shared';

// Sports surfaces at regulation size. They're flat, so you can walk on them;
// only goals, hoops, flags and water block your way.

const LINE = 'rgb(255 255 255 / 0.92)';
const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// A see-through mesh (a goal net, a hoop net) drawn from one cell of a texture repeated over it.
// `draw` paints the cell on a 32 px canvas.
function netMaterial(draw: (ctx: CanvasRenderingContext2D) => void): THREE.MeshStandardMaterial {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.strokeStyle = ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    side: THREE.DoubleSide, // seen from inside and outside
    depthWrite: false, // let things behind the net still show through it
  });
}

// ---------- Soccer goal ----------

const GOAL = { width: 7.32, height: 2.44, depth: 2, post: 0.12 };

// Full goal with its mouth on local z = 0 and the net extending toward +Z: round posts and crossbar,
// ground bars around the base, angled supports from the top of each post down to the back corners,
// and a net draped over the supports.
function goalFrame(m: Model, place: (g: THREE.BufferGeometry) => THREE.BufferGeometry) {
  const { width: W, height: H, depth: D, post: T } = GOAL;
  const L = -W / 2;
  const R = W / 2;
  const top = H + T / 2; // the 2.44 m is measured to the underside of the crossbar
  const white = (g: THREE.BufferGeometry) => m.add(place(g), 0xf5f5f5, 'gloss');
  const grey = (g: THREE.BufferGeometry) => m.add(place(g), 0xb8b8b8, 'metal');
  white(bar(v(L, 0, 0), v(L, top + T / 2, 0), T / 2, 16)); // posts
  white(bar(v(R, 0, 0), v(R, top + T / 2, 0), T / 2, 16));
  white(bar(v(L - T / 2, top, 0), v(R + T / 2, top, 0), T / 2, 16)); // crossbar
  const g = 0.025; // ground bars sit on the turf
  grey(bar(v(L, g, 0), v(L, g, D), g));
  grey(bar(v(R, g, 0), v(R, g, D), g));
  grey(bar(v(L, g, D), v(R, g, D), g));
  grey(bar(v(L, top, 0), v(L, g, D), 0.03)); // supports
  grey(bar(v(R, top, 0), v(R, g, D), 0.03));
}

// The net as hand-built geometry: a sloped panel from the crossbar down to the back ground bar,
// plus a triangle on each side. UVs are in "net cells", so a 12 cm mesh texture repeats evenly.
function goalNet(): THREE.BufferGeometry {
  const { width: W, depth: D, post: T } = GOAL;
  const H = GOAL.height + T / 2;
  const CELL = 0.12;
  const slope = Math.hypot(H, D);
  const L = -W / 2;
  const R = W / 2;
  const positions: number[] = [];
  const uvs: number[] = [];
  const vertex = (x: number, y: number, z: number, u: number, v: number) => {
    positions.push(x, y, z);
    uvs.push(u / CELL, v / CELL);
  };
  // Sloped panel: two triangles. u runs along the width, v up the slope.
  vertex(L, H, 0, 0, slope);
  vertex(L, 0, D, 0, 0);
  vertex(R, 0, D, W, 0);
  vertex(L, H, 0, 0, slope);
  vertex(R, 0, D, W, 0);
  vertex(R, H, 0, W, slope);
  // Side triangles: u runs back along z, v up along y.
  for (const x of [L, R]) {
    vertex(x, 0, 0, 0, 0);
    vertex(x, H, 0, 0, H);
    vertex(x, 0, D, D, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

// One net cell: a line along two edges, so the cells tile into a square mesh.
const squareCell = (ctx: CanvasRenderingContext2D) => {
  ctx.fillRect(0, 0, 32, 2);
  ctx.fillRect(0, 0, 2, 32);
};

// Floor-plan collision for a goal whose line is at z = goalZ, centered on x = 0, net toward -Z.
// Collision here is 2D (rectangles on the floor), but the net is sloped: it starts at the
// crossbar and slants down to the back ground bar. So the back is blocked from the depth where
// the slope passes the player's head height; in front of that you can stand inside the goal.
export function goalSolids(goalZ: number): Rect[] {
  const { width: W, height: H, depth: D, post: T } = GOAL;
  const netTop = H + T / 2;
  const headHeight = EYE_HEIGHT + 0.1;
  const headDepth = D * (1 - headHeight / netTop); // how far behind the line the net clears your head
  const wall = 0.03; // half-thickness of the side nets

  const post = (x: number): Rect => ({ minX: x - T, maxX: x + T, minZ: goalZ - T, maxZ: goalZ + T });
  const side = (x: number): Rect => ({ minX: x - wall, maxX: x + wall, minZ: goalZ - D, maxZ: goalZ });
  const back: Rect = { minX: -W / 2, maxX: W / 2, minZ: goalZ - D, maxZ: goalZ - headDepth };
  return [post(-W / 2), post(W / 2), side(-W / 2), side(W / 2), back];
}

// Speckles of lighter and darker paint over a painted floor, so it doesn't look like plastic.
// A small noise tile repeated as a pattern: one fill, however big the floor. `pxPerMeter` undoes the
// canvas's scale to meters, so one dot is one pixel.
function speckle(ctx: CanvasRenderingContext2D, w: number, d: number, pxPerMeter: number, alpha: number) {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 64;
  const t = tile.getContext('2d')!;
  for (let i = 0; i < 900; i++) {
    t.fillStyle = Math.random() < 0.5 ? `rgb(255 255 255 / ${alpha * Math.random()})` : `rgb(0 0 0 / ${alpha * Math.random()})`;
    t.fillRect(Math.random() * 64, Math.random() * 64, 1 + Math.random(), 1 + Math.random());
  }
  const pattern = ctx.createPattern(tile, 'repeat')!;
  pattern.setTransform(new DOMMatrix().scale(1 / pxPerMeter));
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, d);
}

// Mowing stripes across a w × d patch of turf, parallel to the X axis.
function turf(ctx: CanvasRenderingContext2D, w: number, d: number, stripes: number, pxPerMeter: number) {
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#4a9a42' : '#418d3b';
    ctx.fillRect(0, (i * d) / stripes, w, d / stripes);
  }
  speckle(ctx, w, d, pxPerMeter, 0.16);
  ctx.strokeStyle = ctx.fillStyle = LINE;
  ctx.lineWidth = 0.12; // regulation line width
}

const spot = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.beginPath();
  ctx.arc(x, y, 0.2, 0, Math.PI * 2);
  ctx.fill();
};

// ---------- Goal area: one end of a soccer field ----------

const TURF = { width: 22, depth: 14, goalLine: 2.5 }; // goalLine: turf behind the line, for the net
const goalZ = -TURF.depth / 2 + TURF.goalLine;

// Centered on its local origin; the goal sits on the far side (-Z) with its mouth facing +Z.
const goalArea = cached((anisotropy: number) => {
  const { width: W, depth: D, goalLine: G } = TURF;
  const PX = 40;
  const group = new THREE.Group();
  // Canvas top = far side (-Z), where the goal is.
  group.add(
    paintedFloor(W, D, PX, anisotropy, (ctx) => {
      turf(ctx, W, D, 6, PX);
      ctx.beginPath();
      ctx.moveTo(0, G);
      ctx.lineTo(W, G); // goal line
      ctx.stroke();
      ctx.strokeRect((W - 18.32) / 2, G, 18.32, 5.5); // goal area
      spot(ctx, W / 2, G + 11); // penalty spot, 11 m out
    }),
  );
  // goalFrame builds the net toward +Z; half a turn points it toward -Z, the mouth toward the entrance.
  const turn = (g: THREE.BufferGeometry) => g.rotateY(Math.PI).translate(0, 0, goalZ);
  const m = new Model();
  goalFrame(m, turn);
  group.add(m.build(), new THREE.Mesh(turn(goalNet()), netMaterial(squareCell)));
  return group;
});

export const porteria: ReferenceSpec = {
  footprint: { w: TURF.width, d: TURF.depth, h: GOAL.height + GOAL.post },
  build: (anisotropy) => {
    const object = goalArea(anisotropy);
    const label = makeLabel('Portería de fútbol · 7.32 × 2.44 m');
    label.position.set(0, GOAL.height + 0.6, goalZ);
    object.add(label);
    return { object, solids: goalSolids(goalZ) };
  },
};

// ---------- Full soccer field ----------

const FIELD = { length: 105, width: 68, runoff: 4 };

// Turn a floor rectangle a quarter turn around the origin, the same way rotation.y = ±π/2 turns an object.
function quarterTurn(r: Rect, direction: 1 | -1): Rect {
  return direction === 1
    ? { minX: r.minZ, maxX: r.maxZ, minZ: -r.maxX, maxZ: -r.minX }
    : { minX: -r.maxZ, maxX: -r.minZ, minZ: r.minX, maxZ: r.maxX };
}

// A corner flag: a striped pole with a little flag on top.
function cornerFlag(m: Model, x: number, z: number) {
  for (let i = 0; i < 5; i++) m.add(cylinder(0.02, 0.3, 'y', x, 0.15 + i * 0.3, z, 8), i % 2 ? 0xf5f5f5 : 0xe8c21b, 'satin');
  m.add(extrude([[0, 0], [0.42, -0.04], [0.42, -0.3], [0, -0.32]], 0.01).translate(x, 1.5, z), 0xe8382b, 'satin');
}

// The field's length runs along X, so from the entrance you see it side-on, goal to goal.
const field = cached((anisotropy: number) => {
  const { length: L, width: W, runoff: M } = FIELD;
  const PX = 16;
  const group = new THREE.Group();
  group.add(
    paintedFloor(L + M * 2, W + M * 2, PX, anisotropy, (ctx) => {
      ctx.save();
      // Stripes across the length: paint them in a rotated frame.
      ctx.translate(L + M * 2, 0);
      ctx.rotate(Math.PI / 2);
      turf(ctx, W + M * 2, L + M * 2, 18, PX);
      ctx.restore();
      ctx.strokeStyle = ctx.fillStyle = LINE;
      ctx.lineWidth = 0.12;
      ctx.translate(M, M); // from here on, (0, 0) is a corner of the pitch
      ctx.strokeRect(0, 0, L, W); // touchlines and goal lines
      ctx.beginPath();
      ctx.moveTo(L / 2, 0);
      ctx.lineTo(L / 2, W); // halfway line
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(L / 2, W / 2, 9.15, 0, Math.PI * 2); // center circle
      ctx.stroke();
      spot(ctx, L / 2, W / 2);
      for (const [x, inward] of [[0, 1], [L, -1]]) {
        const box = (depth: number, width: number) =>
          ctx.strokeRect(inward === 1 ? x : x - depth, (W - width) / 2, depth, width);
        box(16.5, 40.32); // penalty area
        box(5.5, 18.32); // goal area
        spot(ctx, x + inward * 11, W / 2);
        // The arc outside the penalty area: the part of a 9.15 m circle around the spot past the box.
        const reach = Math.acos((16.5 - 11) / 9.15);
        const facing = inward === 1 ? 0 : Math.PI;
        ctx.beginPath();
        ctx.arc(x + inward * 11, W / 2, 9.15, facing - reach, facing + reach);
        ctx.stroke();
      }
      for (const [x, y, start] of [[0, 0, 0], [L, 0, 0.5], [L, W, 1], [0, W, 1.5]]) {
        ctx.beginPath();
        ctx.arc(x, y, 1, start * Math.PI, (start + 0.5) * Math.PI); // corner arcs
        ctx.stroke();
      }
    }),
  );

  // goalFrame's net points +Z; a quarter turn points it out past each goal line.
  const m = new Model();
  const nets: THREE.BufferGeometry[] = [];
  for (const end of [-1, 1]) {
    const place = (g: THREE.BufferGeometry) => g.rotateY((end * Math.PI) / 2).translate((end * L) / 2, 0, 0);
    goalFrame(m, place);
    nets.push(place(goalNet()));
  }
  for (const x of [-L / 2, L / 2]) for (const z of [-W / 2, W / 2]) cornerFlag(m, x, z);
  const net = netMaterial(squareCell);
  group.add(m.build(), ...nets.map((g) => new THREE.Mesh(g, net)));
  return group;
});

export const futbol: ReferenceSpec = {
  footprint: { w: FIELD.length + FIELD.runoff * 2, d: FIELD.width + FIELD.runoff * 2, h: GOAL.height + GOAL.post },
  build: (anisotropy) => {
    const { length: L, width: W } = FIELD;
    const solids: Rect[] = [];
    for (const end of [-1, 1] as const) {
      // goalSolids already has the net toward -Z (half a turn from goalFrame), so it takes the other quarter turn.
      for (const r of goalSolids(0)) {
        const turned = quarterTurn(r, end === 1 ? -1 : 1);
        solids.push({ ...turned, minX: turned.minX + (end * L) / 2, maxX: turned.maxX + (end * L) / 2 });
      }
    }
    for (const x of [-L / 2, L / 2]) for (const z of [-W / 2, W / 2]) solids.push({ minX: x - 0.1, maxX: x + 0.1, minZ: z - 0.1, maxZ: z + 0.1 });
    return { object: field(anisotropy), label: 'Cancha de fútbol · 105 × 68 m', labelHeight: 6, labelSize: 2.5, solids };
  },
};

// ---------- Basketball court ----------

const COURT = { length: 28, width: 15, runoff: 2, rim: 3.05 };

const court = cached((anisotropy: number) => {
  const { length: L, width: W, runoff: M } = COURT;
  const PX = 40;
  const group = new THREE.Group();
  group.add(
    paintedFloor(L + M * 2, W + M * 2, PX, anisotropy, (ctx) => {
      ctx.fillStyle = '#3f6e9e'; // run-off
      ctx.fillRect(0, 0, L + M * 2, W + M * 2);
      ctx.translate(M, M);
      // Maple boards, 7 cm wide, along the length; each a slightly different tone, butted end to end.
      const board = 0.07;
      for (let i = 0; i * board < W; i++) {
        let x = -Math.random() * 3;
        while (x < L) {
          const length = 1.5 + Math.random() * 2.5;
          ctx.fillStyle = `hsl(32 ${52 + Math.random() * 8}% ${60 + Math.random() * 6}%)`;
          ctx.fillRect(Math.max(0, x), i * board, Math.min(length, L - x), board);
          x += length;
        }
      }
      ctx.fillStyle = 'rgb(90 55 25 / 0.12)';
      for (let i = 1; i * board < W; i++) ctx.fillRect(0, i * board - 0.004, L, 0.008);
      speckle(ctx, L, W, PX, 0.06);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 0.05;
      ctx.strokeRect(0, 0, L, W);
      ctx.beginPath();
      ctx.moveTo(L / 2, 0);
      ctx.lineTo(L / 2, W);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(L / 2, W / 2, 1.8, 0, Math.PI * 2);
      ctx.stroke();
      for (const [x, inward] of [[0, 1], [L, -1]]) {
        const hoop = x + inward * 1.575;
        ctx.fillStyle = 'rgb(181 83 47 / 0.92)';
        ctx.fillRect(inward === 1 ? x : x - 5.8, (W - 4.9) / 2, 5.8, 4.9); // the key
        ctx.strokeRect(inward === 1 ? x : x - 5.8, (W - 4.9) / 2, 5.8, 4.9);
        ctx.beginPath();
        ctx.arc(x + inward * 5.8, W / 2, 1.8, 0, Math.PI * 2); // free-throw circle
        ctx.stroke();
        // Three-point line: straight 0.9 m in from each sideline, then a 6.75 m arc around the hoop.
        // Canvas angles start at +x and grow toward +y; the arc bulges toward mid-court.
        const straight = Math.sqrt(6.75 ** 2 - (W / 2 - 0.9) ** 2);
        const corner = Math.atan2(W / 2 - 0.9, straight);
        ctx.beginPath();
        ctx.moveTo(x, 0.9);
        ctx.lineTo(hoop + inward * straight, 0.9);
        if (inward === 1) ctx.arc(hoop, W / 2, 6.75, -corner, corner);
        else ctx.arc(hoop, W / 2, 6.75, -Math.PI + corner, Math.PI - corner, true);
        ctx.lineTo(x, W - 0.9);
        ctx.stroke();
      }
    }),
  );

  // Hoops: a padded pole behind each baseline, a braced arm out to the glass backboard, the orange
  // rim 3.05 m up, and a white net hanging from it.
  const m = new Model();
  const nets: THREE.BufferGeometry[] = [];
  for (const end of [-1, 1]) {
    const baseline = (end * L) / 2;
    const pole = baseline + end * 1;
    const board = baseline - end * 1.2; // the backboard's face is 1.2 m in from the baseline
    const rim = baseline - end * 1.575;
    m.add(rbox(0.36, 2.0, 0.36, 0.06, pole, 0, 0), 0x1f3b63, 'satin'); // padding
    m.add(rbox(0.2, 1.45, 0.2, 0.03, pole, 2.0, 0), 0x30343a, 'satin');
    m.add(bar(v(pole, 3.3, 0), v(board + end * 0.05, 3.3, 0), 0.07, 10), 0x30343a, 'satin');
    m.add(bar(v(pole, 2.55, 0), v(board + end * 0.3, 3.25, 0), 0.04, 8), 0x30343a, 'satin');
    m.add(rbox(0.05, 1.05, 1.8, 0.02, board + end * 0.025, 2.9, 0), 0xf6f6f4, 'gloss');
    // The border and the target square above the rim, in black on the board.
    const line = (y: number, h: number, z: number, w: number) => m.add(box(0.012, h, w, board - end * 0.002, y, z), 0x1b1b1b, 'satin');
    line(2.9, 0.05, 0, 1.8);
    line(3.9, 0.05, 0, 1.8);
    for (const s of [-1, 1]) line(2.9, 1.05, s * 0.875, 0.05);
    line(3.0, 0.05, 0, 0.59);
    line(3.4, 0.05, 0, 0.59);
    for (const s of [-1, 1]) line(3.0, 0.45, s * 0.27, 0.05);
    m.add(new THREE.TorusGeometry(0.225, 0.012, 8, 28).rotateX(Math.PI / 2).translate(rim, COURT.rim, 0), 0xe0531f, 'satin');
    m.add(box(0.15, 0.04, 0.1, board - end * 0.075, COURT.rim - 0.03, 0), 0xe0531f, 'satin'); // bracket
    // The net: an open cone of diamond mesh, from the rim down to 40 cm below it.
    const net = lathe([[0.15, -0.42], [0.17, -0.3], [0.21, -0.1], [0.225, 0]], 16, 0, Math.PI * 2);
    const uv = net.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 12, uv.getY(i) * 5);
    nets.push(net.translate(rim, COURT.rim, 0));
  }
  const diamond = netMaterial((ctx) => {
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(32, 32);
    ctx.moveTo(32, 0);
    ctx.lineTo(0, 32);
    ctx.stroke();
  });
  group.add(m.build(), ...nets.map((g) => new THREE.Mesh(g, diamond)));
  return group;
});

export const basquetbol: ReferenceSpec = {
  footprint: { w: COURT.length + COURT.runoff * 2, d: COURT.width + COURT.runoff * 2, h: COURT.rim + 0.9 },
  build: (anisotropy) => {
    const poles = [-1, 1].map((end) => (end * COURT.length) / 2 + end * 1);
    return {
      object: court(anisotropy),
      label: 'Cancha de básquetbol · 28 × 15 m',
      labelHeight: COURT.rim + 0.9,
      labelSize: 0.6,
      solids: poles.map((x) => ({ minX: x - 0.25, maxX: x + 0.25, minZ: -0.25, maxZ: 0.25 })),
    };
  },
};

// ---------- Olympic pool ----------

const POOL = { length: 50, width: 25, lanes: 10, deck: 2.5 };
const FLAG_POLE = POOL.width / 2 + 1.2; // backstroke flag poles, on the deck beside the water

// Gentle ripples for the water's surface, as a normal map: a height field of a few crossing waves,
// turned into the slopes the lighting needs. It's what makes the reflections shimmer.
function ripples(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  // Every wave fits a whole number of times across the tile, so it repeats without a seam.
  const k = (Math.PI * 2) / size;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      height[y * size + x] = Math.sin(x * k * 2 + Math.sin(y * k) * 1.5) + 0.6 * Math.sin((x + y) * k * 3) + 0.4 * Math.sin((x - 2 * y) * k * 4);
    }
  }
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * -0.6;
      const dy = (at(x, y + 1) - at(x, y - 1)) * -0.6;
      const length = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      image.data[i] = (dx / length / 2 + 0.5) * 255;
      image.data[i + 1] = (dy / length / 2 + 0.5) * 255;
      image.data[i + 2] = (1 / length / 2 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const pool = cached((anisotropy: number) => {
  const { length: L, width: W, lanes, deck: E } = POOL;
  const lane = W / lanes;
  const group = new THREE.Group();
  group.add(
    paintedFloor(L + E * 2, W + E * 2, 20, anisotropy, (ctx) => {
      ctx.fillStyle = '#e9e6df'; // tiled deck
      ctx.fillRect(0, 0, L + E * 2, W + E * 2);
      ctx.strokeStyle = 'rgb(120 110 95 / 0.18)'; // joints between 50 cm tiles
      ctx.lineWidth = 0.02;
      ctx.beginPath();
      for (let x = 0.5; x < L + E * 2; x += 0.5) ctx.rect(x, 0, 0, W + E * 2);
      for (let y = 0.5; y < W + E * 2; y += 0.5) ctx.rect(0, y, L + E * 2, 0);
      ctx.stroke();
      ctx.translate(E, E);
      ctx.fillStyle = '#2b88c4'; // the pool's floor, seen through the water
      ctx.fillRect(0, 0, L, W);
      ctx.fillStyle = '#123a5c'; // black lines on the bottom, down the middle of each lane
      for (let i = 0; i < lanes; i++) {
        const y = (i + 0.5) * lane;
        ctx.fillRect(2, y - 0.125, L - 4, 0.25);
        ctx.fillRect(2, y - 0.5, 0.25, 1); // the T at each end
        ctx.fillRect(L - 2.25, y - 0.5, 0.25, 1);
      }
    }),
  );

  // The water: a glossy, see-through surface just below the coping, rippled so it catches the light.
  const normalMap = ripples();
  normalMap.repeat.set(L / 12, W / 12);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(L, W).rotateX(-Math.PI / 2),
    reflective(new THREE.MeshStandardMaterial({
      color: 0x56bde3,
      transparent: true,
      opacity: 0.3,
      roughness: 0.1,
      envMapIntensity: 1,
      normalMap,
      normalScale: new THREE.Vector2(0.6, 0.6),
      depthWrite: false,
    })),
  );
  water.position.y = 0.08;
  group.add(water);

  const m = new Model();
  // Coping around the water, so the edge reads as a pool and not a blue floor.
  const rim = 0xf7f5f0;
  for (const s of [-1, 1]) {
    m.add(rbox(L + 0.6, 0.12, 0.3, 0.03, 0, 0, s * (W / 2 + 0.15), 1), rim, 'satin');
    m.add(rbox(0.3, 0.12, W, 0.03, s * (L / 2 + 0.15), 0, 0, 1), rim, 'satin');
  }
  // Lane ropes floating between the lanes: red for the last 5 m at each wall, blue and white between.
  const segment = 5;
  for (let i = 1; i < lanes; i++) {
    const z = -W / 2 + i * lane;
    for (let k = 0; k < L / segment; k++) {
      const x = -L / 2 + (k + 0.5) * segment;
      const color = Math.abs(x) > L / 2 - 5 ? 0xd8423a : k % 2 ? 0xf2f2f2 : 0x2c6fd1;
      m.add(cylinder(0.055, segment, 'x', x, 0.1, z, 8), color, 'satin');
    }
  }
  // Starting blocks at one end: a steel pedestal, a top that slopes toward the water, a grip pad.
  for (let i = 0; i < lanes; i++) {
    const z = -W / 2 + (i + 0.5) * lane;
    const x = -L / 2 - 0.6;
    m.add(rbox(0.36, 0.62, 0.38, 0.04, x, 0, z), 0xc9cdd2, 'metal');
    m.add(rbox(0.56, 0.07, 0.52, 0.02, 0, -0.035, 0, 1).rotateZ(-0.17).translate(x + 0.04, 0.66, z), 0xf4f4f2, 'satin');
    m.add(rbox(0.42, 0.012, 0.44, 0.005, 0, 0, 0, 1).rotateZ(-0.17).translate(x + 0.046, 0.696, z), 0x2b6cb0, 'satin');
  }
  // Backstroke flags, 5 m from each wall: a line of pennants across the pool, 1.8 m above the water.
  // The pennants are flat triangles, built straight into one geometry per color.
  const colors = [0xd8423a, 0xf2f2f2, 0x2c6fd1];
  const pennants = colors.map(() => [] as number[]);
  for (const e of [-1, 1]) {
    const x = e * (L / 2 - 5);
    for (const s of [-1, 1]) m.add(cylinder(0.03, 2.1, 'y', x, 1.05, s * FLAG_POLE, 8), 0xc9cdd2, 'metal');
    m.add(cylinder(0.006, FLAG_POLE * 2, 'z', x, 1.98, 0, 4), 0xf2f2f2, 'satin');
    let k = 0;
    for (let z = -W / 2 + 0.2; z < W / 2; z += 0.4) {
      // Each triangle twice, wound both ways, so it shows from either side of the line.
      pennants[k++ % 3].push(x, 1.98, z - 0.1, x, 1.98, z + 0.1, x, 1.74, z, x, 1.98, z - 0.1, x, 1.74, z, x, 1.98, z + 0.1);
    }
  }
  pennants.forEach((positions, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    m.add(g, colors[i], 'satin');
  });
  group.add(m.build());
  return group;
});

export const alberca: ReferenceSpec = {
  footprint: { w: POOL.length + POOL.deck * 2, d: POOL.width + POOL.deck * 2, h: 2.1 },
  build: (anisotropy) => {
    const { length: L, width: W } = POOL;
    const poles: Rect[] = [];
    for (const e of [-1, 1]) {
      for (const s of [-1, 1]) {
        const [x, z] = [e * (L / 2 - 5), s * FLAG_POLE];
        poles.push({ minX: x - 0.1, maxX: x + 0.1, minZ: z - 0.1, maxZ: z + 0.1 });
      }
    }
    return {
      object: pool(anisotropy),
      label: 'Alberca olímpica · 50 × 25 m',
      labelHeight: 2.2,
      labelSize: 1,
      // You walk around the water on the deck; the starting blocks and the flag poles stand on it.
      solids: [
        { minX: -L / 2 - 0.3, maxX: L / 2 + 0.3, minZ: -W / 2 - 0.3, maxZ: W / 2 + 0.3 },
        { minX: -L / 2 - 0.85, maxX: -L / 2 - 0.35, minZ: -W / 2, maxZ: W / 2 },
        ...poles,
      ],
    };
  },
};
