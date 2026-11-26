import * as THREE from 'three';
import { applyToCamera } from '../engine/cameraOps';
import { panDelta } from '../engine/interpolation';
import { isMannequin, objectHeight, subjectHeight, subjectObject, type AppState, type CameraState, type ColorId, type Easing, type Keyframe, type ObjectKey, type ObjectKind, type SceneObject } from '../store';
import { cameraAt, lockTarget, objectAt, objectMoves, subjectAt } from '../engine/subjectMotion';

// Descrive in inglese il movimento della timeline, tratto per tratto, per accompagnare
// il video guida in MiniMax H3. Tre versioni: quella originale, da usare così com'è; quella per il
// Compiler MiniMax (solo il corpo narrativo, senza sezioni né segnaposto numerati); quella per
// Ref2VA, a pezzi già pronti per le sezioni del prompt strutturato.

const RAD = 180 / Math.PI;
const v = (a: [number, number, number]) => new THREE.Vector3(...a);

interface Subject {
  pos: THREE.Vector3;
  /** gradi: direzione in cui guarda il manichino */
  facing: number;
}

/** Come il testo nomina il soggetto, e se toglie le precisazioni superflue. */
interface Wording {
  subject: string;
  compact: boolean;
}

const ORIGINAL: Wording = { subject: 'the subject', compact: false };

export const DEFAULT_TOKENS = { subject: '<Subject 1>', video: '<Video 1>' };

function angleDesc(c: CameraState) {
  const dir = v(c.target).sub(v(c.pos)).normalize();
  const pitch = Math.asin(dir.y) * RAD;
  if (pitch < -50) return 'top-down overhead angle';
  if (pitch < -15) return 'high angle looking down';
  if (pitch > 15) return 'low angle looking up';
  return 'eye level';
}

/** angolo della camera attorno al soggetto, 0 = davanti, gradi */
function azimuth(c: CameraState, s: Subject) {
  const d = v(c.pos).sub(s.pos);
  return Math.atan2(d.x, d.z) * RAD - s.facing;
}

function sideDesc(c: CameraState, s: Subject, w: Wording) {
  let a = azimuth(c, s) % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  const abs = Math.abs(a);
  if (abs < 20) return 'from the front';
  if (abs > 160) return 'from behind';
  const owner = w.compact ? `${w.subject}'s` : "the subject's";
  const side = a > 0 ? `${owner} left` : `${owner} right`;
  return abs < 65 ? `three-quarter view from ${side}` : `profile view from ${side}`;
}

const wrap = (a: number) => ((a + 540) % 360) - 180;

const EASING_TEXT: Record<Easing, string> = {
  linear: 'at constant speed',
  in: 'starting slowly and accelerating',
  out: 'decelerating to a soft stop',
  inout: 'with a smooth ease-in and ease-out',
  hold: '',
};

/** sA, sB: il soggetto all'inizio e alla fine del tratto (può essersi spostato). */
function describeSegment(a: Keyframe, b: Keyframe, sA: Subject, sB: Subject, w: Wording): string {
  const A = a.camera;
  const B = b.camera;
  if (a.easing === 'hold') return 'the camera holds perfectly still';

  const parts: string[] = [];
  const PA = v(A.pos);
  const PB = v(B.pos);
  const moved = PA.distanceTo(PB);

  // orbita attorno al soggetto
  // l'orbita si misura sempre rispetto alla direzione iniziale del soggetto: se lui si gira, la camera non orbita
  const dAz = wrap(azimuth(B, { pos: sB.pos, facing: sA.facing }) - azimuth(A, sA));
  if (Math.abs(dAz) > 15 && moved > 0.3 && a.path !== 'pan') {
    // azimut crescente = la camera va verso la sua destra
    parts.push(`orbits ${Math.round(Math.abs(dAz))} degrees around ${w.subject}, moving to the ${dAz > 0 ? 'right' : 'left'}`);
  }

  // avvicinamento / allontanamento
  const flat = (p: THREE.Vector3, s: Subject) => Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
  const ratio = flat(PB, sB) / Math.max(0.01, flat(PA, sA));
  if (ratio < 0.8) parts.push(`dollies in toward ${w.subject}${w.compact ? '' : ' (physical push-in)'}`);
  else if (ratio > 1.25) parts.push(`dollies back away from ${w.subject}${w.compact ? '' : ' (pull-out)'}`);

  // movimento verticale
  const dy = PB.y - PA.y;
  const dTargetY = B.target[1] - A.target[1];
  if (Math.abs(dy) > 0.4) {
    const pedestal = Math.abs(dy - dTargetY) < 0.25;
    const verb = dy > 0 ? 'rises' : 'lowers';
    parts.push(pedestal
      ? `${verb} vertically on a pedestal from ${PA.y.toFixed(1)} m to ${PB.y.toFixed(1)} m keeping the same tilt`
      : `${verb} on a crane from ${PA.y.toFixed(1)} m to ${PB.y.toFixed(1)} m${w.compact ? '' : ' while staying aimed at the subject'}`);
  }

  // carrello laterale (camera e target si spostano insieme)
  if (Math.abs(dAz) <= 15 || moved <= 0.3) {
    const fwd = v(A.target).sub(PA).setY(0).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const lateral = PB.clone().sub(PA).dot(right);
    if (Math.abs(lateral) > 0.5) parts.push(`trucks ${lateral > 0 ? 'right' : 'left'} by about ${Math.abs(lateral).toFixed(1)} m`);
  }

  // pan / tilt con camera quasi ferma
  if (moved < 0.3 || a.path === 'pan') {
    const dA = v(A.target).sub(PA).normalize();
    const dB = v(B.target).sub(PB).normalize();
    const yaw = panDelta(A, B, a.extraTurns) * RAD;
    const pitch = (Math.asin(dB.y) - Math.asin(dA.y)) * RAD;
    if (Math.abs(yaw) > 8) parts.push(`${moved < 0.01 ? 'stays fixed in place and ' : ''}pans ${yaw > 0 ? 'left' : 'right'} ${Math.round(Math.abs(yaw))} degrees`);
    if (Math.abs(pitch) > 6) parts.push(`tilts ${pitch > 0 ? 'up' : 'down'} ${Math.round(Math.abs(pitch))} degrees`);
  }

  // zoom ottico
  const zoom = B.focal / A.focal;
  if (zoom > 1.12) parts.push(`zooms in optically from ${Math.round(A.focal)}mm to ${Math.round(B.focal)}mm`);
  else if (zoom < 0.89) parts.push(`zooms out optically from ${Math.round(A.focal)}mm to ${Math.round(B.focal)}mm`);

  // roll
  const dRoll = B.roll - A.roll;
  if (Math.abs(dRoll) > 5) {
    parts.push(Math.abs(dRoll) >= 300 ? `performs a ${Math.round(Math.abs(dRoll))}-degree barrel roll around the lens axis` : Math.abs(B.roll) < 2 ? 'rolls back to a level horizon' : `rolls to a ${Math.round(Math.abs(B.roll))}-degree dutch angle`);
  }

  if (!parts.length) return 'the camera stays almost static';
  const zoomOnly = parts.length === 1 && parts[0].startsWith('zooms');
  const joined = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
  const text = 'the camera ' + joined + ' ' + EASING_TEXT[a.easing];
  return zoomOnly ? text + ' (the camera body does not move)' : text;
}

const mannequins = (s: AppState) => s.objects.filter(o => o.kind === 'manichino' && !o.hidden).length;

function guideText(s: AppState) {
  const n = mannequins(s);
  if (s.style.subject === 'nessuno') return 'the reference video shows only a floor grid and reference columns as a spatial guide, which must not appear';
  if (n === 0) return 'the floor grid is only a motion guide and must not appear';
  const many = n > 1;
  return {
    manichino: `the ${many ? 'mannequins' : 'mannequin'} and the floor grid are only a motion guide and must not appear`,
    cilindro: `the plain ${many ? 'cylinders only mark each figure' : "cylinder only marks the subject"}'s position and scale, and together with the floor grid ${many ? 'they are' : 'it is'} only a motion guide that must not appear`,
    blocco: `the plain ${many ? 'blocks only mark each figure' : "block only marks the subject"}'s position, scale and facing direction, and together with the floor grid ${many ? 'they are' : 'it is'} only a motion guide that must not appear`,
  }[s.style.subject];
}

const SCENE_LINE = 'The simple 3D blocks in the reference video only mark the layout of the environment and must not appear literally.';

const COLOR_EN: Record<ColorId, string> = {
  grigio: 'gray', bianco: 'white', nero: 'black', rosso: 'red', blu: 'blue', giallo: 'yellow', verde: 'green', arancio: 'orange',
};
const KIND_EN: Record<Exclude<ObjectKind, 'importato'>, string> = {
  manichino: 'figure', cubo: 'cube', sfera: 'sphere', cilindro: 'cylinder', pannello: 'panel',
};

/** Come il prompt chiama un oggetto: il soggetto principale, oppure per colore e forma ("the red cube"). */
function objectName(s: AppState, o: SceneObject, w: Wording) {
  if (o.id === s.subjectId) return w.subject;
  // il nome scelto dall'utente vale così com'è
  if (o.label?.trim()) return o.label.trim();
  if (o.kind === 'importato') return `the ${o.name}`;
  return `the ${COLOR_EN[o.color ?? 'grigio']} ${KIND_EN[o.kind]}`;
}

/** Il soggetto al tempo t, con il punto di riferimento all'altezza della testa; null senza soggetto. */
function subjectInfo(s: AppState, t: number): Subject | null {
  const p = subjectAt(s, t);
  return p && { pos: new THREE.Vector3(p.pos[0], p.pos[1] + subjectHeight(s), p.pos[2]), facing: p.yaw };
}

// ---------------------------------------------------------------------------
// Chi è in campo: un oggetto può entrare o uscire dall'inquadratura durante il video
// ---------------------------------------------------------------------------

const probeCam = new THREE.PerspectiveCamera();

/** Punti di controllo di un oggetto: piedi, centro e testa, un po' a destra e a sinistra. */
function probePoints(o: SceneObject, t: number): THREE.Vector3[] {
  const pose = objectAt(o, t);
  const base = v(pose.pos);
  const h = isMannequin(o) ? objectHeight(o) : Math.max(0.2, pose.scale[1]);
  // i solidi hanno l'origine al centro, i manichini ai piedi
  const y0 = isMannequin(o) ? 0 : -h / 2;
  const half = isMannequin(o) ? 0.2 : Math.max(pose.scale[0], pose.scale[2]) / 2;
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(probeCam.quaternion).setY(0).normalize().multiplyScalar(half);
  const out: THREE.Vector3[] = [];
  for (const k of [0.05, 0.5, 0.95]) {
    const p = base.clone().setY(base.y + y0 + h * k);
    out.push(p, p.clone().add(right), p.clone().sub(right));
  }
  return out;
}

/** Posizione dell'oggetto nell'inquadratura al tempo t, o null se è fuori campo. */
function framePosition(s: AppState, o: SceneObject, t: number, aspect: number): { x: number } | null {
  applyToCamera(probeCam, cameraAt(s, t), aspect);
  probeCam.updateMatrixWorld();
  let sum = 0;
  let n = 0;
  for (const p of probePoints(o, t)) {
    const q = p.project(probeCam);
    if (q.z < 1 && Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1) { sum += q.x; n++; }
  }
  return n ? { x: sum / n } : null;
}

const inFrame = (s: AppState, o: SceneObject, t: number, aspect: number) => framePosition(s, o, t, aspect) !== null;

interface Crop {
  /** "full shot", "medium full shot", ... */
  size: string;
  /** cosa esce dai bordi: "the lower legs and feet extending beyond the bottom edge", o '' */
  cut: string;
  /** dove guarda la figura nell'inquadratura: "facing the left of the frame", o '' */
  facing: string;
}

/**
 * Inquadratura di una figura come appare davvero: quanta parte del corpo resta dentro i bordi
 * (dai piedi alla testa) e verso dove guarda. null se è fuori campo.
 */
function frameCrop(o: SceneObject, c: CameraState, t: number, aspect: number): Crop | null {
  applyToCamera(probeCam, c, aspect);
  probeCam.updateMatrixWorld();
  const pose = objectAt(o, t);
  const h = isMannequin(o) ? objectHeight(o) : Math.max(0.2, pose.scale[1]);
  const y0 = isMannequin(o) ? 0 : -h / 2;
  let low = Infinity;
  let high = -Infinity;
  let yLow = 0;
  let yHigh = 0;
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const q = new THREE.Vector3(pose.pos[0], pose.pos[1] + y0 + h * k, pose.pos[2]).project(probeCam);
    if (q.z >= 1 || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) continue;
    if (k < low) { low = k; yLow = q.y; }
    if (k > high) { high = k; yHigh = q.y; }
  }
  if (low === Infinity) return null;
  let size: string;
  let cut = '';
  if (low <= 0.04) {
    // figura intera: se occupa poco dell'altezza del fotogramma è un campo largo
    size = (yHigh - yLow) / 2 < 0.3 ? 'wide shot' : 'full shot';
  } else if (low < 0.4) {
    size = 'medium full shot';
    cut = low < 0.12 ? 'the feet extending beyond the bottom edge'
      : low < 0.28 ? 'the lower legs and feet extending beyond the bottom edge' : 'framed from the knees up';
  } else if (low < 0.62) size = 'medium shot';
  else if (low < 0.8) size = 'medium close-up';
  else size = 'close-up';
  if (high < 0.96 && low <= 0.4) cut = [cut, 'the top of the head beyond the top edge'].filter(Boolean).join(' and ');
  // direzione dello sguardo rispetto alla camera
  const yaw = pose.rot[1] / RAD;
  const look = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const camFwd = new THREE.Vector3(0, 0, -1).applyQuaternion(probeCam.quaternion).setY(0).normalize();
  const camRight = new THREE.Vector3(-camFwd.z, 0, camFwd.x);
  const side = look.dot(camRight);
  const depth = look.dot(camFwd);
  const facing = depth < -0.7 ? 'facing the camera' : depth > 0.7 ? 'with its back to the camera'
    : `facing the ${side > 0 ? 'right' : 'left'} of the frame`;
  return { size, cut: cut && (cut.startsWith('framed') ? cut : `with ${cut}`), facing };
}

/**
 * Entrate e uscite dall'inquadratura (quelle che durano meno di un quarto di secondo si ignorano).
 * Il lato è quello del bordo da cui entra o da cui esce.
 */
function frameChanges(s: AppState, o: SceneObject, aspect: number) {
  const step = 1 / s.fps;
  const samples: { t: number; pos: { x: number } | null }[] = [];
  for (let t = 0; t <= s.duration + 1e-6; t += step) samples.push({ t, pos: framePosition(s, o, t, aspect) });
  const out: { t: number; enters: boolean; side: 'left' | 'right' }[] = [];
  let shown = samples[0].pos !== null;
  for (let i = 1; i < samples.length; i++) {
    const now = samples[i].pos !== null;
    if (now === shown) continue;
    // deve restare così per almeno 0,25 s
    const until = samples.slice(i, i + Math.ceil(0.25 / step)).every(x => (x.pos !== null) === now);
    if (!until) continue;
    shown = now;
    // per il lato si guarda dove si trova appena dentro l'inquadratura
    const inside = now ? samples[i].pos! : samples[i - 1].pos!;
    out.push({ t: samples[i].t, enters: now, side: inside.x > 0 ? 'right' : 'left' });
  }
  return out;
}

/** Senza soggetto, orbite e avvicinamenti si misurano rispetto al punto mirato. */
const aimed = (c: CameraState): Subject => ({ pos: v(c.target), facing: 0 });

/** Spostamento di un oggetto, descritto rispetto alla camera all'inizio del tratto. */
function describeObjectSegment(s: AppState, name: string, a: ObjectKey, b: ObjectKey): string {
  if (a.easing === 'hold') return '';
  const cam = cameraAt(s, a.time);
  const fwd = v(cam.target).sub(v(cam.pos)).setY(0).normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const d = v(b.pos).sub(v(a.pos));
  const along = d.dot(fwd);
  const side = d.dot(right);
  const moves: string[] = [];
  if (Math.abs(along) > 0.2) moves.push(`${Math.abs(along).toFixed(1)} m ${along < 0 ? 'toward' : 'away from'} the camera`);
  if (Math.abs(side) > 0.2) moves.push(`${Math.abs(side).toFixed(1)} m to the ${side > 0 ? 'right' : 'left'} of the frame`);
  if (Math.abs(d.y) > 0.2) moves.push(`${Math.abs(d.y).toFixed(1)} m ${d.y > 0 ? 'up' : 'down'}`);
  // yaw crescente = l'oggetto si gira verso la sua sinistra
  const turn = b.rot[1] - a.rot[1];
  const turning = Math.abs(turn) > 10 ? `${Math.round(Math.abs(turn))} degrees to its ${turn > 0 ? 'left' : 'right'}` : '';
  let text = '';
  if (moves.length) text = `${name} moves ${moves.join(' and ')}${turning ? `, turning ${turning}` : ''}`;
  else if (turning) text = `${name} turns ${turning}`;
  return text && `${text} ${EASING_TEXT[a.easing]}`.trim();
}

/** Punto agganciato: "the subject's head", "the red cube", ... */
function lockedAim(s: AppState, target: SceneObject, w: Wording) {
  const name = objectName(s, target, w);
  if (!isMannequin(target)) return name;
  const k = s.lock.offset[1] / objectHeight(target);
  const part = k > 0.82 ? 'head' : k > 0.62 ? 'chest' : 'waist';
  // "the subject" diventa "the subject's"; un segnaposto come <Subject 1> diventa "<Subject 1>'s"
  return `${name}'s ${part}`;
}

/** Inquadratura iniziale, tratti, inquadratura finale e stile del movimento. */
function movementLines(s: AppState, wording: Wording): string[] {
  const aspect = s.aspect === '16:9' ? 16 / 9 : 9 / 16;
  const subject = subjectObject(s);
  // senza soggetto le frasi sulla camera parlano del centro della scena
  const w: Wording = subject ? wording : { ...wording, subject: 'the center of the scene' };
  // camere come appaiono davvero, con l'eventuale aggancio al soggetto
  const keys = s.keyframes.map(k => ({ ...k, camera: cameraAt(s, k.time) }));
  const first = keys[0]?.camera ?? cameraAt(s, 0);
  const target = s.lock.enabled ? lockTarget(s) : null;
  const targetMoving = target !== null && !target.hidden && objectMoves(target);
  const lines: string[] = [];
  const lens = (c: CameraState) => `${angleDesc(c)}, ${Math.round(c.focal)}mm lens`;
  const dutch = (c: CameraState) => (Math.abs(c.roll) > 3 ? `, ${Math.round(Math.abs(c.roll))}-degree dutch angle` : '');
  /** "medium shot of the subject, profile view from ..., " oppure niente se il soggetto è fuori campo */
  const framing = (c: CameraState, t: number, named: boolean) => {
    const info = subjectInfo(s, t);
    const crop = subject && info ? frameCrop(subject, c, t, aspect) : null;
    if (!crop || !info) return '';
    return `${crop.size}${named ? ` of ${w.subject}` : ''}${crop.cut ? ` ${crop.cut}` : ''}, ${sideDesc(c, info, w)}, ${crop.facing}, `;
  };
  const notInFrame = (t: number) => subject && !subject.hidden && !inFrame(s, subject, t, aspect);

  // inquadratura di partenza: se il soggetto non c'è ancora la camera inquadra la scena
  const opening = framing(first, 0, true);
  const waiting = notInFrame(0) ? `; ${w.subject} is not in frame yet` : '';
  lines.push(`Opening frame: ${opening || (subject && !subject.hidden ? 'static view of the scene, ' : '')}${lens(first)}${dutch(first)}${waiting}.`);

  // il resto in ordine di tempo: a parità di tempo prima la camera, poi entrate/uscite, poi gli oggetti
  const events: { t: number; order: number; text: string }[] = [];
  const minGap = w.compact ? 0.3 : 0.05;
  if (keys.length < 2) {
    lines.push(targetMoving ? 'The camera body stays in place.' : 'Static locked-off camera, no movement.');
  } else {
    if (keys[0].time > minGap) events.push({ t: 0, order: 0, text: `From 0.0s to ${keys[0].time.toFixed(1)}s the camera holds still.` });
    keys.slice(0, -1).forEach((k, i) => {
      const next = keys[i + 1];
      const sA = subjectInfo(s, k.time) ?? aimed(k.camera);
      const sB = subjectInfo(s, next.time) ?? aimed(k.camera);
      events.push({ t: k.time, order: 0, text: `From ${k.time.toFixed(1)}s to ${next.time.toFixed(1)}s ${describeSegment(k, next, sA, sB, w)}.` });
    });
    const last = keys[keys.length - 1];
    // nella versione compatta una pausa finale brevissima non merita una riga
    if (last.time < s.duration - minGap) events.push({ t: last.time, order: 0, text: `From ${last.time.toFixed(1)}s to the end the camera holds still.` });
  }
  // prima il soggetto, poi gli altri oggetti animati
  const moving = s.objects.filter(o => !o.hidden && objectMoves(o)).sort((a, b) => Number(b.id === s.subjectId) - Number(a.id === s.subjectId));
  moving.forEach((o, rank) => {
    const k = o.keys!;
    const name = objectName(s, o, w);
    for (let i = 0; i < k.length - 1; i++) {
      const text = describeObjectSegment(s, name, k[i], k[i + 1]);
      if (text) events.push({ t: k[i].time, order: 2 + rank, text: `From ${k[i].time.toFixed(1)}s to ${k[i + 1].time.toFixed(1)}s ${text}.` });
    }
  });
  // entrate e uscite dall'inquadratura del soggetto e degli oggetti che si muovono (o se la camera si muove)
  const watched = subject && !subject.hidden && !moving.includes(subject) ? [subject, ...moving] : moving;
  if (keys.length >= 2 || moving.length) {
    for (const o of watched) {
      const name = objectName(s, o, w);
      for (const c of frameChanges(s, o, aspect)) {
        const text = c.enters ? `${name} enters the frame from the ${c.side}` : `${name} leaves the frame on the ${c.side}`;
        events.push({ t: c.t, order: 1, text: `At ${c.t.toFixed(1)}s ${text}.` });
      }
    }
  }
  events.sort((a, b) => a.t - b.t || a.order - b.order);
  lines.push(...events.map(e => e.text));

  if (targetMoving) {
    lines.push(`Throughout the shot the camera stays aimed at ${lockedAim(s, target, w)}, following its movement.`);
  }
  if (keys.length >= 2 || moving.length) {
    const end = keys.length >= 2 ? keys[keys.length - 1] : { time: s.duration, camera: first };
    const t = Math.max(end.time, ...moving.map(o => o.keys![o.keys!.length - 1].time));
    const out = notInFrame(t) ? `; ${w.subject} is out of frame` : '';
    if (keys.length >= 2 || out) lines.push(`Final frame: ${framing(end.camera, t, false)}${lens(end.camera)}${dutch(end.camera)}${out}.`);
  }
  const h = s.handheld;
  if (h.enabled && h.intensity > 0) {
    const amount = h.intensity < 0.3 ? 'subtle' : h.intensity < 0.65 ? 'noticeable' : 'strong';
    const pace = h.frequency < 0.7 ? 'slow, floating' : h.frequency > 1.6 ? 'quick, nervous' : 'natural';
    lines.push(`Handheld camera feel with ${amount}, ${pace} operator shake on top of the movement; cinematic.`);
  } else {
    lines.push('Smooth, stable, cinematic camera motion.');
  }
  return lines;
}

// oggetti di scena visibili (forme semplici o scena importata), esclusi i manichini
const hasScene = (s: AppState) => s.objects.some(o => o.kind !== 'manichino' && !o.hidden);

/** Versione originale, da usare direttamente nel modello video. */
export function generatePrompt(s: AppState): string {
  const lines: string[] = [`Follow exactly the camera movement of the reference video; ${guideText(s)}.`];
  if (hasScene(s)) lines.push(SCENE_LINE);
  lines.push(`${s.aspect === '16:9' ? 'Horizontal 16:9' : 'Vertical 9:16'} framing, ${s.duration} seconds.`);
  lines.push(...movementLines(s, ORIGINAL));
  return lines.join('\n');
}

/**
 * Versione per Ref2VA: i pezzi per subject_definitions, retention_analysis e detailed_description,
 * con i segnaposto del prompt strutturato.
 */
export function generateRef2vaPrompt(s: AppState, tokens = DEFAULT_TOKENS): string {
  const video = tokens.video.trim() || DEFAULT_TOKENS.video;
  const w: Wording = { subject: tokens.subject.trim() || DEFAULT_TOKENS.subject, compact: true };
  const shot = [`Use only the camera movement from ${video}; ${guideText(s)}.`];
  if (hasScene(s)) shot.push(SCENE_LINE);
  shot.push(...movementLines(s, w));
  return [
    'subject_definitions:',
    `${video} is the declared motion guide, used as the camera-movement guide (${s.duration}s).`,
    '',
    'retention_analysis:',
    `${video} (camera-movement guide): fully_preserved - only the declared guide role and mapped motion; no appearance, background or audio transfer.`,
    '',
    'detailed_description:',
    ...shot,
  ].join('\n');
}


// ---------------------------------------------------------------------------
// Versione per il Compiler MiniMax
// ---------------------------------------------------------------------------

const CAP = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const fmt = (t: number) => t.toFixed(1);

/** Angolo della camera come aggettivo: "eye-level", "high-angle", ... */
function angleAdj(c: CameraState) {
  return {
    'eye level': 'eye-level',
    'high angle looking down': 'high-angle',
    'low angle looking up': 'low-angle',
    'top-down overhead angle': 'top-down overhead',
  }[angleDesc(c)] ?? 'eye-level';
}

const GUIDE_SHAPE = { manichino: 'mannequin', cilindro: 'cylinder', blocco: 'block', nessuno: '' } as const;

/** Spostamento di una figura senza metri: direzioni come si vedono nel video guida. */
function describeFigureSegment(s: AppState, a: ObjectKey, b: ObjectKey, first: boolean): string {
  if (a.easing === 'hold') return '';
  const cam = cameraAt(s, a.time);
  const fwd = v(cam.target).sub(v(cam.pos)).setY(0).normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const d = v(b.pos).sub(v(a.pos));
  const along = d.dot(fwd);
  const side = d.dot(right);
  const path: string[] = [];
  if (Math.abs(along) > 0.2) path.push(along < 0 ? 'approaching the camera' : 'moving away from the camera');
  if (Math.abs(side) > 0.2) path.push(`crossing the scene from ${side > 0 ? 'left toward right' : 'right toward left'}`);
  if (Math.abs(d.y) > 0.2) path.push(d.y > 0 ? 'rising' : 'descending');
  const turn = b.rot[1] - a.rot[1];
  const turning = Math.abs(turn) > 10 ? `gradually turns approximately ${Math.round(Math.abs(turn))} degrees to its own ${turn > 0 ? 'left' : 'right'}` : '';
  const ease = a.easing === 'linear' ? '' : `, ${EASING_TEXT[a.easing]}`;
  // se la camera si muove per buona parte del tratto, direzione nella scena e spostamento sullo
  // schermo possono non coincidere: niente "da destra a sinistra", si rimanda al video guida
  if (path.length && cameraMovingShare(s, a.time, b.time) > 0.5) {
    // avvicinarsi o allontanarsi resta vero anche con la camera in movimento; il lato no
    const depth = Math.abs(along) > 0.5 ? `, ${path[0]}` : '';
    return `${first ? 'follows' : 'continues along'} the reference trajectory${depth}${turning ? `${depth ? ',' : ''} and ${turning}` : ''}${ease}. `
      + 'Preserve its changing screen position and distance from the camera as shown in the reference';
  }
  if (path.length) {
    const route = `${first ? 'follows' : 'continues along'} the reference trajectory, ${path.length > 1 ? `${path[0]} while ${path.slice(1).join(' and ')}` : path[0]}`;
    return `${route}${turning ? `, and ${turning}` : ''}${ease}`;
  }
  return turning ? `${turning}${ease}` : '';
}

/** Quota del tratto [t0, t1] in cui la camera è in movimento (0..1). */
function cameraMovingShare(s: AppState, t0: number, t1: number) {
  const k = s.keyframes;
  let moving = 0;
  for (let i = 0; i < k.length - 1; i++) {
    if (k[i].easing === 'hold') continue;
    moving += Math.max(0, Math.min(t1, k[i + 1].time) - Math.max(t0, k[i].time));
  }
  return t1 > t0 ? moving / (t1 - t0) : 0;
}

/**
 * Corpo narrativo per il campo "Prompt guida" del Compiler MiniMax: niente intestazioni di sezione,
 * niente <Subject n> / <Video n> (li assegna il Compiler), il manichino nominato per colore così si
 * può associare al personaggio del cut.
 */
export function generateCompilerPrompt(s: AppState): string {
  const aspect = s.aspect === '16:9' ? 16 / 9 : 9 / 16;
  const shape = GUIDE_SHAPE[s.style.subject];
  // soggetti da associare nel Compiler: i manichini (se si vedono nel video) e gli oggetti segnati come soggetto
  const figures = s.objects.filter(o => !o.hidden && (isMannequin(o) ? !!shape : !!o.mapped));
  const many = figures.length > 1;
  const allMann = figures.every(isMannequin);
  /** personaggio (manichino) o soggetto (auto, animale, oggetto...) */
  const noun = (o: SceneObject) => (isMannequin(o) ? 'character' : 'subject');
  const group = allMann ? 'characters' : 'subjects';
  const guideName = (o: SceneObject) => isMannequin(o) ? `the ${COLOR_EN[o.color ?? 'grigio']} ${shape}`
    : o.kind === 'importato' ? `the ${o.name}` : `the ${COLOR_EN[o.color ?? 'grigio']} ${GUIDE_KIND[o.kind as keyof typeof GUIDE_KIND]}`;
  const charName = (o: SceneObject) => (many ? `the ${noun(o)} mapped to ${guideName(o)}` : `the mapped ${noun(o)}`);
  // dopo la prima menzione basta "the character" se il manichino è l'unico personaggio
  const onlyChar = figures.filter(isMannequin).length === 1;
  const short = (o: SceneObject) => (many && !(isMannequin(o) && onlyChar) ? `the ${noun(o)} of ${guideName(o)}` : `the ${noun(o)}`);
  const figureMoves = figures.filter(objectMoves);
  const keys = s.keyframes.map(k => ({ ...k, camera: cameraAt(s, k.time) }));
  const camMoves = keys.length >= 2 && keys.slice(0, -1).some(k => k.easing !== 'hold');
  const first = keys[0]?.camera ?? cameraAt(s, 0);
  const lines: string[] = [];
  const mapped = many ? `mapped ${group}` : figures.length ? `mapped ${noun(figures[0])}` : '';

  // ruolo della guida
  if (figureMoves.length) {
    lines.push(`Use the reference video as a combined guide for camera movement and the movement of the ${mapped}. Follow its timing, trajectory, changes of orientation and evolving framing.`);
  } else if (figures.length) {
    // nel Compiler non esiste un ruolo "camera + posizione": anche una figura ferma va associata
    lines.push(`Use the reference video as a combined guide for camera movement and the ${mapped}. Follow its timing and evolving framing, and the ${many ? `${group}’ positions` : `${noun(figures[0])}’s position`} and orientation.`);
  } else {
    lines.push('Use the reference video as a guide for camera movement only. Follow its timing, trajectory and evolving framing.');
  }

  // associazione figura → soggetto, e cosa non va riprodotto
  // (testo corto: il campo guida del Compiler accetta al massimo COMPILER_LIMIT caratteri)
  const blocks = s.objects.some(o => !o.hidden && !isMannequin(o) && !o.mapped);
  if (figures.length) {
    const what = figureMoves.length ? 'movement, position and orientation' : 'position and orientation';
    const look = allMann ? 'identity, appearance, clothing' : 'identity, appearance';
    // "The red mannequin and white box": l'articolo solo sul primo
    const names = listOf(figures.map((o, i) => (i ? guideName(o).replace(/^the /, '') : guideName(o))), 'and');
    lines.push(many
      ? `${CAP(names)} represent their assigned ${group}' ${what}. Their ${look} and environment come from separate references.`
      : `${CAP(names)} represents its assigned ${noun(figures[0])}'s ${what}. Its ${look} and environment come from separate references.`);
    // la forma senza colore: "mannequin", "box", oppure il nome dell'oggetto importato
    const shapes = [...new Set(figures.map(o => (o.kind === 'importato' ? o.name : guideName(o).split(' ').slice(2).join(' '))))];
    lines.push(`Render the assigned ${many ? group : noun(figures[0])}, not the ${listOf(shapes, 'or')} ${shapes.length > 1 || many ? 'shapes' : 'shape'}.`);
  }
  const grid = s.style.subject === 'nessuno' ? 'the floor grid and reference columns' : 'the floor grid';
  lines.push(`Exclude ${grid}${blocks ? ' and the simple 3D blocks' : ''} and do not transfer the reference video's audio.${blocks && !figures.length ? ' The target environment comes from separate references.' : ''}`);
  lines.push(`${/^(8|11|18)(\D|$)/.test(String(s.duration)) ? 'An' : 'A'} ${s.duration}-second continuous shot in ${s.aspect === '16:9' ? 'horizontal 16:9' : 'vertical 9:16'} framing, with no cuts.`);

  // come appare un soggetto nell'inquadratura: misura del corpo per i manichini, posizione per gli altri
  const lens = (c: CameraState) => `${Math.round(c.focal)}mm lens`;
  const sideOf = (o: SceneObject, c: CameraState, t: number) => {
    const p = objectAt(o, t);
    return sideDesc(c, { pos: v(p.pos).setY(p.pos[1] + objectHeight(o)), facing: p.rot[1] }, { subject: '@', compact: true }).replace("@'s", 'its');
  };
  const looks = (o: SceneObject, c: CameraState, t: number, named: string): string | null => {
    if (isMannequin(o)) {
      const crop = frameCrop(o, c, t, aspect);
      return crop && `${crop.size}${named ? ` of ${named}` : ''}, ${sideOf(o, c, t)}, ${crop.facing}${crop.cut ? `, ${crop.cut}` : ''}`;
    }
    if (!framePosition(s, o, t, aspect)) return null;
    const box = boxInFrame(o, c, t, aspect);
    const where = box.x < -0.33 ? 'on the left' : box.x > 0.33 ? 'on the right' : 'in the center';
    // rispetto al primo personaggio in campo
    const m = figures.find(f => isMannequin(f) && f !== o);
    const mx = m ? framePosition(s, m, t, aspect)?.x : undefined;
    const rel = mx === undefined ? '' : `, to the ${box.x < mx ? 'left' : 'right'} of ${short(m!)}`;
    return `${named || short(o)} ${box.whole ? 'fully visible' : 'partly visible'} ${where}${rel}`;
  };

  // inquadratura di partenza
  const startStill = !camMoves || keys[0].time > 0.05 || keys[0].easing === 'hold';
  const view = `${startStill ? 'a static' : 'an'} ${angleAdj(first)}${dutchText(first)} view with a ${lens(first)}`;
  const who = figures.map(o => looks(o, first, 0, charName(o))).filter((x): x is string => !!x);
  let open = `Opening: ${view}${who.length ? `: ${who.join('; ')}` : ''}.`;
  const outside = figures.filter(o => !looks(o, first, 0, ''));
  if (outside.length) open += ` ${CAP(listOf(outside.map(charName), 'and'))} ${outside.length > 1 ? 'are' : 'is'} initially outside the frame.`;
  lines.push(open);

  // eventi in ordine di tempo
  const events: { t: number; order: number; text: string }[] = [];
  const lastKey = (o: SceneObject) => o.keys![o.keys!.length - 1].time;
  const figureBusy = (t0: number, t1: number) => figureMoves.some(o => o.keys!.some((k, i) => i < o.keys!.length - 1 && k.easing !== 'hold' && k.time < t1 - 1e-3 && o.keys![i + 1].time > t0 + 1e-3));
  const camEnd = camMoves ? keys[keys.length - 1].time : 0;
  const figEnd = Math.max(0, ...figureMoves.map(lastKey));
  const movingWord = many ? `moving ${group}` : figures.length ? `moving ${noun(figures[0])}` : '';
  if (!camMoves) {
    if (!s.lock.enabled || !figureMoves.length) events.push({ t: 0, order: 0, text: 'The camera remains stationary for the whole shot.' });
  } else {
    if (keys[0].time > 0.05) events.push({ t: 0, order: 0, text: `From 0.0s to ${fmt(keys[0].time)}s, the camera remains stationary.` });
    keys.slice(0, -1).forEach((k, i) => {
      const next = keys[i + 1];
      if (k.easing === 'hold') {
        events.push({ t: k.time, order: 0, text: `From ${fmt(k.time)}s to ${fmt(next.time)}s, the camera remains stationary.` });
        return;
      }
      const subj = subjectObject(s);
      const sA = subjectInfo(s, k.time) ?? aimed(k.camera);
      const sB = subjectInfo(s, next.time) ?? aimed(k.camera);
      const w: Wording = { subject: subj && figures.includes(subj) ? short(subj) : subj ? objectName(s, subj, ORIGINAL) : 'the center of the scene', compact: true };
      const keep = figureBusy(k.time, next.time) ? ` Preserve the changing relationship between the camera and the ${movingWord} shown in the reference.` : '';
      events.push({ t: k.time, order: 0, text: `From ${fmt(k.time)}s to ${fmt(next.time)}s, ${describeSegment(k, next, sA, sB, w)}.${keep}` });
    });
  }
  const end = s.duration - 0.05;
  // i soggetti che si fermano insieme alla camera si dicono nella stessa frase
  const withCam = camMoves && camEnd < end ? figureMoves.filter(o => Math.abs(lastKey(o) - camEnd) < 0.05) : [];
  figureMoves.forEach((o, rank) => {
    const k = o.keys!;
    let firstMove = true;
    for (let i = 0; i < k.length - 1; i++) {
      const text = describeFigureSegment(s, k[i], k[i + 1], firstMove);
      if (!text) continue;
      events.push({ t: k[i].time, order: 2 + rank, text: `From ${fmt(k[i].time)}s to ${fmt(k[i + 1].time)}s, ${firstMove ? charName(o) : short(o)} ${text}.` });
      firstMove = false;
    }
    // si ferma prima della fine (se non si ferma insieme alla camera, detto sotto)
    if (!withCam.includes(o) && lastKey(o) < end) {
      // fermo nella scena, non sullo schermo: se la camera si muove ancora va detto
      const t0 = lastKey(o);
      const camGoing = camMoves && t0 < camEnd - 0.05 ? ` while the camera continues moving until ${fmt(camEnd)}s` : '';
      events.push({ t: t0, order: 2 + rank, text: `From ${fmt(t0)}s onward, ${charName(o)} remains stationary in the scene${camGoing}.` });
    }
  });
  // altre forme che si muovono ma non rappresentano un soggetto
  s.objects.filter(o => !o.hidden && objectMoves(o) && !figures.includes(o)).forEach((o, rank) => {
    const k = o.keys!;
    const name = objectName(s, o, ORIGINAL);
    for (let i = 0; i < k.length - 1; i++) {
      const text = describeObjectSegment(s, name, k[i], k[i + 1]);
      if (text) events.push({ t: k[i].time, order: 10 + rank, text: `From ${fmt(k[i].time)}s to ${fmt(k[i + 1].time)}s, ${text}.` });
    }
  });
  // entrate e uscite dall'inquadratura
  if (camMoves || figureMoves.length) {
    for (const o of figures) {
      for (const c of frameChanges(s, o, aspect)) {
        const text = c.enters ? `${short(o)} begins entering the frame from the ${c.side}` : `${short(o)} leaves the frame on the ${c.side}`;
        events.push({ t: c.t, order: 1, text: `At approximately ${fmt(c.t)}s, ${text}.` });
      }
    }
  }
  // pausa finale della camera, insieme ai soggetti se si fermano nello stesso momento
  if (withCam.length) {
    const all = withCam.length === figureMoves.length && figureMoves.length === figures.length;
    const who = all ? (many ? `the ${group}` : `the ${noun(figures[0])}`) : listOf(withCam.map(short), 'and');
    events.push({ t: camEnd, order: 0, text: `From ${fmt(camEnd)}s to ${fmt(s.duration)}s, ${all && !many ? 'both ' : ''}the camera and ${who} remain stationary.` });
  } else if (camMoves && camEnd < end) {
    events.push({ t: camEnd, order: 0, text: `From ${fmt(camEnd)}s to ${fmt(s.duration)}s, the camera remains stationary.` });
  }
  events.sort((a, b) => a.t - b.t || a.order - b.order);
  lines.push(...events.map(e => e.text));

  const target = s.lock.enabled ? lockTarget(s) : null;
  if (target && !target.hidden && objectMoves(target)) {
    const aim = figures.includes(target) ? short(target) : objectName(s, target, ORIGINAL);
    lines.push(`Throughout the shot, the camera stays aimed at ${aim}, following its movement.`);
  }

  // inquadratura finale
  if (camMoves || figureMoves.length) {
    const tEnd = Math.max(camEnd, figEnd);
    const last = cameraAt(s, tEnd);
    // personaggi nella frase dell'inquadratura; gli altri soggetti in una frase propria ciascuno
    const parts = figures.filter(isMannequin).map(o => looks(o, last, tEnd, many ? short(o) : '') ?? `${short(o)} out of frame`);
    lines.push(`Final composition: ${angleAdj(last)}${dutchText(last)}, ${lens(last)}${parts.length ? `; ${parts.join('; ')}` : ''}, matching the reference.`);
    for (const o of figures.filter(f => !isMannequin(f))) {
      const seen = looks(o, last, tEnd, charName(o));
      const was = framePosition(s, o, Math.max(0, tEnd - 0.5), aspect) !== null;
      lines.push(seen
        ? `${CAP(seen.replace(/ (fully|partly) visible/, was ? ' remains $1 visible' : ' is $1 visible'))}, matching the reference.`
        : `${CAP(charName(o))} is out of frame at the end.`);
    }
  }

  // stile
  const h = s.handheld;
  if (h.enabled && h.intensity > 0) {
    const amount = h.intensity < 0.3 ? 'subtle' : h.intensity < 0.65 ? 'noticeable' : 'strong';
    const pace = h.frequency < 0.7 ? 'slow, floating' : h.frequency > 1.6 ? 'quick, nervous' : 'natural';
    lines.push(`Handheld camera feel with ${amount}, ${pace} operator shake on top of the movement.`);
  } else {
    lines.push('Maintain smooth, stable camera movement.');
  }
  // facoltativa (con forme miste basta "Render the assigned…"): si toglie se il testo è troppo lungo
  if (figureMoves.length && allMann && shape === 'mannequin') {
    const paths = figureMoves.length > 1 ? 'characters’ paths' : 'character’s path';
    const extra = `Transfer the ${paths} and orientation without reproducing the ${shape}${many ? 's’' : '’s'} rigid mechanical appearance.`;
    if (lines.join('\n').length + extra.length + 1 <= COMPILER_LIMIT) lines.push(extra);
  }
  return lines.join('\n');
}

/** Limite di caratteri del campo "Prompt guida" del Compiler MiniMax. */
export const COMPILER_LIMIT = 2500;

/** "a, b and c" */
function listOf(items: string[], last: 'and' | 'or') {
  return items.length > 1 ? `${items.slice(0, -1).join(', ')} ${last} ${items[items.length - 1]}` : items[0] ?? '';
}

/** Nomi delle forme semplici quando rappresentano un soggetto: un cubo allungato è una scatola. */
const GUIDE_KIND: Record<Exclude<ObjectKind, 'importato' | 'manichino'>, string> = {
  cubo: 'box', sfera: 'sphere', cilindro: 'cylinder', pannello: 'panel',
};

/**
 * Ingombro dell'oggetto nell'inquadratura: se è tutto dentro (gli 8 spigoli) e il centro orizzontale
 * della parte visibile (-1 sinistra .. 1 destra).
 */
function boxInFrame(o: SceneObject, c: CameraState, t: number, aspect: number) {
  applyToCamera(probeCam, c, aspect);
  probeCam.updateMatrixWorld();
  const p = objectAt(o, t);
  const box = new THREE.Box3(new THREE.Vector3(-0.5, -0.5, -0.5), new THREE.Vector3(0.5, 0.5, 0.5));
  const m = new THREE.Matrix4().compose(v(p.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(p.rot[0] / RAD, p.rot[1] / RAD, p.rot[2] / RAD)), v(p.scale));
  box.applyMatrix4(m);
  let whole = true;
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const q = new THREE.Vector3(x, y, z).project(probeCam);
    if (q.z >= 1 || Math.abs(q.x) > 1 || Math.abs(q.y) > 1) whole = false;
    if (q.z >= 1) continue;
    lo = Math.min(lo, q.x);
    hi = Math.max(hi, q.x);
  }
  lo = Math.max(-1, lo);
  hi = Math.min(1, hi);
  return { whole, x: lo <= hi ? (lo + hi) / 2 : 0 };
}

function dutchText(c: CameraState) {
  return Math.abs(c.roll) > 3 ? `, ${Math.round(Math.abs(c.roll))}-degree dutch angle` : '';
}
