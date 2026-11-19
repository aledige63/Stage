import * as THREE from 'three';
import { FILM_GAUGE } from '../engine/cameraOps';
import { panDelta } from '../engine/interpolation';
import { MANNEQUIN_ID, subjectScale, type AppState, type CameraState, type Easing, type Keyframe } from '../store';

// Descrive in inglese il movimento della timeline, tratto per tratto, per accompagnare
// il video guida in MiniMax H3. Due versioni: quella originale, da usare così com'è, e quella
// per Ref2VA, a pezzi già pronti per le sezioni del prompt strutturato (la incolla l'LLM locale).

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

function vHalfTan(c: CameraState, aspect: number) {
  return FILM_GAUGE / Math.max(aspect, 1) / 2 / c.focal;
}

function shotSize(c: CameraState, aspect: number, scale: number) {
  // altezza visibile all'altezza del soggetto, riportata a un soggetto di 1,8 m
  const visible = (2 * v(c.pos).distanceTo(v(c.target)) * vHalfTan(c, aspect)) / scale;
  if (visible > 3.2) return 'wide shot';
  if (visible > 1.9) return 'full shot';
  if (visible > 1.1) return 'medium shot';
  if (visible > 0.6) return 'medium close-up';
  return 'close-up';
}

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

function describeSegment(a: Keyframe, b: Keyframe, s: Subject, w: Wording): string {
  const A = a.camera;
  const B = b.camera;
  if (a.easing === 'hold') return 'the camera holds perfectly still';

  const parts: string[] = [];
  const PA = v(A.pos);
  const PB = v(B.pos);
  const moved = PA.distanceTo(PB);

  // orbita attorno al soggetto
  const dAz = wrap(azimuth(B, s) - azimuth(A, s));
  if (Math.abs(dAz) > 15 && moved > 0.3 && a.path !== 'pan') {
    // azimut crescente = la camera va verso la sua destra
    parts.push(`orbits ${Math.round(Math.abs(dAz))} degrees around ${w.subject}, moving to the ${dAz > 0 ? 'right' : 'left'}`);
  }

  // avvicinamento / allontanamento
  const flat = (p: THREE.Vector3) => Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
  const ratio = flat(PB) / Math.max(0.01, flat(PA));
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

function guideText(s: AppState) {
  return {
    manichino: 'the gray mannequin and the floor grid are only a motion guide and must not appear',
    cilindro: "the plain gray cylinder only marks the subject's position and scale, and together with the floor grid it is only a motion guide that must not appear",
    blocco: "the plain gray block only marks the subject's position, scale and facing direction, and together with the floor grid it is only a motion guide that must not appear",
    nessuno: 'the reference video shows only a floor grid and reference columns as a spatial guide, which must not appear',
  }[s.style.subject];
}

const SCENE_LINE = 'The simple 3D blocks in the reference video only mark the layout of the environment and must not appear literally.';

/** Inquadratura iniziale, tratti, inquadratura finale e stile del movimento. */
function movementLines(s: AppState, w: Wording): string[] {
  const aspect = s.aspect === '16:9' ? 16 / 9 : 9 / 16;
  const m = s.objects.find(o => o.id === MANNEQUIN_ID)!;
  const subject: Subject = { pos: new THREE.Vector3(m.pos[0], m.pos[1] + subjectScale(s), m.pos[2]), facing: m.rot[1] };
  const keys = s.keyframes;
  const first = keys[0]?.camera ?? s.camera;
  const lines: string[] = [];

  lines.push(`Opening frame: ${shotSize(first, aspect, subjectScale(s))} of ${w.subject}, ${sideDesc(first, subject, w)}, ${angleDesc(first)}, ${Math.round(first.focal)}mm lens${Math.abs(first.roll) > 3 ? `, ${Math.round(Math.abs(first.roll))}-degree dutch angle` : ''}.`);
  if (keys.length < 2) {
    lines.push('Static locked-off camera, no movement.');
  } else {
    const segs = keys.slice(0, -1).map((k, i) => {
      const next = keys[i + 1];
      return `From ${k.time.toFixed(1)}s to ${next.time.toFixed(1)}s ${describeSegment(k, next, subject, w)}.`;
    });
    lines.push(...segs);
    const last = keys[keys.length - 1];
    // nella versione compatta una pausa finale brevissima non merita una riga
    if (last.time < s.duration - (w.compact ? 0.3 : 0.05)) lines.push(`From ${last.time.toFixed(1)}s to the end the camera holds still.`);
    lines.push(`Final frame: ${shotSize(last.camera, aspect, subjectScale(s))}, ${sideDesc(last.camera, subject, w)}, ${angleDesc(last.camera)}, ${Math.round(last.camera.focal)}mm lens.`);
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

const hasScene = (s: AppState) => s.objects.some(o => o.kind === 'importato' && !o.hidden);

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
