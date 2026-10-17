import * as THREE from 'three';
import { MANNEQUIN_ID, setState, store, type AppState, type CameraState, type Easing, type Keyframe, type PathMode, type Vec3 } from './store';
import { evaluate } from './engine/interpolation';

export const DURATION_MIN = 2;
export const DURATION_MAX = 15;
export const FPS_OPTIONS = [24, 25, 30];

const newKeyId = () => 'k-' + crypto.randomUUID().slice(0, 8);

const sortKeys = (keys: Keyframe[]) => [...keys].sort((a, b) => a.time - b.time);

export function snap(t: number, fps = store.getState().fps) {
  return Math.round(t * fps) / fps;
}

// ---------------------------------------------------------------------------
// "Sporco": la camera è stata mossa a mano e non coincide più con la timeline
// ---------------------------------------------------------------------------

let internal = false;

/** Aggiornamenti che provengono dalla timeline stessa (non rendono la camera "sporca"). */
function setFromTimeline(patch: Partial<AppState>) {
  internal = true;
  try {
    setState(patch);
  } finally {
    internal = false;
  }
}

store.subscribe((s, prev) => {
  if (!internal && s.camera !== prev.camera && s.keyframes.length > 0 && !s.dirty) {
    setState({ dirty: true });
  }
});

// ---------------------------------------------------------------------------
// Riproduzione e posizionamento
// ---------------------------------------------------------------------------

/** Sposta la testina; se ci sono keyframe la camera segue la timeline. */
export function seek(t: number, opts: { snap?: boolean } = {}) {
  const s = store.getState();
  let time = THREE.MathUtils.clamp(t, 0, s.duration);
  if (opts.snap !== false) time = snap(time, s.fps);
  if (s.keyframes.length) setFromTimeline({ time, camera: evaluate(s.keyframes, time), dirty: false });
  else setState({ time });
}

/** Avanzamento durante la riproduzione (chiamato dall'engine a ogni fotogramma). */
export function advance(dt: number) {
  const s = store.getState();
  let t = s.time + dt;
  if (t >= s.duration) {
    if (s.loop) t = t % s.duration;
    else {
      seek(s.duration, { snap: false });
      setState({ playing: false });
      return;
    }
  }
  seek(t, { snap: false });
}

export function togglePlay() {
  const s = store.getState();
  if (s.playing) {
    setState({ playing: false });
    seek(s.time);
    return;
  }
  if (s.time >= s.duration) seek(0);
  setState({ playing: true });
}

export function pause() {
  if (store.getState().playing) setState({ playing: false });
}

export function jumpKey(dir: 1 | -1) {
  const s = store.getState();
  const eps = 0.5 / s.fps;
  const times = s.keyframes.map(k => k.time);
  const t = dir > 0 ? times.find(x => x > s.time + eps) : [...times].reverse().find(x => x < s.time - eps);
  pause();
  seek(t ?? (dir > 0 ? s.duration : 0));
}

// ---------------------------------------------------------------------------
// Keyframe
// ---------------------------------------------------------------------------

/** Salva la camera attuale come keyframe nel punto corrente (aggiorna quello esistente se c'è). */
export function setKeyframe() {
  const s = store.getState();
  const time = snap(s.time, s.fps);
  const eps = 0.5 / s.fps;
  const existing = s.keyframes.find(k => Math.abs(k.time - time) < eps);
  if (existing) {
    setFromTimeline({
      keyframes: s.keyframes.map(k => (k === existing ? { ...k, camera: s.camera } : k)),
      selectedKey: existing.id,
      dirty: false,
    });
    return;
  }
  // il nuovo tratto eredita curva e percorso dal keyframe precedente
  const prev = [...s.keyframes].reverse().find(k => k.time < time);
  const key: Keyframe = {
    id: newKeyId(),
    time,
    camera: s.camera,
    easing: prev?.easing ?? 'inout',
    path: prev?.path ?? 'arc',
  };
  setFromTimeline({ keyframes: sortKeys([...s.keyframes, key]), selectedKey: key.id, dirty: false });
}

export function updateKeyframe(id: string, patch: Partial<Omit<Keyframe, 'id'>>) {
  const s = store.getState();
  if (patch.time !== undefined) patch.time = THREE.MathUtils.clamp(snap(patch.time, s.fps), 0, s.duration);
  setState({ keyframes: sortKeys(s.keyframes.map(k => (k.id === id ? { ...k, ...patch } : k))) });
  seek(store.getState().time);
}

export function deleteKeyframe(id: string) {
  const s = store.getState();
  setState({ keyframes: s.keyframes.filter(k => k.id !== id), selectedKey: s.selectedKey === id ? null : s.selectedKey });
  if (store.getState().keyframes.length) seek(s.time);
  else setState({ dirty: false });
}

export function clearKeyframes() {
  setState({ keyframes: [], selectedKey: null, dirty: false, playing: false });
}

/** Cambiare durata riscala i keyframe, così il movimento mantiene le sue proporzioni. */
export function setDuration(d: number) {
  const s = store.getState();
  const duration = THREE.MathUtils.clamp(d, DURATION_MIN, DURATION_MAX);
  const k = duration / s.duration;
  setState({
    duration,
    keyframes: s.keyframes.map(key => ({ ...key, time: key.time * k })),
  });
  seek(s.time * k, { snap: false });
}

export function setFps(fps: number) {
  setState({ fps });
  const s = store.getState();
  setState({ keyframes: s.keyframes.map(k => ({ ...k, time: snap(k.time, fps) })) });
  seek(s.time);
}

// ---------------------------------------------------------------------------
// Preset di movimento (costruiti attorno al manichino, rispettando dove guarda)
// ---------------------------------------------------------------------------

export type PresetId = 'orbita90' | 'orbita180' | 'push' | 'pull' | 'crane' | 'arcpush' | 'truck' | 'zoom';

export const PRESETS: PresetId[] = ['orbita90', 'orbita180', 'push', 'pull', 'crane', 'arcpush', 'truck', 'zoom'];

interface Shot {
  /** angolo attorno al soggetto in gradi, 0 = davanti, positivo = alla sua sinistra (destra di inquadratura) */
  az: number;
  dist: number;
  height: number;
  targetY: number;
  focal: number;
  /** spostamento laterale in metri, nel riferimento del soggetto */
  side?: number;
}

function shotCamera(subject: Vec3, facing: number, s: Shot): CameraState {
  const a = (facing + s.az) * (Math.PI / 180);
  const side = s.side ?? 0;
  const f = facing * (Math.PI / 180);
  // destra del soggetto vista dalla camera frontale = asse X ruotato
  const rx = Math.cos(f);
  const rz = -Math.sin(f);
  const sx = subject[0] + rx * side;
  const sz = subject[2] + rz * side;
  return {
    pos: [sx + Math.sin(a) * s.dist, subject[1] + s.height, sz + Math.cos(a) * s.dist],
    target: [sx, subject[1] + s.targetY, sz],
    roll: 0,
    focal: s.focal,
  };
}

const PRESET_SHOTS: Record<PresetId, { from: Shot; to: Shot; easing: Easing; path: PathMode }> = {
  orbita90: {
    from: { az: -45, dist: 4, height: 1.5, targetY: 1.1, focal: 35 },
    to: { az: 45, dist: 4, height: 1.5, targetY: 1.1, focal: 35 },
    easing: 'inout', path: 'arc',
  },
  orbita180: {
    from: { az: -90, dist: 4, height: 1.5, targetY: 1.1, focal: 35 },
    to: { az: 90, dist: 4, height: 1.5, targetY: 1.1, focal: 35 },
    easing: 'inout', path: 'arc',
  },
  push: {
    from: { az: 0, dist: 6, height: 1.55, targetY: 1.0, focal: 35 },
    to: { az: 0, dist: 1.6, height: 1.6, targetY: 1.55, focal: 35 },
    easing: 'inout', path: 'linear',
  },
  pull: {
    from: { az: 0, dist: 1.6, height: 1.6, targetY: 1.55, focal: 35 },
    to: { az: 0, dist: 6, height: 1.55, targetY: 1.0, focal: 35 },
    easing: 'inout', path: 'linear',
  },
  crane: {
    from: { az: 0, dist: 4, height: 0.4, targetY: 1.0, focal: 28 },
    to: { az: 0, dist: 5.5, height: 4.5, targetY: 0.9, focal: 28 },
    easing: 'inout', path: 'linear',
  },
  arcpush: {
    from: { az: -40, dist: 5, height: 1.5, targetY: 1.15, focal: 35 },
    to: { az: 25, dist: 2.4, height: 1.55, targetY: 1.4, focal: 35 },
    easing: 'inout', path: 'arc',
  },
  truck: {
    from: { az: 0, dist: 4, height: 1.4, targetY: 1.1, focal: 35, side: -2.5 },
    to: { az: 0, dist: 4, height: 1.4, targetY: 1.1, focal: 35, side: 2.5 },
    easing: 'linear', path: 'linear',
  },
  zoom: {
    from: { az: 0, dist: 6, height: 1.5, targetY: 1.5, focal: 24 },
    to: { az: 0, dist: 6, height: 1.5, targetY: 1.5, focal: 85 },
    easing: 'inout', path: 'linear',
  },
};

export function applyPreset(id: PresetId) {
  const s = store.getState();
  const subject = s.objects.find(o => o.id === MANNEQUIN_ID)!;
  const p = PRESET_SHOTS[id];
  const keyframes: Keyframe[] = [
    { id: newKeyId(), time: 0, camera: shotCamera(subject.pos, subject.rot[1], p.from), easing: p.easing, path: p.path },
    { id: newKeyId(), time: s.duration, camera: shotCamera(subject.pos, subject.rot[1], p.to), easing: p.easing, path: p.path },
  ];
  setState({ keyframes, selectedKey: null, playing: false });
  seek(0);
}

// ---------------------------------------------------------------------------
// Scorciatoie globali (fuori dai campi di testo)
// ---------------------------------------------------------------------------

export function bindTimelineShortcuts(signal: AbortSignal) {
  window.addEventListener('keydown', e => {
    const el = e.target as HTMLElement;
    if (el.closest('input, textarea, select')) return;
    const s = store.getState();
    switch (e.code) {
      case 'Space': togglePlay(); break;
      case 'Enter': case 'NumpadEnter': pause(); setKeyframe(); break;
      case 'Home': pause(); seek(0); break;
      case 'End': pause(); seek(s.duration); break;
      case 'PageUp': jumpKey(-1); break;
      case 'PageDown': jumpKey(1); break;
      case 'Delete':
        if (s.selectedKey) deleteKeyframe(s.selectedKey);
        else return;
        break;
      default: return;
    }
    e.preventDefault();
  }, { signal });
}
