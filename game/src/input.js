// Input: keyboard, mouse and touch, reduced to one steering frame per tick.
// Arrow keys / WASD fly the plane, W/S or Shift/Ctrl work the throttle, Enter starts,
// R restarts, P pauses, M mutes. Dragging with mouse or finger steers toward the pointer.
import { clamp } from './random.js';

const KEYMAP = {
  ArrowUp: 'pitchUp',
  KeyW: 'throttleUp',
  ArrowDown: 'pitchDown',
  KeyS: 'throttleDown',
  ArrowLeft: 'bankLeft',
  KeyA: 'bankLeft',
  ArrowRight: 'bankRight',
  KeyD: 'bankRight',
  ShiftLeft: 'throttleUp',
  ShiftRight: 'throttleUp',
  ControlLeft: 'throttleDown',
  ControlRight: 'throttleDown',
};

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pointer = { x: 0, y: 0, active: false };
    this.pressed = new Set(); // edge-triggered keys, consumed once per frame
    this.muted = false;

    window.addEventListener('keydown', (event) => {
      if (event.repeat) return;
      const action = KEYMAP[event.code];
      if (action) {
        this.keys.add(action);
        event.preventDefault();
      }
      if (['Enter', 'Space', 'KeyR', 'KeyP', 'KeyM'].includes(event.code)) {
        this.pressed.add(event.code);
        event.preventDefault();
      }
    });
    window.addEventListener('keyup', (event) => {
      const action = KEYMAP[event.code];
      if (action) this.keys.delete(action);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.pointer.active = false;
    });

    const track = (event) => {
      const rect = canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
      this.pointer.active = true;
    };
    canvas.addEventListener('pointerdown', track);
    canvas.addEventListener('pointermove', (event) => {
      if (event.buttons > 0 || event.pointerType === 'touch') track(event);
    });
    window.addEventListener('pointerup', () => {
      this.pointer.active = false;
    });
  }

  /** Steering for this tick: bank/pitch in [-1, 1], throttle nudges, plus edges. */
  read() {
    let bank = 0;
    let pitch = 0;
    if (this.keys.has('bankLeft')) bank -= 1;
    if (this.keys.has('bankRight')) bank += 1;
    if (this.keys.has('pitchUp')) pitch -= 1; // pull back = climb
    if (this.keys.has('pitchDown')) pitch += 1; // push forward = descend
    if (this.pointer.active) {
      // Dragging steers toward the pointer: right = bank right, up = climb.
      bank = clamp(this.pointer.x * 1.4, -1, 1);
      pitch = clamp(this.pointer.y * 1.2, -1, 1);
    }
    let throttleDelta = 0;
    if (this.keys.has('throttleUp')) throttleDelta += 1;
    if (this.keys.has('throttleDown')) throttleDelta -= 1;
    const out = {
      bank: clamp(bank, -1, 1),
      pitch: clamp(pitch, -1, 1),
      throttleDelta,
      enter: this.pressed.has('Enter') || this.pressed.has('Space'),
      restart: this.pressed.has('KeyR'),
      pause: this.pressed.has('KeyP'),
      mute: this.pressed.has('KeyM'),
    };
    this.pressed.clear();
    return out;
  }
}
