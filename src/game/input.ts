/**
 * InputManager — keyboard, optional mouse aiming and a touch virtual joystick.
 * Emits normalized movement (-1..1) and one-shot actions.
 */
import { clamp } from './utils';

export type InputAction = 'burst' | 'pause' | 'confirm' | 'back' | 'mute';

export class InputManager {
  private keys = new Set<string>();
  private el: HTMLElement | null = null;

  // mouse aim
  mouseX = 0;
  mouseY = 0;
  private lastMouseMove = -10;
  private isTouchDevice = false;

  // touch joystick
  joyActive = false;
  joyBaseX = 0;
  joyBaseY = 0;
  joyX = 0;
  joyY = 0;
  private joyTouchId: number | null = null;

  onAction: ((action: InputAction) => void) | null = null;

  attach(el: HTMLElement): void {
    this.el = el;
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    el.addEventListener('pointermove', this.handlePointerMove);
    el.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointerup', this.handlePointerUp);
    window.addEventListener('pointercancel', this.handlePointerUp);
    el.addEventListener('touchstart', this.handleTouchStart, { passive: false });
    el.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    el.addEventListener('touchend', this.handleTouchEnd);
    el.addEventListener('touchcancel', this.handleTouchEnd);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', this.handleBlur);
  }

  detach(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    if (this.el) {
      this.el.removeEventListener('pointermove', this.handlePointerMove);
      this.el.removeEventListener('pointerdown', this.handlePointerDown);
      this.el.removeEventListener('touchstart', this.handleTouchStart);
      this.el.removeEventListener('touchmove', this.handleTouchMove);
      this.el.removeEventListener('touchend', this.handleTouchEnd);
      this.el.removeEventListener('touchcancel', this.handleTouchEnd);
    }
    window.removeEventListener('pointerup', this.handlePointerUp);
    window.removeEventListener('pointercancel', this.handlePointerUp);
    window.removeEventListener('blur', this.handleBlur);
  }

  private handleBlur = (): void => {
    this.keys.clear();
    this.joyActive = false;
    this.joyTouchId = null;
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    this.keys.add(k);
    if (k === ' ' || k === 'spacebar') {
      e.preventDefault();
      this.onAction?.('burst');
    } else if (k === 'escape' || k === 'p') {
      this.onAction?.('pause');
    } else if (k === 'enter') {
      this.onAction?.('confirm');
    } else if (k === 'm') {
      this.onAction?.('mute');
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.key.toLowerCase());
  };

  private handlePointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      const rect = this.el?.getBoundingClientRect();
      if (rect) {
        this.mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouseY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        this.lastMouseMove = performance.now() / 1000;
      }
    }
  };

  private handlePointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'touch') this.isTouchDevice = true;
    // focus game canvas
    this.el?.focus?.();
  };

  private handlePointerUp = (): void => {
    // pointer joystick handled via touch events
  };

  /** Screen coords (-1..1) of a touch relative to element */
  private touchNorm(t: Touch): { x: number; y: number } {
    const rect = this.el?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((t.clientX - rect.left) / rect.width) * 2 - 1,
      y: -(((t.clientY - rect.top) / rect.height) * 2 - 1),
    };
  }

  private handleTouchStart = (e: TouchEvent): void => {
    this.isTouchDevice = true;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const n = this.touchNorm(t);
      if (n.x < 0.12 && this.joyTouchId === null) {
        this.joyTouchId = t.identifier;
        this.joyActive = true;
        this.joyBaseX = n.x;
        this.joyBaseY = n.y;
        this.joyX = 0;
        this.joyY = 0;
      }
    }
  };

  private handleTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.joyTouchId) {
        const n = this.touchNorm(t);
        const dx = n.x - this.joyBaseX;
        const dy = n.y - this.joyBaseY;
        const dead = 0.035;
        const mag = Math.hypot(dx, dy);
        const scale = mag < dead ? 0 : Math.min(1, (mag - dead) / 0.28);
        if (mag > 0.0001) {
          this.joyX = (dx / mag) * scale;
          this.joyY = (dy / mag) * scale;
        } else {
          this.joyX = 0;
          this.joyY = 0;
        }
      }
    }
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === this.joyTouchId) {
        this.joyTouchId = null;
        this.joyActive = false;
        this.joyX = 0;
        this.joyY = 0;
      }
    }
  };

  /** Movement vector in world space: x right, z down-screen (+z). */
  getMove(): { x: number; z: number } {
    let x = 0;
    let z = 0;
    if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
    if (this.keys.has('w') || this.keys.has('arrowup')) z -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) z += 1;
    if (this.joyActive) {
      x += this.joyX;
      z += -this.joyY; // screen-up is -z
    }
    const mag = Math.hypot(x, z);
    if (mag > 1) {
      x /= mag;
      z /= mag;
    }
    return { x: clamp(x, -1, 1), z: clamp(z, -1, 1) };
  }

  /** Optional mouse aim (null when inactive / touch-only). Returns radians in world angle convention. */
  getAimAngle(shipX: number, shipZ: number, worldPerScreenX: number, worldPerScreenY: number): number | null {
    if (this.isTouchDevice) return null;
    const now = performance.now() / 1000;
    if (now - this.lastMouseMove > 3.2) return null;
    const targetX = this.mouseX * worldPerScreenX;
    const targetZ = -this.mouseY * worldPerScreenY;
    const dx = targetX - shipX;
    const dz = targetZ - shipZ;
    if (Math.hypot(dx, dz) < 3) return null;
    return Math.atan2(-dz, dx);
  }

  reset(): void {
    this.keys.clear();
    this.joyActive = false;
    this.joyX = 0;
    this.joyY = 0;
  }
}
