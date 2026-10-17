import type { HandheldState } from '../store';

/** Scostamenti della camera a mano: rotazioni in radianti, spostamenti in metri (assi locali). */
export interface Shake {
  yaw: number;
  pitch: number;
  roll: number;
  x: number;
  y: number;
  z: number;
}

const DEG = Math.PI / 180;

// Ampiezze a intensità 100%: un operatore con camera a spalla, abbastanza nervoso
const MAX = { yaw: 1.2 * DEG, pitch: 0.9 * DEG, roll: 0.8 * DEG, x: 0.02, y: 0.025, z: 0.015 };

// Frequenze di base (Hz) di tre ondulazioni sovrapposte: lenta deriva + oscillazione + tremolio
const BASE_FREQ = [0.31, 0.83, 1.97];
const WEIGHTS = [1, 0.45, 0.18];
const NORM = WEIGHTS.reduce((a, b) => a + b, 0);

function hash(n: number) {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** Rumore morbido e ripetibile: stesso tempo e stessa variante → stesso valore. */
function channel(t: number, seed: number, k: number) {
  let v = 0;
  for (let i = 0; i < BASE_FREQ.length; i++) {
    const h = seed * 101 + k * 17 + i * 5;
    const freq = BASE_FREQ[i] * (0.85 + 0.3 * hash(h + 1));
    v += WEIGHTS[i] * Math.sin(2 * Math.PI * freq * t + hash(h) * 2 * Math.PI);
  }
  return v / NORM;
}

/**
 * Tremolio al tempo t (secondi della timeline). Dipende solo dalla timeline, così
 * l'anteprima e il video esportato coincidono fotogramma per fotogramma.
 */
export function handheldShake(h: HandheldState, t: number): Shake | undefined {
  if (!h.enabled || h.intensity <= 0) return undefined;
  const tt = t * h.frequency;
  const a = h.intensity;
  return {
    yaw: channel(tt, h.seed, 0) * MAX.yaw * a,
    pitch: channel(tt, h.seed, 1) * MAX.pitch * a,
    roll: channel(tt, h.seed, 2) * MAX.roll * a,
    x: channel(tt, h.seed, 3) * MAX.x * a,
    y: channel(tt, h.seed, 4) * MAX.y * a,
    z: channel(tt, h.seed, 5) * MAX.z * a,
  };
}
