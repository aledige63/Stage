import * as THREE from 'three';
import { FILM_GAUGE } from '../engine/cameraOps';
import { MANNEQUIN_ID, type AppState, type CameraState, type Easing, type Keyframe } from '../store';

// Descrive in inglese il movimento della timeline, tratto per tratto, per accompagnare
// il video guida in MiniMax H3.

const RAD = 180 / Math.PI;
const v = (a: [number, number, number]) => new THREE.Vector3(...a);

interface Subject {
  pos: THREE.Vector3;
  /** gradi: direzione in cui guarda il manichino */
  facing: number;
}

function vHalfTan(c: CameraState, aspect: number) {
  return FILM_GAUGE / Math.max(aspect, 1) / 2 / c.focal;
}

function shotSize(c: CameraState, aspect: number) {
  // altezza visibile all'altezza del soggetto
  const visible = 2 * v(c.pos).distanceTo(v(c.target)) * vHalfTan(c, aspect);
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

function sideDesc(c: CameraState, s: Subject) {
  let a = azimuth(c, s) % 360;
  if (a > 180) a -= 360;
  if (a < -180) a += 360;
  const abs = Math.abs(a);
  if (abs < 20) return 'from the front';
  if (abs > 160) return 'from behind';
  const side = a > 0 ? "subject's left" : "subject's right";
  return abs < 65 ? `three-quarter view from the ${side}` : `profile view from the ${side}`;
}

const wrap = (a: number) => ((a + 540) % 360) - 180;

const EASING_TEXT: Record<Easing, string> = {
  linear: 'at constant speed',
  in: 'starting slowly and accelerating',
  out: 'decelerating to a soft stop',
  inout: 'with a smooth ease-in and ease-out',
  hold: '',
};

function describeSegment(a: Keyframe, b: Keyframe, s: Subject): string {
  const A = a.camera;
  const B = b.camera;
  if (a.easing === 'hold') return 'the camera holds perfectly still';

  const parts: string[] = [];
  const PA = v(A.pos);
  const PB = v(B.pos);
  const moved = PA.distanceTo(PB);

  // orbita attorno al soggetto
  const dAz = wrap(azimuth(B, s) - azimuth(A, s));
  if (Math.abs(dAz) > 15 && moved > 0.3) {
    // azimut crescente = la camera va verso la sua destra
    parts.push(`orbits ${Math.round(Math.abs(dAz))} degrees around the subject, moving to the ${dAz > 0 ? 'right' : 'left'}`);
  }

  // avvicinamento / allontanamento
  const flat = (p: THREE.Vector3) => Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
  const ratio = flat(PB) / Math.max(0.01, flat(PA));
  if (ratio < 0.8) parts.push('dollies in toward the subject (physical push-in)');
  else if (ratio > 1.25) parts.push('dollies back away from the subject (pull-out)');

  // movimento verticale
  const dy = PB.y - PA.y;
  const dTargetY = B.target[1] - A.target[1];
  if (Math.abs(dy) > 0.4) {
    const pedestal = Math.abs(dy - dTargetY) < 0.25;
    const verb = dy > 0 ? 'rises' : 'lowers';
    parts.push(pedestal
      ? `${verb} vertically on a pedestal from ${PA.y.toFixed(1)} m to ${PB.y.toFixed(1)} m keeping the same tilt`
      : `${verb} on a crane from ${PA.y.toFixed(1)} m to ${PB.y.toFixed(1)} m while staying aimed at the subject`);
  }

  // carrello laterale (camera e target si spostano insieme)
  if (Math.abs(dAz) <= 15 || moved <= 0.3) {
    const fwd = v(A.target).sub(PA).setY(0).normalize();
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const lateral = PB.clone().sub(PA).dot(right);
    if (Math.abs(lateral) > 0.5) parts.push(`trucks ${lateral > 0 ? 'right' : 'left'} by about ${Math.abs(lateral).toFixed(1)} m`);
  }

  // pan / tilt con camera quasi ferma
  if (moved < 0.3) {
    const dA = v(A.target).sub(PA).normalize();
    const dB = v(B.target).sub(PB).normalize();
    const yaw = wrap((Math.atan2(dB.x, dB.z) - Math.atan2(dA.x, dA.z)) * RAD);
    const pitch = (Math.asin(dB.y) - Math.asin(dA.y)) * RAD;
    if (Math.abs(yaw) > 8) parts.push(`pans ${yaw > 0 ? 'left' : 'right'} ${Math.round(Math.abs(yaw))} degrees`);
    if (Math.abs(pitch) > 6) parts.push(`tilts ${pitch > 0 ? 'up' : 'down'} ${Math.round(Math.abs(pitch))} degrees`);
  }

  // zoom ottico
  const zoom = B.focal / A.focal;
  if (zoom > 1.12) parts.push(`zooms in optically from ${Math.round(A.focal)}mm to ${Math.round(B.focal)}mm`);
  else if (zoom < 0.89) parts.push(`zooms out optically from ${Math.round(A.focal)}mm to ${Math.round(B.focal)}mm`);

  // roll
  const dRoll = B.roll - A.roll;
  if (Math.abs(dRoll) > 5) {
    parts.push(Math.abs(B.roll) < 2 ? 'rolls back to a level horizon' : `rolls to a ${Math.round(Math.abs(B.roll))}-degree dutch angle`);
  }

  if (!parts.length) return 'the camera stays almost static';
  const zoomOnly = parts.length === 1 && parts[0].startsWith('zooms');
  const joined = parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1] : parts[0];
  const text = 'the camera ' + joined + ' ' + EASING_TEXT[a.easing];
  return zoomOnly ? text + ' (the camera body does not move)' : text;
}

export function generatePrompt(s: AppState): string {
  const aspect = s.aspect === '16:9' ? 16 / 9 : 9 / 16;
  const m = s.objects.find(o => o.id === MANNEQUIN_ID)!;
  const subject: Subject = { pos: new THREE.Vector3(m.pos[0], m.pos[1] + 1, m.pos[2]), facing: m.rot[1] };
  const keys = s.keyframes;
  const first = keys[0]?.camera ?? s.camera;

  const lines: string[] = [];
  lines.push('Follow exactly the camera movement of the reference video; the gray mannequin and the grid are only a motion guide and must not appear.');
  lines.push(`${s.aspect === '16:9' ? 'Horizontal 16:9' : 'Vertical 9:16'} framing, ${s.duration} seconds.`);
  lines.push(`Opening frame: ${shotSize(first, aspect)} of the subject, ${sideDesc(first, subject)}, ${angleDesc(first)}, ${Math.round(first.focal)}mm lens${Math.abs(first.roll) > 3 ? `, ${Math.round(Math.abs(first.roll))}-degree dutch angle` : ''}.`);

  if (keys.length < 2) {
    lines.push('Static locked-off camera, no movement.');
  } else {
    const segs = keys.slice(0, -1).map((k, i) => {
      const next = keys[i + 1];
      return `From ${k.time.toFixed(1)}s to ${next.time.toFixed(1)}s ${describeSegment(k, next, subject)}.`;
    });
    lines.push(...segs);
    const last = keys[keys.length - 1];
    if (last.time < s.duration - 0.05) lines.push(`From ${last.time.toFixed(1)}s to the end the camera holds still.`);
    lines.push(`Final frame: ${shotSize(last.camera, aspect)}, ${sideDesc(last.camera, subject)}, ${angleDesc(last.camera)}, ${Math.round(last.camera.focal)}mm lens.`);
  }
  const h = s.handheld;
  if (h.enabled && h.intensity > 0) {
    const amount = h.intensity < 0.3 ? 'subtle' : h.intensity < 0.65 ? 'noticeable' : 'strong';
    const pace = h.frequency < 0.7 ? 'slow, floating' : h.frequency > 1.6 ? 'quick, nervous' : 'natural';
    lines.push(`Handheld camera feel with ${amount}, ${pace} operator shake on top of the movement; cinematic.`);
  } else {
    lines.push('Smooth, stable, cinematic camera motion.');
  }
  return lines.join('\n');
}
