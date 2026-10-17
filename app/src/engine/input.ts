import type { Action } from './cameraOps';

/** Movimenti tenuti premuti (tastiera o pulsanti), letti a ogni fotogramma dall'engine. */
export const held = new Map<string, [Action, number]>();

export const KEYMAP: Record<string, [Action, number]> = {
  ArrowLeft: ['orbitAz', -1],
  ArrowRight: ['orbitAz', 1],
  ArrowUp: ['orbitEl', 1],
  ArrowDown: ['orbitEl', -1],
  KeyW: ['dolly', 1],
  KeyS: ['dolly', -1],
  KeyA: ['truck', -1],
  KeyD: ['truck', 1],
  KeyR: ['pedestal', 1],
  KeyF: ['pedestal', -1],
  KeyT: ['crane', 1],
  KeyG: ['crane', -1],
  KeyJ: ['pan', 1],
  KeyL: ['pan', -1],
  KeyI: ['tilt', 1],
  KeyK: ['tilt', -1],
  KeyU: ['roll', -1],
  KeyO: ['roll', 1],
  KeyZ: ['zoom', 1],
  KeyX: ['zoom', -1],
};

export function press(id: string, action: Action, sign: number) {
  held.set(id, [action, sign]);
}

export function release(id: string) {
  held.delete(id);
}
