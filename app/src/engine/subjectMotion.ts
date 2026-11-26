import * as THREE from 'three';
import { subjectObject, type AppState, type CameraState, type ObjectKey, type ObjectPose, type SceneObject, type SubjectPose, type Vec3 } from '../store';
import { EASE, evaluate } from './interpolation';

// Movimento degli oggetti nel tempo (ognuno con la sua timeline) e camera che, se agganciata,
// resta puntata su un punto del soggetto principale.

const lerp = THREE.MathUtils.lerp;
const DEG = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const lerp3 = (a: Vec3, b: Vec3, e: number): Vec3 => [lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e)];

/** Posa al tempo t. I keyframe devono essere ordinati per tempo e non vuoti. */
export function evaluatePose(keys: ObjectKey[], t: number): ObjectPose {
  const pose = (k: ObjectKey): ObjectPose => ({ pos: k.pos, rot: k.rot, scale: k.scale });
  if (t <= keys[0].time) return pose(keys[0]);
  const last = keys[keys.length - 1];
  if (t >= last.time) return pose(last);
  let i = 0;
  while (i < keys.length - 2 && t >= keys[i + 1].time) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = b.time - a.time;
  const e = EASE[a.easing](span > 0 ? (t - a.time) / span : 1);
  // gradi senza giro breve: una rotazione di 270° resta di 270°
  return { pos: lerp3(a.pos, b.pos, e), rot: lerp3(a.rot, b.rot, e), scale: lerp3(a.scale, b.scale, e) };
}

/** Posa dalla timeline dell'oggetto o, senza keyframe, quella fissa. */
export function objectAt(o: SceneObject, t: number): ObjectPose {
  return o.keys?.length ? evaluatePose(o.keys, t) : { pos: o.pos, rot: o.rot, scale: o.scale };
}

/** Posa mostrata ora: quella spostata a mano non ancora salvata, oppure quella della timeline. */
export const currentPose = (s: AppState, o: SceneObject): ObjectPose => s.pendingPoses[o.id] ?? objectAt(o, s.time);

const toSubject = (p: ObjectPose): SubjectPose => ({ pos: p.pos, yaw: p.rot[1] });

/** Soggetto principale al tempo t (null se non c'è). */
export function subjectAt(s: AppState, t: number): SubjectPose | null {
  const o = subjectObject(s);
  return o ? toSubject(objectAt(o, t)) : null;
}

export function currentSubject(s: AppState): SubjectPose | null {
  const o = subjectObject(s);
  return o ? toSubject(currentPose(s, o)) : null;
}

/** Oggetto a cui è agganciato il target: quello scelto o, di base, il soggetto principale. */
export function lockTarget(s: AppState): SceneObject | null {
  if (s.lock.targetId) return s.objects.find(o => o.id === s.lock.targetId) ?? null;
  return subjectObject(s);
}

function targetAt(s: AppState, t: number): SubjectPose | null {
  const o = lockTarget(s);
  return o ? toSubject(objectAt(o, t)) : null;
}

function currentTarget(s: AppState): SubjectPose | null {
  const o = lockTarget(s);
  return o ? toSubject(currentPose(s, o)) : null;
}

/** Punto agganciato, nel mondo: l'offset ruota con l'oggetto. */
export function lockPoint(s: AppState, pose: SubjectPose): Vec3 {
  const o = new THREE.Vector3(...s.lock.offset).applyAxisAngle(UP, pose.yaw * DEG);
  return [pose.pos[0] + o.x, pose.pos[1] + o.y, pose.pos[2] + o.z];
}

export function withLock(s: AppState, c: CameraState, pose: SubjectPose | null): CameraState {
  return s.lock.enabled && pose ? { ...c, target: lockPoint(s, pose) } : c;
}

/** Camera al tempo t, con l'eventuale aggancio del target. */
export function cameraAt(s: AppState, t: number): CameraState {
  const base = s.keyframes.length ? evaluate(s.keyframes, t) : s.camera;
  return withLock(s, base, targetAt(s, t));
}

/** Camera mostrata ora (segue anche un soggetto spostato a mano). */
export const effectiveCamera = (s: AppState): CameraState => withLock(s, s.camera, currentTarget(s));

/** Punti del percorso di un oggetto, per la vista regia. */
export function sampleObjectPath(keys: ObjectKey[], samples: number): Vec3[] {
  if (keys.length < 2) return [];
  const t0 = keys[0].time;
  const t1 = keys[keys.length - 1].time;
  const out: Vec3[] = [];
  for (let i = 0; i <= samples; i++) {
    const p = evaluatePose(keys, lerp(t0, t1, i / samples)).pos;
    out.push([p[0], p[1] + 0.02, p[2]]);
  }
  return out;
}

/** true se l'oggetto si muove davvero nella sua timeline. */
export function objectMoves(o: SceneObject) {
  const k = o.keys;
  if (!k || k.length < 2) return false;
  const differs = (a: Vec3, b: Vec3, eps: number) => a.some((n, i) => Math.abs(n - b[i]) > eps);
  return k.some(x => differs(x.pos, k[0].pos, 0.05) || differs(x.rot, k[0].rot, 1) || differs(x.scale, k[0].scale, 0.02));
}
