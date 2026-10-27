import * as THREE from 'three';
import type { Rect } from '../../money/layout';
import type { Footprint } from '../../museum/referenceLayout';
import { ARENA, VERDE } from '../palette';

// Familiar objects at real scale, built from primitives. Each one is centered on its local
// origin and fits inside its footprint, so the room planner can place it without building it.

export interface Reference {
  object: THREE.Object3D;
  label?: string;
  labelHeight?: number;
  labelSize?: number; // text height in meters; big objects are seen from far away
  solids: Rect[]; // footprints you can't walk through, relative to the object's center
}

export interface ReferenceSpec {
  footprint: Footprint;
  build: (anisotropy: number) => Reference;
}

export const box = (w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color }));
  mesh.position.set(x, y + h / 2, z); // y is the bottom of the box
  return mesh;
};

export const centered = (w: number, d: number): Rect => ({ minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2 });

// A wheel lying on its side with the axle along Z, resting on the floor.
export function wheels(radius: number, width: number, xs: number[], halfTrack: number, color = 0x1a1a1a) {
  const geometry = new THREE.CylinderGeometry(radius, radius, width, 16);
  geometry.rotateX(Math.PI / 2); // cylinders stand along Y; lay the axle along Z
  const material = new THREE.MeshStandardMaterial({ color });
  const group = new THREE.Group();
  for (const x of xs) {
    for (const z of [-halfTrack, halfTrack]) {
      const wheel = new THREE.Mesh(geometry, material);
      wheel.position.set(x, radius, z);
      group.add(wheel);
    }
  }
  return group;
}

// A flat surface painted with Canvas 2D in meters: `paint` draws with 1 unit = 1 meter,
// x across the width (X) and y across the depth (Z), the top of the canvas toward -Z.
export function paintedFloor(
  width: number,
  depth: number,
  pxPerMeter: number,
  anisotropy: number,
  paint: (ctx: CanvasRenderingContext2D) => void,
): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * pxPerMeter);
  canvas.height = Math.round(depth * pxPerMeter);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(pxPerMeter, pxPerMeter); // from here on, draw in meters
  paint(ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy; // floors are mostly seen at a very low angle
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    // The depth buffer's precision drops with distance: from the aerial view, 1 cm above the
    // floor is too close to call, and floor and grid flicker through ("z-fighting").
    // polygonOffset nudges the surface's depth toward the camera so it always wins.
    new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  );
  surface.rotation.x = -Math.PI / 2; // PlaneGeometry is vertical (XY); lay it flat on the ground (XZ)
  surface.position.y = 0.01;
  return surface;
}

// A Sprite is a flat image that always turns to face the camera — handy for labels.
export function makeLabel(text: string, heightMeters = 0.35): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const font = '600 44px system-ui, sans-serif';
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + 48;
  canvas.height = 72;
  ctx.font = font; // resizing a canvas resets its state
  ctx.fillStyle = VERDE;
  ctx.beginPath();
  ctx.roundRect(0, 0, canvas.width, canvas.height, 36);
  ctx.fill();
  ctx.fillStyle = ARENA;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 24, canvas.height / 2 + 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false }));
  sprite.scale.set((canvas.width / canvas.height) * heightMeters, heightMeters, 1);
  return sprite;
}
