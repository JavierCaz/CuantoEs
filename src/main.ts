import type * as THREE from 'three';
import './style.css';
import { World } from './scene/World';
import { Warehouse } from './scene/Warehouse';
import { REFERENCES, References, TEMPORAL_REFERENCES, type ReferenceId } from './scene/references';
import { Signage, type SignTexts } from './scene/Signage';
import { AerialView } from './scene/AerialView';
import { Player } from './controls/Player';
import { DesktopControls } from './controls/DesktopControls';
import { TouchControls } from './controls/TouchControls';
import { Collider } from './controls/collision';
import { DEFAULT_BILL } from './money/denominations';
import { computeLayout, type Layout } from './money/layout';
import { MoneyRenderer } from './money/MoneyRenderer';
import { formatNumber, parseAmount, shortAmount } from './i18n/format';
import { MAX_AMOUNT, mountAmountInput } from './ui/AmountInput';
import { mountPresetPanel } from './ui/PresetPanel';
import { renderHud } from './ui/Hud';
import {
  ROOMS,
  crossedDoor,
  exitSide,
  nearestRoom,
  planRoom,
  roomIndex,
  transferPose,
  walkBounds,
  wallRects,
  type Door,
  type Pose,
  type RoomPlan,
} from './museum/rooms';

const FADE_MS = 160; // matches the .fade transition in style.css

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const app = $('app');
const overlay = $('overlay');
const hint = $('hint');
const debug = $('debug');
const fade = $('fade');
const panelDetails = $<HTMLDetailsElement>('panel-details');
const aerialButton = $<HTMLButtonElement>('aerial');
const isTouch = window.matchMedia('(pointer: coarse)').matches;

// ---------- 3D scene ----------

const world = new World(app, { lowPower: isTouch });
const money = new MoneyRenderer(DEFAULT_BILL, world.maxAnisotropy);
world.scene.add(money.group);
const aerial = new AerialView(world.camera);

// A museum room by its place in the tour, or the Sala temporal for an amount someone typed.
type Room = { index: number } | { temporal: number };
// How you get into a room: from the start (menu, link, first load) or walking through a door.
type Arrival = 'start' | { via: 'entry' | 'exit'; from: Door; pose: Pose; pitch: number };

let current: Room;
let plan: RoomPlan;
let layout: Layout;
let warehouse: Warehouse | null = null;
let references: References | null = null;
let signage: Signage | null = null;
const player = new Player({ minX: 0, maxX: 0, minZ: 0, maxZ: 0 });

// Only the room you're in exists: building one disposes the last.
function buildScene(room: Room) {
  const preset = 'index' in room ? ROOMS[room.index] : undefined;
  layout = computeLayout(preset?.monto ?? (room as { temporal: number }).temporal, DEFAULT_BILL);
  money.show(layout);

  const ids = (preset?.referencias as ReferenceId[] | undefined) ?? TEMPORAL_REFERENCES;
  plan = planRoom(
    layout,
    ids.map((id) => REFERENCES[id].footprint),
    'index' in room ? { entry: room.index > 0, exit: exitSide(room.index) } : { entry: true, exit: null },
  );

  warehouse?.dispose();
  references?.dispose();
  signage?.dispose();
  warehouse = new Warehouse(plan);
  references = new References(ids, plan.references, world.maxAnisotropy);
  signage = new Signage(plan, signTexts(room));
  world.scene.add(warehouse.group, references.group, signage.group);

  player.collider = new Collider([
    ...money.obstacles(layout),
    ...references.rects,
    ...signage.rects,
    ...wallRects(plan),
  ]);
  player.setBounds(walkBounds(plan));

  world.fitShadowTo(plan.area, plan.height);
  aerial.setArea(plan.content, plan.height);
  const fog = world.scene.fog as THREE.Fog;
  fog.far = Math.max(120, Math.hypot(warehouse.width, warehouse.depth) * 2);
}

function signTexts(room: Room): SignTexts {
  if ('temporal' in room) {
    const back = nearestRoom(room.temporal);
    return {
      kicker: 'Sala temporal',
      title: 'Tu monto',
      amount: shortAmount(room.temporal),
      hint: 'Vuelve al museo por la puerta detrás de ti',
      entry: { kicker: `Volver al museo · Sala ${back + 1}`, name: ROOMS[back].titulo },
    };
  }
  const i = room.index;
  const last = i === ROOMS.length - 1;
  const doorSign = (j: number, kicker: string) => ({
    kicker: `${kicker} · Sala ${j + 1}`,
    name: `${ROOMS[j].titulo} · ${shortAmount(ROOMS[j].monto)}`,
  });
  return {
    kicker: `Sala ${i + 1} de ${ROOMS.length}`,
    title: ROOMS[i].titulo,
    amount: shortAmount(ROOMS[i].monto),
    hint: last ? 'Fin del recorrido · elige otra sala en el menú' : 'Sigue las flechas a la siguiente sala',
    exit: last ? undefined : doorSign(i + 1, 'Siguiente'),
    entry: i > 0 ? doorSign(i - 1, 'Volver') : undefined,
  };
}

// ---------- App state: one function changes everything ----------

const presetPanel = mountPresetPanel($('presets'), ROOMS, (index) => travel({ index }));

function enterRoom(room: Room, arrival: Arrival = 'start') {
  current = room;
  buildScene(room);

  if (arrival === 'start') {
    player.spawn(plan.spawn.x, plan.spawn.z);
  } else {
    const pose = transferPose(arrival.pose, arrival.from, plan[arrival.via]!);
    player.spawn(pose.x, pose.z, pose.yaw);
    player.pitch = arrival.pitch;
  }
  if (aerial.isWalking) player.applyTo(world.camera);

  const preset = 'index' in room ? ROOMS[room.index] : undefined;
  const amount = preset?.monto ?? (room as { temporal: number }).temporal;
  renderHud(
    { amount: $('hud-amount'), words: $('hud-words'), alt: $('hud-alt'), details: $('hud-details') },
    layout,
    amount,
    preset,
  );
  presetPanel.setActive(preset?.id ?? null);

  // Keep the URL shareable without adding a history entry per change.
  const params = new URLSearchParams();
  if (preset) params.set('preset', preset.id);
  else params.set('monto', String(amount));
  history.replaceState(null, '', `?${params}`);
}

// Fade to the mist's color, swap rooms behind it, fade back.
let transitioning = false;
function travel(room: Room, arrival: Arrival = 'start') {
  if (transitioning) return;
  transitioning = true;
  fade.classList.add('on');
  setTimeout(() => {
    enterRoom(room, arrival);
    fade.classList.remove('on');
    transitioning = false;
  }, FADE_MS);
}

function walkThrough(which: 'entry' | 'exit') {
  const from = plan[which]!;
  const pose = { x: player.position.x, z: player.position.z, yaw: player.yaw };
  if ('temporal' in current) return travel({ index: nearestRoom(current.temporal) });
  // Out through the exit, in through the next room's entry; and the other way around going back.
  const index = current.index + (which === 'exit' ? 1 : -1);
  travel({ index }, { via: which === 'exit' ? 'entry' : 'exit', from, pose, pitch: player.pitch });
}

mountAmountInput($('amount-form'), $('amount-input'), $('amount-preview'), (amount) => travel({ temporal: amount }));

function roomFromUrl(): Room {
  const params = new URLSearchParams(location.search);
  const index = roomIndex(params.get('preset'));
  if (index >= 0) return { index };
  const monto = parseAmount(params.get('monto') ?? '');
  if (monto !== null && monto >= 500 && monto <= MAX_AMOUNT) return { temporal: monto };
  return { index: 0 }; // the start of the tour
}

enterRoom(roomFromUrl());

// ---------- Input ----------

const canvas = world.renderer.domElement;

function toggleAerial() {
  aerial.toggle();
  aerialButton.textContent = aerial.mode === 'toAerial' ? 'Volver a caminar' : 'Vista aérea';
}
aerialButton.addEventListener('click', toggleAerial);
document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyV' && !(e.target instanceof HTMLInputElement)) toggleAerial();
});

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
// Dev-only handle for poking at the scene from the browser console: __cuantoes.player.spawn(2.75, 5)
if (import.meta.env.DEV) Object.assign(window, { __cuantoes: { world, player, plan: () => plan } });

world.onUpdate((dt) => {
  money.update(dt);
  warehouse?.update(dt);
  if (aerial.isWalking) {
    player.update(dt);
    player.applyTo(world.camera);
    const door = transitioning ? null : crossedDoor(player.position, plan);
    if (door) walkThrough(door);
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
    `x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)} m\n` +
    `${fps} fps · ${world.renderer.info.render.calls} draw calls · ${formatNumber(world.renderer.info.render.triangles)} triángulos`;
});

world.start();
