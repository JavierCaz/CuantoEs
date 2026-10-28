import type { Player } from './Player';

const MOUSE_SENSITIVITY = 0.0022; // radians per pixel
const DOUBLE_TAP_MS = 300; // max gap between two forward presses to start sprinting
const FORWARD = ['KeyW', 'ArrowUp'];

// Keyboard + mouse through the Pointer Lock API (hides the cursor and gives raw mouse deltas).
export class DesktopControls {
  private keys = new Set<string>();
  private lastForwardTap = 0;
  private sprinting = false; // double-tap forward, lasts until forward is released

  constructor(
    private player: Player,
    private canvas: HTMLCanvasElement,
    private onLockChange: (locked: boolean) => void,
  ) {
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (!locked) this.keys.clear();
      this.syncMove();
      this.onLockChange(locked);
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.isLocked) return;
      this.player.look(e.movementX * MOUSE_SENSITIVITY, e.movementY * MOUSE_SENSITIVITY);
    });
    document.addEventListener('keydown', (e) => {
      if (!this.isLocked) return;
      if (FORWARD.includes(e.code) && !e.repeat) {
        const now = performance.now();
        if (now - this.lastForwardTap < DOUBLE_TAP_MS) this.sprinting = true;
        this.lastForwardTap = now;
      }
      this.keys.add(e.code);
      this.syncMove();
    });
    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.syncMove();
    });
  }

  get isLocked() {
    return document.pointerLockElement === this.canvas;
  }

  lock() {
    this.canvas.requestPointerLock();
  }

  private syncMove() {
    const k = (...codes: string[]) => (codes.some((c) => this.keys.has(c)) ? 1 : 0);
    this.player.move.set(
      k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft'),
      k('KeyW', 'ArrowUp') - k('KeyS', 'ArrowDown'),
    );
    if (!k(...FORWARD)) this.sprinting = false;
    this.player.running = this.sprinting;
  }
}
