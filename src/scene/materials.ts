import * as THREE from 'three';
import { ARENA, CARBON, TERRACOTA } from './palette';

// The museum's materials: concreto aparente, cantera, piedra volcánica, piedra pulida, madera.
// Each texture is painted once with Canvas 2D and covers `tile` meters of surface; the
// architecture computes UVs in meters (see Architecture.ts), so every wall shares one material
// and the formwork panels line up across walls, whatever their size.

export type MaterialName =
  | 'concreto'
  | 'cantera'
  | 'volcanica'
  | 'pulido'
  | 'madera'
  | 'terracota'
  | 'grava'
  | 'agua';

interface Spec {
  tile: [number, number]; // meters covered by one copy of the texture, along U and V
  px: [number, number];
  paint?: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  color?: string;
  roughness: number;
  metalness?: number;
}

// Speckles of lighter and darker paint: what keeps a flat color from looking like plastic.
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, size: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const light = Math.random() < 0.5;
    ctx.fillStyle = light ? `rgb(255 255 255 / ${alpha * Math.random()})` : `rgb(0 0 0 / ${alpha * Math.random()})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, size * (0.5 + Math.random()), size * (0.5 + Math.random()));
  }
}

const SPECS: Record<MaterialName, Spec> = {
  // Board-formed concrete panels, 1.8 × 0.9 m, with the six tie holes the formwork leaves.
  concreto: {
    tile: [1.8, 0.9],
    px: [512, 256],
    roughness: 0.95,
    paint(ctx, w, h) {
      ctx.fillStyle = '#b8b0a3';
      ctx.fillRect(0, 0, w, h);
      // Slow clouds of tone, like concrete poured on different days.
      for (let i = 0; i < 30; i++) {
        const g = ctx.createRadialGradient(Math.random() * w, Math.random() * h, 0, Math.random() * w, Math.random() * h, 60 + Math.random() * 120);
        g.addColorStop(0, `rgb(${Math.random() < 0.5 ? '255 250 240' : '90 85 78'} / 0.07)`);
        g.addColorStop(1, 'rgb(0 0 0 / 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      grain(ctx, w, h, 4000, 1.5, 0.12);
      ctx.strokeStyle = 'rgb(60 55 50 / 0.45)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.fillStyle = 'rgb(55 50 45 / 0.75)';
      for (const fx of [1 / 6, 1 / 2, 5 / 6]) {
        for (const fy of [1 / 4, 3 / 4]) {
          ctx.beginPath();
          ctx.arc(fx * w, fy * h, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  },
  // Cantera rosa in courses of 1.2 × 0.6 m blocks, each a slightly different tone.
  cantera: {
    tile: [2.4, 1.2],
    px: [512, 256],
    roughness: 0.9,
    paint(ctx, w, h) {
      const bw = w / 2;
      const bh = h / 2;
      for (let row = 0; row < 2; row++) {
        for (let col = -1; col < 3; col++) {
          const x = col * bw + (row % 2) * (bw / 2);
          const l = 62 + Math.random() * 6;
          ctx.fillStyle = `hsl(20 32% ${l}%)`;
          ctx.fillRect(x, row * bh, bw, bh);
        }
      }
      grain(ctx, w, h, 5000, 1.5, 0.15);
      ctx.fillStyle = 'rgb(90 60 45 / 0.5)';
      for (let row = 0; row <= 2; row++) ctx.fillRect(0, row * bh - 1, w, 2);
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 3; col++) ctx.fillRect(col * bw + (row % 2) * (bw / 2) - 1, row * bh, 2, bh);
      }
    },
  },
  // Recinto: dark, porous volcanic stone in 0.5 m slabs, for the plaza and the patios.
  volcanica: {
    tile: [1, 1],
    px: [256, 256],
    roughness: 1,
    paint(ctx, w, h) {
      ctx.fillStyle = '#4a4642';
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 3000, 2, 0.25);
      ctx.fillStyle = 'rgb(20 18 16 / 0.6)';
      for (let i = 0; i < 260; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 0.8 + Math.random() * 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgb(25 22 20 / 0.8)';
      ctx.fillRect(0, 0, w, 2);
      ctx.fillRect(0, h / 2 - 1, w, 2);
      ctx.fillRect(0, 0, 2, h);
      ctx.fillRect(w / 2 - 1, 0, 2, h);
    },
  },
  // Polished stone in 1 m slabs: the joints are the floor's scale grid.
  pulido: {
    tile: [1, 1],
    px: [256, 256],
    roughness: 0.38,
    paint(ctx, w, h) {
      ctx.fillStyle = '#cdbfa6';
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 1500, 2, 0.08);
      ctx.strokeStyle = 'rgb(255 255 255 / 0.12)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(Math.random() * w, 0);
        ctx.bezierCurveTo(Math.random() * w, h / 3, Math.random() * w, (2 * h) / 3, Math.random() * w, h);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgb(70 62 52 / 0.55)';
      ctx.fillRect(0, 0, w, 2);
      ctx.fillRect(0, 0, 2, h);
    },
  },
  madera: {
    tile: [1.2, 0.3],
    px: [256, 64],
    roughness: 0.75,
    paint(ctx, w, h) {
      ctx.fillStyle = '#7d5232';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        ctx.fillStyle = `rgb(${Math.random() < 0.5 ? '40 22 10' : '160 110 70'} / ${0.1 + Math.random() * 0.15})`;
        ctx.fillRect(0, y, w, 1);
      }
    },
  },
  terracota: {
    tile: [2, 2],
    px: [256, 256],
    roughness: 1,
    paint(ctx, w, h) {
      ctx.fillStyle = TERRACOTA;
      ctx.fillRect(0, 0, w, h);
      grain(ctx, w, h, 2500, 2, 0.08);
    },
  },
  grava: {
    tile: [1, 1],
    px: [256, 256],
    roughness: 1,
    paint(ctx, w, h) {
      ctx.fillStyle = ARENA;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 1800; i++) {
        const l = 55 + Math.random() * 35;
        ctx.fillStyle = `hsl(35 18% ${l}%)`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h, 1.5 + Math.random() * 2.5, 1 + Math.random() * 2, Math.random() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  // Still water: dark and glossy, so the sky and the walls show in it.
  agua: { tile: [1, 1], px: [1, 1], color: CARBON, roughness: 0.05, metalness: 0.7 },
};

const cache = new Map<MaterialName, THREE.MeshStandardMaterial>();

export function material(name: MaterialName, anisotropy = 8): THREE.MeshStandardMaterial {
  let m = cache.get(name);
  if (m) return m;
  const spec = SPECS[name];
  m = new THREE.MeshStandardMaterial({ roughness: spec.roughness, metalness: spec.metalness ?? 0 });
  if (spec.paint) {
    const canvas = document.createElement('canvas');
    [canvas.width, canvas.height] = spec.px;
    spec.paint(canvas.getContext('2d')!, canvas.width, canvas.height);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = anisotropy;
    m.map = map;
  } else {
    m.color.set(spec.color!);
  }
  m.userData.tile = spec.tile;
  m.userData.shared = true;
  cache.set(name, m);
  return m;
}

export function tileOf(m: THREE.Material): [number, number] {
  return (m.userData.tile as [number, number] | undefined) ?? [1, 1];
}
