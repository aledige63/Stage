import * as THREE from 'three';
import type { CameraState, Easing, Keyframe, PathMode, Vec3 } from '../store';

export const EASE: Record<Easing, (u: number) => number> = {
  linear: u => u,
  in: u => u * u * u,
  out: u => 1 - Math.pow(1 - u, 3),
  inout: u => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  // fermo sul keyframe di partenza fino al successivo
  hold: u => (u >= 1 ? 1 : 0),
};

export const EASING_LABELS: Record<Easing, string> = {
  linear: 'Linear',
  in: 'Ease In',
  out: 'Ease Out',
  inout: 'Ease In-Out',
  hold: 'Hold',
};

const lerp = THREE.MathUtils.lerp;
const v = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);

function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

const yawOf = (c: CameraState) => Math.atan2(c.target[0] - c.pos[0], c.target[2] - c.pos[2]);

/** Due pose con la camera nello stesso punto (entro 1 cm) sono sempre una panoramica. */
export function segmentPath(a: CameraState, b: CameraState, path: PathMode): PathMode {
  return v(a.pos).distanceTo(v(b.pos)) < 0.01 ? 'pan' : path;
}

/** Rotazione orizzontale di una panoramica in radianti: positiva = verso sinistra. */
export function panDelta(a: CameraState, b: CameraState, extraTurns = 0) {
  return wrapAngle(yawOf(b) - yawOf(a)) + extraTurns * Math.PI * 2;
}

export function interpolate(a: CameraState, b: CameraState, e: number, path: PathMode, extraTurns = 0): CameraState {
  const common = { roll: lerp(a.roll, b.roll, e), focal: Math.exp(lerp(Math.log(a.focal), Math.log(b.focal), e)) };

  if (segmentPath(a, b, path) === 'pan') {
    // la camera ruota su se stessa: si interpolano gli angoli, non il punto mirato
    const P = v(a.pos).lerp(v(b.pos), e);
    const da = v(a.target).sub(v(a.pos));
    const db = v(b.target).sub(v(b.pos));
    const la = da.length();
    const lb = db.length();
    const pitch = lerp(Math.asin(da.y / la), Math.asin(db.y / lb), e);
    const yaw = yawOf(a) + panDelta(a, b, extraTurns) * e;
    const dist = lerp(la, lb, e);
    const c = Math.cos(pitch) * dist;
    return {
      ...common,
      pos: [P.x, P.y, P.z],
      target: [P.x + Math.sin(yaw) * c, P.y + Math.sin(pitch) * dist, P.z + Math.cos(yaw) * c],
    };
  }

  const Ta = v(a.target);
  const Tb = v(b.target);
  const T = Ta.clone().lerp(Tb, e);
  let P: THREE.Vector3;

  if (path === 'arc') {
    // posizione in coordinate sferiche attorno al target: le orbite restano archi
    const sa = new THREE.Spherical().setFromVector3(v(a.pos).sub(Ta));
    const sb = new THREE.Spherical().setFromVector3(v(b.pos).sub(Tb));
    const s = new THREE.Spherical(
      lerp(sa.radius, sb.radius, e),
      lerp(sa.phi, sb.phi, e),
      sa.theta + wrapAngle(sb.theta - sa.theta) * e,
    );
    P = T.clone().add(new THREE.Vector3().setFromSpherical(s));
  } else {
    P = v(a.pos).lerp(v(b.pos), e);
  }

  return {
    pos: [P.x, P.y, P.z],
    target: [T.x, T.y, T.z],
    // roll lineare, zoom percettivamente uniforme
    ...common,
  };
}

/** Camera al tempo t. I keyframe devono essere ordinati per tempo e non vuoti. */
export function evaluate(keys: Keyframe[], t: number): CameraState {
  if (t <= keys[0].time) return keys[0].camera;
  const last = keys[keys.length - 1];
  if (t >= last.time) return last.camera;
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].time) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.time - a.time;
  const u = span > 0 ? (t - a.time) / span : 1;
  return interpolate(a.camera, b.camera, EASE[a.easing](u), a.path, a.extraTurns);
}

/** Punti del percorso della camera, per disegnarlo nella vista regia. */
export function samplePath(keys: Keyframe[], samples: number): Vec3[] {
  if (keys.length < 2) return [];
  const t0 = keys[0].time;
  const t1 = keys[keys.length - 1].time;
  const out: Vec3[] = [];
  for (let i = 0; i <= samples; i++) {
    // campionamento in "u" per tratto: l'hold non deve nascondere la forma del percorso
    const t = lerp(t0, t1, i / samples);
    let k = 0;
    while (k < keys.length - 2 && t >= keys[k + 1].time) k++;
    const a = keys[k];
    const b = keys[k + 1];
    const span = b.time - a.time;
    const u = span > 0 ? THREE.MathUtils.clamp((t - a.time) / span, 0, 1) : 1;
    out.push(interpolate(a.camera, b.camera, u, a.path, a.extraTurns).pos);
  }
  return out;
}
