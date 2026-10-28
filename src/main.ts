import type * as THREE from 'three';
import './style.css';
import { World } from './scene/World';
import { Museum } from './scene/Museum';
import { REFERENCES, TEMPORAL_REFERENCES, type ReferenceId } from './scene/references';
import { AerialView } from './scene/AerialView';
import { Player } from './controls/Player';
import { DesktopControls } from './controls/DesktopControls';
import { TouchControls } from './controls/TouchControls';
import { Collider } from './controls/collision';
import { formatNumber, parseAmount } from './i18n/format';
import { MAX_AMOUNT, mountAmountInput } from './ui/AmountInput';
import { mountIncomeInput } from './ui/IncomeInput';
import { mountPresetPanel } from './ui/PresetPanel';
import { renderHud, renderSpaceHud } from './ui/Hud';
import { Soundtrack } from './audio/Soundtrack';
import { ROOMS } from './museum/collection';
import { planComplex, spaceIndexAt, type Complex, type Space } from './museum/complex';

const FADE_MS = 160; // matches the .fade transition in style.css

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const app = $('app');
const overlay = $('overlay');
const hint = $('hint');
const debug = $('debug');
const fade = $('fade');
const panelDetails = $<HTMLDetailsElement>('panel-details');
const aerialButton = $<HTMLButtonElement>('aerial');
const musicButton = $<HTMLButtonElement>('music');
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- 3D scene ----------

const world = new World(app, { lowPower: isTouch });
const aerial = new AerialView(world.camera, reducedMotion);
const music = new Soundtrack();
const player = new Player({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 });

let complex!: Complex; // assigned by build(), before anything reads it
let museum: Museum | null = null;
let temporal: number | null = null; // the amount on show in the Sala temporal, if any
let current = -1; // index of the space you're in
let income: number | null = null;

// The whole museum is built at once; typing an amount rebuilds it with a Sala temporal at the end.
function build() {
  museum?.dispose();
  complex = planComplex({
    footprint: (id) => REFERENCES[id as ReferenceId].footprint,
    temporal: temporal === null ? undefined : { amount: temporal, references: TEMPORAL_REFERENCES },
  });
  museum = new Museum(complex, { anisotropy: world.maxAnisotropy, reducedMotion });
  world.scene.add(museum.group);
  player.collider = new Collider(museum.rects);
  player.setBounds(complex.bounds);
  current = -1;
}

// ---------- App state: one function per change ----------

const presetPanel = mountPresetPanel($('presets'), (id) => travel(id));
const hud = { amount: $('hud-amount'), words: $('hud-words'), alt: $('hud-alt'), you: $('hud-you'), details: $('hud-details') };

// The music follows the amount; the spaces between halls keep the mood of what's around them.
function moodAmount(space: Space): number {
  if (space.kind === 'sala' || space.kind === 'temporal') return space.exhibits[0].layout.amount;
  if (space.kind === 'patio') return ROOMS.find((r) => r.sala === space.sala)!.monto;
  if (space.kind === 'reflexion') return 1e13;
  return 1e5;
}

function renderInfo(space: Space) {
  if (space.kind === 'sala' || space.kind === 'temporal') {
    const { layout } = space.exhibits[0];
    const preset = space.room !== undefined ? ROOMS[space.room] : undefined;
    renderHud(hud, layout, preset?.monto ?? temporal!, preset, income);
  } else {
    renderSpaceHud(hud, space);
  }
}

// Called whenever you step into a different space, walking or by teleport.
function enterSpace(index: number) {
  current = index;
  const space = complex.spaces[index];
  museum!.focus(index);
  world.fitShadowTo(space.area, Math.max(space.wallHeight, space.plan?.height ?? 0));
  aerial.setArea(space.area, space.plan?.height ?? space.wallHeight);
  const fog = world.scene.fog as THREE.Fog;
  fog.far = Math.max(140, Math.hypot(space.area.maxX - space.area.minX, space.area.maxZ - space.area.minZ) * 2);

  music.setAmount(moodAmount(space));
  renderInfo(space);
  presetPanel.setActive(space.id);

  // Keep the URL shareable without adding a history entry per change.
  const params = new URLSearchParams();
  if (space.room !== undefined) params.set('preset', space.id);
  else if (space.kind === 'temporal') params.set('monto', String(temporal));
  else params.set('espacio', space.id);
  history.replaceState(null, '', `?${params}`);
}

// Teleport: fade to the walls' color, move, fade back.
let transitioning = false;
function travel(id: string, before?: () => void) {
  if (transitioning) return;
  transitioning = true;
  fade.classList.add('on');
  setTimeout(() => {
    before?.();
    const index = Math.max(0, complex.spaces.findIndex((s) => s.id === id));
    const { spawn } = complex.spaces[index];
    player.spawn(spawn.x, spawn.z);
    if (aerial.isWalking) player.applyTo(world.camera);
    enterSpace(index);
    fade.classList.remove('on');
    transitioning = false;
  }, FADE_MS);
}

mountAmountInput($('amount-form'), $('amount-input'), $('amount-preview'), (amount) =>
  travel('temporal', () => {
    temporal = amount;
    build();
  }),
);

income = mountIncomeInput($('income-form'), $('income-input'), $('income-status'), (monthly) => {
  income = monthly;
  if (current >= 0) renderInfo(complex.spaces[current]);
});

function startFromUrl(): string {
  const params = new URLSearchParams(location.search);
  const preset = params.get('preset');
  if (preset && ROOMS.some((r) => r.id === preset)) return preset;
  const monto = parseAmount(params.get('monto') ?? '');
  if (monto !== null && monto >= 500 && monto <= MAX_AMOUNT) {
    temporal = monto;
    return 'temporal';
  }
  return params.get('espacio') ?? 'plaza'; // the start of the tour
}

const start = startFromUrl();
build();
const startIndex = Math.max(0, complex.spaces.findIndex((s) => s.id === start));
player.spawn(complex.spaces[startIndex].spawn.x, complex.spaces[startIndex].spawn.z);
player.applyTo(world.camera);
enterSpace(startIndex);

// ---------- Input ----------

const canvas = world.renderer.domElement;

function toggleAerial() {
  aerial.toggle();
  aerialButton.textContent = aerial.mode === 'toAerial' ? 'Volver a caminar' : 'Vista aérea';
}
aerialButton.addEventListener('click', toggleAerial);

function toggleMusic() {
  music.toggleMuted();
  musicButton.setAttribute('aria-pressed', String(!music.muted));
}
musicButton.setAttribute('aria-pressed', String(!music.muted));
musicButton.addEventListener('click', toggleMusic);

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  if (e.code === 'KeyV') toggleAerial();
  if (e.code === 'KeyM') toggleMusic();
});
// The music starts with the tour: browsers only allow audio after a click or a key.
$('enter').addEventListener('click', () => music.play());

if (isTouch) {
  panelDetails.open = false; // on phones the panel starts collapsed to its summary
  new TouchControls(player, canvas);
  $('enter').addEventListener('click', () => overlay.classList.add('hidden'));
} else {
  const desktop = new DesktopControls(player, canvas, (locked) => {
    document.body.classList.toggle('locked', locked);
    hint.hidden = locked || !overlay.classList.contains('hidden');
  });
  $('enter').addEventListener('click', () => {
    overlay.classList.add('hidden');
    desktop.lock();
  });
  canvas.addEventListener('click', () => desktop.lock());
}

// ---------- Loop ----------

let fpsFrames = 0;
let fpsTime = 0;
let fps = 0;
debug.hidden = !import.meta.env.DEV; // only during `npm run dev`
// Dev-only handle for poking at the scene from the browser console: __cuantoes.player.spawn(0, -40)
if (import.meta.env.DEV) Object.assign(window, { __cuantoes: { world, player, complex: () => complex, travel } });

world.onUpdate((dt) => {
  museum?.update(dt);
  if (aerial.isWalking) {
    player.update(dt);
    player.applyTo(world.camera);
    const index = spaceIndexAt(complex.spaces, player.position);
    if (!transitioning && index !== current) enterSpace(index);
  } else {
    aerial.update(dt, player.position, player.quaternion);
  }

  if (debug.hidden) return;
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 0.5) {
    fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }
  const p = player.position;
  debug.textContent =
    `x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)} m · ${complex.spaces[current]?.title ?? ''}\n` +
    `${fps} fps · ${world.renderer.info.render.calls} draw calls · ${formatNumber(world.renderer.info.render.triangles)} triángulos`;
});

world.start();
