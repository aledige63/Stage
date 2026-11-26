import * as THREE from 'three';
import {
  setState, store, subjectScale, updateObject,
  type AppState, type CameraState, type Easing, type Keyframe, type ObjectKey, type ObjectPose, type PathMode, type SceneObject, type TargetLock, type Vec3,
} from './store';
import { panDelta } from './engine/interpolation';
import { cameraAt, currentPose, effectiveCamera, subjectAt } from './engine/subjectMotion';
import { pan } from './engine/cameraOps';

export const DURATION_MIN = 2;
export const DURATION_MAX = 15;
export const FPS_OPTIONS = [24, 25, 30];

const newKeyId = () => 'k-' + crypto.randomUUID().slice(0, 8);
const newObjKeyId = () => 'o-' + crypto.randomUUID().slice(0, 8);

const sortKeys = <K extends { time: number }>(keys: K[]) => [...keys].sort((a, b) => a.time - b.time);

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

const NO_POSES: Record<string, ObjectPose> = {};

const allObjectKeys = (s: AppState) => s.objects.flatMap(o => o.keys ?? []);

// ---------------------------------------------------------------------------
// Riproduzione e posizionamento
// ---------------------------------------------------------------------------

/** Sposta la testina; camera e oggetti seguono le loro timeline (e l'eventuale aggancio). */
export function seek(t: number, opts: { snap?: boolean } = {}) {
  const s = store.getState();
  let time = THREE.MathUtils.clamp(t, 0, s.duration);
  if (opts.snap !== false) time = snap(time, s.fps);
  if (s.keyframes.length || s.lock.enabled || s.objects.some(o => o.keys?.length)) {
    setFromTimeline({ time, camera: cameraAt({ ...s, time }, time), pendingPoses: NO_POSES, dirty: false });
  } else {
    setState({ time, pendingPoses: NO_POSES });
  }
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
  const times = [...s.keyframes, ...allObjectKeys(s)].map(k => k.time).sort((a, b) => a - b);
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
  // con l'aggancio si salva il punto mirato vero, così gli archi girano attorno al soggetto
  const camera = effectiveCamera(s);
  if (existing) {
    setFromTimeline({
      keyframes: s.keyframes.map(k => (k === existing ? { ...k, camera } : k)),
      selectedKey: existing.id,
      selectedObjKey: null,
      dirty: false,
    });
    return;
  }
  // il nuovo tratto eredita curva e percorso dal keyframe precedente
  const prev = [...s.keyframes].reverse().find(k => k.time < time);
  const key: Keyframe = {
    id: newKeyId(),
    time,
    camera,
    easing: prev?.easing ?? 'inout',
    // la panoramica non si eredita: un nuovo tratto con la camera ferma lo diventa da solo
    path: prev && prev.path !== 'pan' ? prev.path : 'arc',
  };
  setFromTimeline({ keyframes: sortKeys([...s.keyframes, key]), selectedKey: key.id, selectedObjKey: null, dirty: false });
}

/** Sostituisce la camera di un keyframe con quella mostrata ora, ovunque sia la testina. */
export function refreshKeyframe(id: string) {
  const s = store.getState();
  if (!s.keyframes.some(k => k.id === id)) return;
  const camera = effectiveCamera(s);
  setFromTimeline({ keyframes: s.keyframes.map(k => (k.id === id ? { ...k, camera } : k)), selectedKey: id, selectedObjKey: null, dirty: false });
  seek(s.keyframes.find(k => k.id === id)!.time);
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

/**
 * Copia un keyframe nel punto indicato (di base la testina). Un keyframe già presente in quel
 * punto viene sostituito dalla copia. Restituisce l'id della copia, o null se non serve.
 */
export function duplicateKeyframe(id: string, at = store.getState().time): string | null {
  const s = store.getState();
  const src = s.keyframes.find(k => k.id === id);
  const time = THREE.MathUtils.clamp(snap(at, s.fps), 0, s.duration);
  const eps = 0.5 / s.fps;
  if (!src || Math.abs(src.time - time) < eps) return null;
  const copy: Keyframe = { ...src, id: newKeyId(), time };
  const rest = s.keyframes.filter(k => Math.abs(k.time - time) >= eps);
  setState({ keyframes: sortKeys([...rest, copy]), selectedKey: copy.id, selectedObjKey: null });
  seek(time);
  return copy.id;
}

/** Svuota camera e oggetti; ogni oggetto resta dove si trova adesso. */
export function clearKeyframes() {
  const s = store.getState();
  setState({
    keyframes: [],
    objects: s.objects.map(o => (o.keys ? { ...o, ...currentPose(s, o), keys: undefined } : o)),
    selectedKey: null,
    selectedObjKey: null,
    pendingPoses: NO_POSES,
    dirty: false,
    playing: false,
  });
}

// ---------------------------------------------------------------------------
// Oggetti: timeline propria e aggancio del target
// ---------------------------------------------------------------------------

const mapObject = (id: string, fn: (o: SceneObject) => SceneObject) =>
  store.getState().objects.map(o => (o.id === id ? fn(o) : o));

/**
 * Sposta un oggetto. Senza keyframe cambia la sua posa fissa; con i keyframe la nuova posa
 * resta in sospeso finché non la si salva con setObjectKey (come la camera).
 */
export function moveObject(id: string, patch: Partial<ObjectPose>) {
  const s = store.getState();
  const o = s.objects.find(x => x.id === id);
  if (!o) return;
  if (o.keys?.length) setState({ pendingPoses: { ...s.pendingPoses, [id]: { ...currentPose(s, o), ...patch } } });
  else updateObject(id, patch);
}

/** Salva la posa attuale dell'oggetto come keyframe nel punto corrente. */
export function setObjectKey(id = store.getState().selectedId) {
  const s = store.getState();
  const o = s.objects.find(x => x.id === id);
  if (!o) return;
  const time = snap(s.time, s.fps);
  const eps = 0.5 / s.fps;
  const { pos, rot, scale } = currentPose(s, o);
  const keys = o.keys ?? [];
  const existing = keys.find(k => Math.abs(k.time - time) < eps);
  let keyId: string;
  let next: ObjectKey[];
  if (existing) {
    keyId = existing.id;
    next = keys.map(k => (k === existing ? { ...k, pos, rot, scale } : k));
  } else {
    keyId = newObjKeyId();
    const prev = [...keys].reverse().find(k => k.time < time);
    next = sortKeys([...keys, { id: keyId, time, pos, rot, scale, easing: prev?.easing ?? 'inout' }]);
  }
  const { [o.id]: _saved, ...pendingPoses } = s.pendingPoses;
  setFromTimeline({ objects: mapObject(o.id, x => ({ ...x, keys: next })), selectedObjKey: keyId, selectedKey: null, pendingPoses });
  seek(store.getState().time);
}

/** Sostituisce la posa di un keyframe dell'oggetto con quella mostrata ora. */
export function refreshObjectKey(objId: string, keyId: string) {
  const s = store.getState();
  const o = s.objects.find(x => x.id === objId);
  const key = o?.keys?.find(k => k.id === keyId);
  if (!o || !key) return;
  const { pos, rot, scale } = currentPose(s, o);
  const { [objId]: _saved, ...pendingPoses } = s.pendingPoses;
  setFromTimeline({
    objects: mapObject(objId, x => ({ ...x, keys: (x.keys ?? []).map(k => (k.id === keyId ? { ...k, pos, rot, scale } : k)) })),
    selectedObjKey: keyId,
    selectedKey: null,
    pendingPoses,
  });
  seek(key.time);
}

export function updateObjectKey(objId: string, keyId: string, patch: Partial<Omit<ObjectKey, 'id'>>) {
  const s = store.getState();
  if (patch.time !== undefined) patch.time = THREE.MathUtils.clamp(snap(patch.time, s.fps), 0, s.duration);
  setState({ objects: mapObject(objId, o => ({ ...o, keys: sortKeys((o.keys ?? []).map(k => (k.id === keyId ? { ...k, ...patch } : k))) })) });
  seek(store.getState().time);
}

export function deleteObjectKey(objId: string, keyId: string) {
  const s = store.getState();
  setState({
    objects: mapObject(objId, o => {
      const keys = (o.keys ?? []).filter(k => k.id !== keyId);
      // l'ultimo keyframe eliminato lascia l'oggetto dove si trovava
      return keys.length ? { ...o, keys } : { ...o, ...currentPose(s, o), keys: undefined };
    }),
    selectedObjKey: s.selectedObjKey === keyId ? null : s.selectedObjKey,
  });
  seek(s.time);
}

/** Come duplicateKeyframe, per i keyframe di un oggetto. */
export function duplicateObjectKey(objId: string, keyId: string, at = store.getState().time): string | null {
  const s = store.getState();
  const o = s.objects.find(x => x.id === objId);
  const src = o?.keys?.find(k => k.id === keyId);
  const time = THREE.MathUtils.clamp(snap(at, s.fps), 0, s.duration);
  const eps = 0.5 / s.fps;
  if (!o || !src || Math.abs(src.time - time) < eps) return null;
  const copy: ObjectKey = { ...src, id: newObjKeyId(), time };
  const rest = (o.keys ?? []).filter(k => Math.abs(k.time - time) >= eps);
  const { [objId]: _dropped, ...pendingPoses } = s.pendingPoses;
  setState({
    objects: mapObject(objId, x => ({ ...x, keys: sortKeys([...rest, copy]) })),
    selectedObjKey: copy.id,
    selectedKey: null,
    selectedId: objId,
    pendingPoses,
  });
  seek(time);
  return copy.id;
}

/** Proprietario di un keyframe di oggetto. */
export function keyOwner(s: AppState, keyId: string | null) {
  return keyId ? s.objects.find(o => o.keys?.some(k => k.id === keyId)) ?? null : null;
}

export function setLock(patch: Partial<TargetLock>) {
  setState(s => ({ lock: { ...s.lock, ...patch } }));
  seek(store.getState().time);
}

/** Cambiare durata riscala i keyframe, così il movimento mantiene le sue proporzioni. */
export function setDuration(d: number) {
  const s = store.getState();
  const duration = THREE.MathUtils.clamp(d, DURATION_MIN, DURATION_MAX);
  const k = duration / s.duration;
  setState({
    duration,
    keyframes: s.keyframes.map(key => ({ ...key, time: key.time * k })),
    objects: s.objects.map(o => (o.keys ? { ...o, keys: o.keys.map(key => ({ ...key, time: key.time * k })) } : o)),
  });
  seek(s.time * k, { snap: false });
}

export function setFps(fps: number) {
  setState({ fps });
  const s = store.getState();
  setState({
    keyframes: s.keyframes.map(k => ({ ...k, time: snap(k.time, fps) })),
    objects: s.objects.map(o => (o.keys ? { ...o, keys: o.keys.map(k => ({ ...k, time: snap(k.time, fps) })) } : o)),
  });
  seek(s.time);
}

// ---------------------------------------------------------------------------
// Preset di movimento (costruiti attorno al manichino, rispettando dove guarda)
// ---------------------------------------------------------------------------

export type PanPresetId = 'pan90' | 'pan180' | 'pan360';
export type PresetId = PanPresetId | 'orbita90' | 'orbita180' | 'push' | 'pull' | 'crane' | 'arcpush' | 'truck' | 'zoom';

export const PRESETS: PresetId[] = ['orbita90', 'orbita180', 'pan90', 'pan180', 'pan360', 'push', 'pull', 'crane', 'arcpush', 'truck', 'zoom'];

const PAN_DEGREES: Record<PanPresetId, number> = { pan90: 90, pan180: 180, pan360: 360 };

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

/** scale = altezza del soggetto / altezza del manichino: altezze e punti mirati seguono il soggetto. */
function shotCamera(subject: Vec3, facing: number, s: Shot, scale: number): CameraState {
  const a = (facing + s.az) * (Math.PI / 180);
  const side = s.side ?? 0;
  const f = facing * (Math.PI / 180);
  // destra del soggetto vista dalla camera frontale = asse X ruotato
  const rx = Math.cos(f);
  const rz = -Math.sin(f);
  const sx = subject[0] + rx * side;
  const sz = subject[2] + rz * side;
  return {
    pos: [sx + Math.sin(a) * s.dist, subject[1] + s.height * scale, sz + Math.cos(a) * s.dist],
    target: [sx, subject[1] + s.targetY * scale, sz],
    roll: 0,
    focal: s.focal,
  };
}

const PRESET_SHOTS: Record<Exclude<PresetId, PanPresetId>, { from: Shot; to: Shot; easing: Easing; path: PathMode }> = {
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

/** Panoramica verso destra dalla posizione e dall'inquadratura attuali della camera. */
function applyPanPreset(id: PanPresetId) {
  const s = store.getState();
  const want = -PAN_DEGREES[id] * (Math.PI / 180);
  const end = pan(s.camera, want);
  const extraTurns = Math.round((want - panDelta(s.camera, end)) / (Math.PI * 2));
  const keyframes: Keyframe[] = [
    { id: newKeyId(), time: 0, camera: s.camera, easing: 'inout', path: 'pan', extraTurns },
    { id: newKeyId(), time: s.duration, camera: end, easing: 'inout', path: 'arc' },
  ];
  setState({ keyframes, selectedKey: null, playing: false });
  seek(0);
}

export function applyPreset(id: PresetId) {
  if (id === 'pan90' || id === 'pan180' || id === 'pan360') {
    applyPanPreset(id);
    return;
  }
  const s = store.getState();
  // la camera segue la posizione del soggetto ma non le sue rotazioni
  // senza soggetto i preset girano attorno al centro della scena
  const center = { pos: [0, 0, 0] as Vec3, yaw: 0 };
  const start = subjectAt(s, 0) ?? center;
  const end = subjectAt(s, s.duration) ?? center;
  const p = PRESET_SHOTS[id];
  const k = subjectScale(s);
  const keyframes: Keyframe[] = [
    { id: newKeyId(), time: 0, camera: shotCamera(start.pos, start.yaw, p.from, k), easing: p.easing, path: p.path },
    { id: newKeyId(), time: s.duration, camera: shotCamera(end.pos, start.yaw, p.to, k), easing: p.easing, path: p.path },
  ];
  setState({ keyframes, selectedKey: null, playing: false });
  seek(0);
}

// ---------------------------------------------------------------------------
// Scorciatoie globali (fuori dai campi di testo)
// ---------------------------------------------------------------------------

export function bindTimelineShortcuts(signal: AbortSignal) {
  window.addEventListener('keydown', e => {
    if (e.target instanceof Element && e.target.closest('input, textarea, select')) return;
    const s = store.getState();
    switch (e.code) {
      case 'Space': togglePlay(); break;
      case 'Enter': case 'NumpadEnter': pause(); if (e.shiftKey) setObjectKey(); else setKeyframe(); break;
      case 'Home': pause(); seek(0); break;
      case 'End': pause(); seek(s.duration); break;
      case 'PageUp': jumpKey(-1); break;
      case 'PageDown': jumpKey(1); break;
      case 'Delete':
        if (s.selectedKey) deleteKeyframe(s.selectedKey);
        else if (s.selectedObjKey) {
          const owner = keyOwner(s, s.selectedObjKey);
          if (owner) deleteObjectKey(owner.id, s.selectedObjKey);
        }
        else return;
        break;
      default: return;
    }
    e.preventDefault();
  }, { signal });
}
