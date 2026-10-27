import * as THREE from 'three';

// Textures painted at runtime with the Canvas 2D API, then uploaded to the GPU.
// The bill is a stylized stand-in, deliberately not a copy of Banxico's artwork.

const BLUE = '#4a7fc1';
const BLUE_DARK = '#2c5a96';
const BAND = '#e9dfc4';
const WOOD = '#9a7448';
const WOOD_DARK = '#5e4429';

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace; // canvas colors are sRGB, like CSS
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Top view of a $500 bill, 148 × 65 mm → 512 × 225 px.
export function billFace(withBand: boolean) {
  return canvasTexture(512, 225, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 512, 225);
    g.addColorStop(0, '#5b90d2');
    g.addColorStop(1, BLUE_DARK);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 225);

    ctx.strokeStyle = 'rgb(255 255 255 / 0.35)';
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 484, 197);
    ctx.beginPath();
    ctx.arc(130, 112, 58, 0, Math.PI * 2);
    ctx.fillStyle = 'rgb(255 255 255 / 0.18)';
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 96px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('500', 480, 120);
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText('PESOS MXN', 480, 165);
    ctx.font = '18px system-ui, sans-serif';
    ctx.fillStyle = 'rgb(255 255 255 / 0.7)';
    ctx.fillText('SIN VALOR', 480, 195);

    if (withBand) {
      ctx.fillStyle = BAND;
      ctx.fillRect(226, 0, 60, 225);
    }
  });
}

// Side of a stack of bills: many thin paper edges.
export function paperEdge(withBand: boolean) {
  return canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = BLUE;
    ctx.fillRect(0, 0, 256, 64);
    for (let y = 0; y < 64; y += 2) {
      ctx.fillStyle = `rgb(255 255 255 / ${0.08 + 0.1 * Math.random()})`;
      ctx.fillRect(0, y, 256, 1);
    }
    if (withBand) {
      ctx.fillStyle = BAND;
      ctx.fillRect(113, 0, 30, 64);
    }
  });
}

// Side of a full pallet: `stacks` columns of bills on top of a wooden base
// that takes up `woodFraction` of the height.
export function palletSide(stacks: number, woodFraction: number) {
  const size = 512;
  return canvasTexture(size, size, (ctx) => {
    const woodH = Math.round(size * woodFraction);
    const moneyH = size - woodH;

    ctx.fillStyle = BLUE;
    ctx.fillRect(0, 0, size, moneyH);
    for (let y = 0; y < moneyH; y += 3) {
      ctx.fillStyle = `rgb(255 255 255 / ${0.05 + 0.08 * Math.random()})`;
      ctx.fillRect(0, y, size, 1);
    }
    ctx.fillStyle = 'rgb(0 0 0 / 0.35)';
    for (let i = 1; i < stacks; i++) ctx.fillRect(Math.round((i * size) / stacks) - 1, 0, 2, moneyH);
    // Plastic wrap highlight near the top.
    ctx.fillStyle = 'rgb(255 255 255 / 0.12)';
    ctx.fillRect(0, 0, size, moneyH * 0.08);

    ctx.fillStyle = WOOD;
    ctx.fillRect(0, moneyH, size, woodH);
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(0, moneyH, size, 3);
    // Fork pockets.
    const pocketH = woodH * 0.5;
    const pocketY = moneyH + woodH * 0.3;
    ctx.fillRect(size * 0.12, pocketY, size * 0.28, pocketH);
    ctx.fillRect(size * 0.6, pocketY, size * 0.28, pocketH);
  });
}

export function repeated(texture: THREE.Texture, x: number, y: number) {
  const t = texture.clone(); // shares the image, but has its own repeat
  t.repeat.set(x, y);
  t.needsUpdate = true;
  return t;
}
