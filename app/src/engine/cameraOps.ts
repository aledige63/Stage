import * as THREE from 'three';
import type { Aspect, CameraState, Vec3 } from '../store';
import type { Shake } from './handheld';

// Operazioni di camera "cinematografiche". Ognuna prende uno stato e ne restituisce uno nuovo,
// così le stesse funzioni serviranno anche alla timeline (fase 2).

const UP = new THREE.Vector3(0, 1, 0);
const DEG = Math.PI / 180;
export const MIN_DISTANCE = 0.3;
export const MIN_HEIGHT = 0.05;
export const FOCAL_MIN = 12;
export const FOCAL_MAX = 200;
export const FILM_GAUGE = 36; // full frame
export const ROLL_MAX = 360; // gradi: permette un giro completo (barrel roll)

const v = (a: Vec3) => new THREE.Vector3(a[0], a[1], a[2]);
const arr = (x: THREE.Vector3): Vec3 => [x.x, x.y, x.z];
const clamp = THREE.MathUtils.clamp;

function withPos(c: CameraState, P: THREE.Vector3, T = v(c.target)): CameraState {
  // la camera non scende sotto il pavimento
  if (P.y < MIN_HEIGHT) P.y = MIN_HEIGHT;
  return { ...c, pos: arr(P), target: arr(T) };
}

function basis(c: CameraState) {
  const P = v(c.pos);
  const T = v(c.target);
  const forward = T.clone().sub(P).normalize();
  const right = forward.clone().cross(UP);
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
  right.normalize();
  return { P, T, forward, right };
}

/** Rotazione attorno al soggetto (target). dAz/dEl in radianti; dAz>0 = la camera va a destra. */
export function orbit(c: CameraState, dAz: number, dEl: number): CameraState {
  const P = v(c.pos);
  const T = v(c.target);
  const s = new THREE.Spherical().setFromVector3(P.clone().sub(T));
  s.theta += dAz;
  s.phi = clamp(s.phi - dEl, 0.05, Math.PI - 0.05);
  return withPos(c, T.clone().add(new THREE.Vector3().setFromSpherical(s)), T);
}

/** Dolly / push: la camera avanza (d>0) o arretra verso il target. */
export function dolly(c: CameraState, d: number): CameraState {
  const { P, T, forward } = basis(c);
  const dist = Math.max(MIN_DISTANCE, P.distanceTo(T) - d);
  return withPos(c, T.clone().addScaledVector(forward, -dist), T);
}

/** Truck: spostamento laterale di camera e target (d>0 = destra). */
export function truck(c: CameraState, d: number): CameraState {
  const { P, T, right } = basis(c);
  return withPos(c, P.addScaledVector(right, d), T.addScaledVector(right, d));
}

/** Pedestal: camera e target salgono/scendono insieme, l'inclinazione non cambia. */
export function pedestal(c: CameraState, d: number): CameraState {
  const P = v(c.pos);
  const T = v(c.target);
  if (P.y + d < MIN_HEIGHT) d = MIN_HEIGHT - P.y;
  P.y += d;
  T.y += d;
  return withPos(c, P, T);
}

/** Crane: la camera sale/scende restando puntata sul soggetto. */
export function crane(c: CameraState, d: number): CameraState {
  const P = v(c.pos);
  P.y += d;
  return withPos(c, P);
}

/** Pan: la camera ruota su se stessa in orizzontale (a>0 = sinistra). */
export function pan(c: CameraState, a: number): CameraState {
  const P = v(c.pos);
  const off = v(c.target).sub(P).applyAxisAngle(UP, a);
  return withPos(c, P, P.clone().add(off));
}

/** Tilt: la camera ruota su se stessa in verticale (a>0 = su). */
export function tilt(c: CameraState, a: number): CameraState {
  const { P, T, right } = basis(c);
  const off = T.clone().sub(P);
  const len = off.length();
  const pitch = Math.asin(clamp(off.y / len, -1, 1));
  const next = clamp(pitch + a, -85 * DEG, 85 * DEG);
  off.applyAxisAngle(right, next - pitch);
  return withPos(c, P, P.clone().add(off));
}

export function roll(c: CameraState, degrees: number): CameraState {
  return { ...c, roll: clamp(c.roll + degrees, -ROLL_MAX, ROLL_MAX) };
}

/** Zoom ottico: cambia solo la focale. k>0 = zoom in (scala logaritmica). */
export function zoom(c: CameraState, k: number): CameraState {
  return { ...c, focal: clamp(c.focal * Math.exp(k), FOCAL_MIN, FOCAL_MAX) };
}

export const aspectValue = (a: Aspect) => (a === '16:9' ? 16 / 9 : 9 / 16);

/** Tangente di metà campo verticale, con la stessa convenzione di THREE.PerspectiveCamera. */
function halfVerticalTan(focal: number, aspect: number) {
  const filmHeight = FILM_GAUGE / Math.max(aspect, 1);
  return filmHeight / 2 / focal;
}

export type Framing = 'intera' | 'mezza' | 'primo';

const FRAMINGS: Record<Framing, { center: number; halfHeight: number }> = {
  intera: { center: 0.95, halfHeight: 1.1 },
  mezza: { center: 1.3, halfHeight: 0.6 },
  primo: { center: 1.6, halfHeight: 0.26 },
};

/**
 * Inquadratura standard del soggetto, mantenendo la direzione da cui la camera lo guarda.
 * scale = altezza del soggetto / altezza del manichino (1 = 1,8 m).
 */
export function frame(c: CameraState, subject: Vec3, kind: Framing, aspect: Aspect, scale = 1): CameraState {
  const f = { center: FRAMINGS[kind].center * scale, halfHeight: FRAMINGS[kind].halfHeight * scale };
  const T = new THREE.Vector3(subject[0], subject[1] + f.center, subject[2]);
  const dir = v(c.pos).sub(T);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const dist = f.halfHeight / halfVerticalTan(c.focal, aspectValue(aspect));
  return { ...c, roll: 0, pos: arr(T.clone().addScaledVector(dir, dist)), target: arr(T) };
}

export function applyToCamera(cam: THREE.PerspectiveCamera, c: CameraState, aspect: number, shake?: Shake) {
  cam.aspect = aspect;
  cam.filmGauge = FILM_GAUGE;
  cam.position.set(c.pos[0], c.pos[1], c.pos[2]);
  cam.up.copy(UP);
  cam.lookAt(c.target[0], c.target[1], c.target[2]);
  cam.rotateZ(-c.roll * DEG);
  if (shake) {
    cam.rotateY(shake.yaw);
    cam.rotateX(shake.pitch);
    cam.rotateZ(shake.roll);
    cam.translateX(shake.x);
    cam.translateY(shake.y);
    cam.translateZ(shake.z);
  }
  cam.setFocalLength(c.focal);
}

/** Inclinazione della camera in gradi: negativa = guarda in basso. */
export function pitchDegrees(c: CameraState) {
  const d = v(c.target).sub(v(c.pos)).normalize();
  return Math.asin(clamp(d.y, -1, 1)) / DEG;
}

/** Cambia l'altezza della camera restando puntata sul target. */
export function setHeight(c: CameraState, y: number): CameraState {
  const P = v(c.pos);
  P.y = y;
  return withPos(c, P);
}

export function distance(c: CameraState) {
  return v(c.pos).distanceTo(v(c.target));
}

// ---------------------------------------------------------------------------
// Movimenti continui (tastiera e pulsanti "tieni premuto")
// ---------------------------------------------------------------------------

export type Action = 'orbitAz' | 'orbitEl' | 'dolly' | 'truck' | 'pedestal' | 'crane' | 'pan' | 'tilt' | 'roll' | 'zoom';

/** amount = segno × secondi × moltiplicatore di velocità */
export function step(c: CameraState, action: Action, amount: number): CameraState {
  switch (action) {
    case 'orbitAz': return orbit(c, amount * 45 * DEG, 0);
    case 'orbitEl': return orbit(c, 0, amount * 30 * DEG);
    case 'dolly': return dolly(c, amount * Math.max(0.3, distance(c) * 0.6));
    case 'truck': return truck(c, amount * 1.2);
    case 'pedestal': return pedestal(c, amount * 1.2);
    case 'crane': return crane(c, amount * 1.2);
    case 'pan': return pan(c, amount * 30 * DEG);
    case 'tilt': return tilt(c, amount * 30 * DEG);
    case 'roll': return roll(c, amount * 30);
    case 'zoom': return zoom(c, amount * 0.7);
  }
}

// ---------------------------------------------------------------------------
// Camera trascinata col gizmo in vista regia
// ---------------------------------------------------------------------------

const tmpCam = new THREE.Object3D();
const BACK = new THREE.Vector3(0, 0, -1);

/** Orientamento della camera (senza mano libera): come applyToCamera. */
export function cameraQuaternion(c: CameraState, out = new THREE.Quaternion()) {
  tmpCam.position.set(c.pos[0], c.pos[1], c.pos[2]);
  tmpCam.up.copy(UP);
  // Object3D.lookAt punta l'asse +Z: per le camere serve -Z, quindi si guarda dalla parte opposta
  const P = v(c.pos);
  tmpCam.lookAt(P.clone().multiplyScalar(2).sub(v(c.target)));
  tmpCam.rotateZ(-c.roll * DEG);
  return out.copy(tmpCam.quaternion);
}

/**
 * Sposta la camera senza cambiare la direzione dello sguardo: anche il target trasla
 * (come un carrello). La camera non scende sotto il pavimento.
 */
export function moveCameraTo(c: CameraState, pos: Vec3): CameraState {
  const P = v(pos);
  if (P.y < MIN_HEIGHT) P.y = MIN_HEIGHT;
  const delta = P.clone().sub(v(c.pos));
  return { ...c, pos: arr(P), target: arr(v(c.target).add(delta)) };
}

/**
 * Ruota la camera sul proprio asse: il target resta alla stessa distanza nella nuova direzione
 * e il roll si ricava dall'orientamento (vicino a quello di partenza, senza salti di 360°).
 */
export function rotateCameraTo(c: CameraState, q: THREE.Quaternion): CameraState {
  const P = v(c.pos);
  const dist = Math.max(MIN_DISTANCE, P.distanceTo(v(c.target)));
  const forward = BACK.clone().applyQuaternion(q);
  // niente sguardo perfettamente verticale: lookAt perderebbe il riferimento
  if (Math.abs(forward.y) > 0.995) return c;
  const target = P.clone().addScaledVector(forward, dist);
  const base = cameraQuaternion({ ...c, target: arr(target), roll: 0 });
  const rel = base.invert().multiply(q);
  let r = (-2 * Math.atan2(rel.z, rel.w)) / DEG;
  r += Math.round((c.roll - r) / 360) * 360;
  return { ...c, target: arr(target), roll: clamp(r, -ROLL_MAX, ROLL_MAX) };
}

/** Solo il roll: la direzione dello sguardo resta quella di c. */
export function rollCameraTo(c: CameraState, q: THREE.Quaternion): CameraState {
  const base = cameraQuaternion({ ...c, roll: 0 });
  const rel = base.invert().multiply(q);
  let r = (-2 * Math.atan2(rel.z, rel.w)) / DEG;
  r += Math.round((c.roll - r) / 360) * 360;
  return { ...c, roll: clamp(r, -ROLL_MAX, ROLL_MAX) };
}
