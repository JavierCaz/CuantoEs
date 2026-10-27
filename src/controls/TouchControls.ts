import type { Player } from './Player';

const LOOK_SENSITIVITY = 0.005; // radians per pixel
const JOYSTICK_RADIUS = 50; // px of knob travel for full speed
const RUN_THRESHOLD = 0.95;

// Left half of the screen: a floating joystick that appears where the thumb lands.
// Right half: drag to look around. Each finger is tracked by its pointerId.
export class TouchControls {
  private joystickId: number | null = null;
  private lookId: number | null = null;
  private origin = { x: 0, y: 0 };
  private lastLook = { x: 0, y: 0 };
  private base: HTMLDivElement;
  private knob: HTMLDivElement;

  constructor(
    private player: Player,
    private surface: HTMLElement,
  ) {
    this.base = document.createElement('div');
    this.base.className = 'joystick';
    this.base.hidden = true;
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.base.append(this.knob);
    surface.parentElement!.append(this.base);

    surface.addEventListener('pointerdown', (e) => this.onDown(e));
    surface.addEventListener('pointermove', (e) => this.onMove(e));
    surface.addEventListener('pointerup', (e) => this.onUp(e));
    surface.addEventListener('pointercancel', (e) => this.onUp(e));
  }

  private onDown(e: PointerEvent) {
    if (e.pointerType !== 'touch') return;
    this.surface.setPointerCapture(e.pointerId);

    if (e.clientX < window.innerWidth / 2 && this.joystickId === null) {
      this.joystickId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.hidden = false;
      this.setKnob(0, 0);
    } else if (this.lookId === null) {
      this.lookId = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  private onMove(e: PointerEvent) {
    if (e.pointerId === this.joystickId) {
      let dx = e.clientX - this.origin.x;
      let dy = e.clientY - this.origin.y;
      const dist = Math.hypot(dx, dy);
      if (dist > JOYSTICK_RADIUS) {
        dx = (dx / dist) * JOYSTICK_RADIUS;
        dy = (dy / dist) * JOYSTICK_RADIUS;
      }
      this.setKnob(dx, dy);
      // Screen Y grows downward, so pushing the thumb up means "forward".
      this.player.move.set(dx / JOYSTICK_RADIUS, -dy / JOYSTICK_RADIUS);
      this.player.running = dist / JOYSTICK_RADIUS > RUN_THRESHOLD;
    } else if (e.pointerId === this.lookId) {
      this.player.look(
        (e.clientX - this.lastLook.x) * LOOK_SENSITIVITY,
        (e.clientY - this.lastLook.y) * LOOK_SENSITIVITY,
      );
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  private onUp(e: PointerEvent) {
    if (e.pointerId === this.joystickId) {
      this.joystickId = null;
      this.base.hidden = true;
      this.player.move.set(0, 0);
      this.player.running = false;
    } else if (e.pointerId === this.lookId) {
      this.lookId = null;
    }
  }

  private setKnob(dx: number, dy: number) {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
