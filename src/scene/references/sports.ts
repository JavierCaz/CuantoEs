import * as THREE from 'three';
import type { Rect } from '../../money/layout';
import { EYE_HEIGHT } from '../../controls/Player';
import { box, makeLabel, paintedFloor, type ReferenceSpec } from './shared';

// Sports surfaces at regulation size. They're flat, so you can walk on them;
// only goals, hoops and water block your way.

const LINE = 'rgb(255 255 255 / 0.92)';

// ---------- Soccer goal ----------

const GOAL = { width: 7.32, height: 2.44, depth: 2, post: 0.12 };

// Full goal with its mouth on local z = 0 and the net extending toward +Z: round posts and
// crossbar, ground bars around the base, angled supports from the top of each post down to
// the back corners, and a net draped over the supports.
function goalFrame(): THREE.Group {
  const { width: W, height: H, depth: D, post: T } = GOAL;
  const group = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 });
  const grey = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.5 });
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const L = -W / 2;
  const R = W / 2;
  const top = H + T / 2; // the 2.44 m is measured to the underside of the crossbar

  group.add(bar(v(L, 0, 0), v(L, top + T / 2, 0), T / 2, white)); // posts
  group.add(bar(v(R, 0, 0), v(R, top + T / 2, 0), T / 2, white));
  group.add(bar(v(L - T / 2, top, 0), v(R + T / 2, top, 0), T / 2, white)); // crossbar

  const g = 0.025; // ground bars sit on the turf
  group.add(bar(v(L, g, 0), v(L, g, D), g, grey));
  group.add(bar(v(R, g, 0), v(R, g, D), g, grey));
  group.add(bar(v(L, g, D), v(R, g, D), g, grey));
  group.add(bar(v(L, top, 0), v(L, g, D), 0.03, grey)); // supports
  group.add(bar(v(R, top, 0), v(R, g, D), 0.03, grey));

  group.add(goalNet(W, top, D));
  return group;
}

// A cylinder stretched between two points. Cylinders are built standing along +Y, so we
// rotate +Y onto the direction from `a` to `b` with a quaternion, then move it to the midpoint.
function bar(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const direction = b.clone().sub(a);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 12), material);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  return mesh;
}

// The net as hand-built geometry: a sloped panel from the crossbar down to the back ground bar,
// plus a triangle on each side. UVs are in "net cells", so a 12 cm mesh texture repeats evenly.
function goalNet(W: number, H: number, D: number): THREE.Mesh {
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

  const material = new THREE.MeshStandardMaterial({
    map: netTexture(),
    transparent: true,
    side: THREE.DoubleSide, // seen from inside and outside
    depthWrite: false, // let things behind the net still show through it
  });
  return new THREE.Mesh(geometry, material);
}

// One net cell: a white line along two edges on a transparent background.
function netTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgb(255 255 255 / 0.85)';
  ctx.fillRect(0, 0, 32, 2);
  ctx.fillRect(0, 0, 2, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

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

// Mowing stripes across a w × d patch of turf, parallel to the X axis.
function turf(ctx: CanvasRenderingContext2D, w: number, d: number, stripes: number) {
  for (let i = 0; i < stripes; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#4a9a42' : '#418d3b';
    ctx.fillRect(0, (i * d) / stripes, w, d / stripes);
  }
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

// Centered on its local origin; the goal sits on the far side (-Z) with its mouth facing +Z.
export const porteria: ReferenceSpec = {
  footprint: { w: TURF.width, d: TURF.depth, h: GOAL.height + GOAL.post },
  build: (anisotropy) => {
    const { width: W, depth: D, goalLine: G } = TURF;
    const group = new THREE.Group();
    // Canvas top = far side (-Z), where the goal is.
    group.add(
      paintedFloor(W, D, 40, anisotropy, (ctx) => {
        turf(ctx, W, D, 6);
        ctx.beginPath();
        ctx.moveTo(0, G);
        ctx.lineTo(W, G); // goal line
        ctx.stroke();
        ctx.strokeRect((W - 18.32) / 2, G, 18.32, 5.5); // goal area
        spot(ctx, W / 2, G + 11); // penalty spot, 11 m out
      }),
    );

    const goalZ = -D / 2 + G;
    const frame = goalFrame();
    frame.position.z = goalZ;
    frame.rotation.y = Math.PI; // net toward -Z, mouth toward the entrance
    group.add(frame);

    const label = makeLabel('Portería de fútbol · 7.32 × 2.44 m');
    label.position.set(0, GOAL.height + 0.6, goalZ);
    group.add(label);

    return { object: group, solids: goalSolids(goalZ) };
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

// The field's length runs along X, so from the entrance you see it side-on, goal to goal.
export const futbol: ReferenceSpec = {
  footprint: { w: FIELD.length + FIELD.runoff * 2, d: FIELD.width + FIELD.runoff * 2, h: GOAL.height + GOAL.post },
  build: (anisotropy) => {
    const { length: L, width: W, runoff: M } = FIELD;
    const group = new THREE.Group();
    group.add(
      paintedFloor(L + M * 2, W + M * 2, 16, anisotropy, (ctx) => {
        ctx.save();
        // Stripes across the length: paint them in a rotated frame.
        ctx.translate(L + M * 2, 0);
        ctx.rotate(Math.PI / 2);
        turf(ctx, W + M * 2, L + M * 2, 18);
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
    const solids: Rect[] = [];
    for (const end of [-1, 1] as const) {
      const frame = goalFrame();
      frame.position.x = (end * L) / 2;
      frame.rotation.y = (end * Math.PI) / 2;
      group.add(frame);
      // goalSolids already has the net toward -Z (half a turn from goalFrame), so it takes the other quarter turn.
      for (const r of goalSolids(0)) {
        const turned = quarterTurn(r, end === 1 ? -1 : 1);
        solids.push({ ...turned, minX: turned.minX + (end * L) / 2, maxX: turned.maxX + (end * L) / 2 });
      }
    }

    return {
      object: group,
      label: 'Cancha de fútbol · 105 × 68 m',
      labelHeight: 6,
      labelSize: 2.5,
      solids,
    };
  },
};

// ---------- Basketball court ----------

const COURT = { length: 28, width: 15, runoff: 2, rim: 3.05 };

export const basquetbol: ReferenceSpec = {
  footprint: { w: COURT.length + COURT.runoff * 2, d: COURT.width + COURT.runoff * 2, h: COURT.rim + 0.9 },
  build: (anisotropy) => {
    const { length: L, width: W, runoff: M } = COURT;
    const group = new THREE.Group();
    group.add(
      paintedFloor(L + M * 2, W + M * 2, 40, anisotropy, (ctx) => {
        ctx.fillStyle = '#3f6e9e'; // run-off
        ctx.fillRect(0, 0, L + M * 2, W + M * 2);
        ctx.translate(M, M);
        ctx.fillStyle = '#d9a86c'; // maple
        ctx.fillRect(0, 0, L, W);
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
          ctx.fillStyle = '#b5532f';
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

    // Hoops: a pole behind each baseline, an arm out to the backboard, the rim 3.05 m up.
    const solids: Rect[] = [];
    for (const end of [-1, 1]) {
      const baseline = (end * L) / 2;
      const poleX = baseline + end * 1;
      group.add(box(0.25, 3.4, 0.25, 0x30343a, poleX, 0));
      group.add(box(2.2, 0.15, 0.15, 0x30343a, baseline - end * 0.1, 3.25)); // arm over the baseline
      group.add(box(0.05, 1.05, 1.8, 0xf2f2f2, baseline - end * 1.2, 2.9)); // backboard
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.225, 0.012, 8, 24).rotateX(Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xe0531f }),
      );
      rim.position.set(baseline - end * 1.575, COURT.rim, 0);
      group.add(rim);
      solids.push({ minX: poleX - 0.2, maxX: poleX + 0.2, minZ: -0.2, maxZ: 0.2 });
    }

    return {
      object: group,
      label: 'Cancha de básquetbol · 28 × 15 m',
      labelHeight: COURT.rim + 0.9,
      labelSize: 0.6,
      solids,
    };
  },
};

// ---------- Olympic pool ----------

const POOL = { length: 50, width: 25, lanes: 10, deck: 2.5 };

export const alberca: ReferenceSpec = {
  footprint: { w: POOL.length + POOL.deck * 2, d: POOL.width + POOL.deck * 2, h: 0.75 },
  build: (anisotropy) => {
    const { length: L, width: W, lanes, deck: E } = POOL;
    const lane = W / lanes;
    const group = new THREE.Group();
    group.add(
      paintedFloor(L + E * 2, W + E * 2, 20, anisotropy, (ctx) => {
        ctx.fillStyle = '#e9e6df'; // tiled deck
        ctx.fillRect(0, 0, L + E * 2, W + E * 2);
        ctx.translate(E, E);
        ctx.fillStyle = '#2f8fc9'; // water
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

    // Coping around the water, so the edge reads as a pool and not a blue floor.
    const rim = 0xf7f5f0;
    group.add(box(L + 0.6, 0.12, 0.3, rim, 0, 0, -W / 2 - 0.15), box(L + 0.6, 0.12, 0.3, rim, 0, 0, W / 2 + 0.15));
    group.add(box(0.3, 0.12, W, rim, -L / 2 - 0.15, 0), box(0.3, 0.12, W, rim, L / 2 + 0.15, 0));

    // Lane ropes floating between lanes, and starting blocks at one end.
    const rope = new THREE.CylinderGeometry(0.05, 0.05, L, 8).rotateZ(Math.PI / 2);
    const ropeMaterial = new THREE.MeshStandardMaterial({ color: 0xd8423a });
    for (let i = 1; i < lanes; i++) {
      const mesh = new THREE.Mesh(rope, ropeMaterial);
      mesh.position.set(0, 0.06, -W / 2 + i * lane);
      group.add(mesh);
    }
    for (let i = 0; i < lanes; i++) group.add(box(0.5, 0.75, 0.5, 0xf2f2f2, -L / 2 - 0.6, 0, -W / 2 + (i + 0.5) * lane));

    return {
      object: group,
      label: 'Alberca olímpica · 50 × 25 m',
      labelHeight: 2,
      labelSize: 1,
      // You walk around the water on the deck; the starting blocks stand on it.
      solids: [
        { minX: -L / 2 - 0.3, maxX: L / 2 + 0.3, minZ: -W / 2 - 0.3, maxZ: W / 2 + 0.3 },
        { minX: -L / 2 - 0.85, maxX: -L / 2 - 0.35, minZ: -W / 2, maxZ: W / 2 },
      ],
    };
  },
};
