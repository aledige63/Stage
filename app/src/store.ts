import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';

export type Vec3 = [number, number, number];

export interface CameraState {
  pos: Vec3;
  target: Vec3;
  /** gradi */
  roll: number;
  /** mm, formato full frame */
  focal: number;
}

export type PrimitiveKind = 'cubo' | 'sfera' | 'cilindro' | 'pannello';
export type ObjectKind = PrimitiveKind | 'manichino' | 'importato';

export interface SceneObject {
  id: string;
  kind: ObjectKind;
  name: string;
  pos: Vec3;
  /** gradi */
  rot: Vec3;
  scale: Vec3;
  /** tono di grigio 0 (scuro) .. 1 (chiaro) */
  tone: number;
  /** oggetti importati: posizione nell'elenco degli oggetti del file */
  source?: number;
  hidden?: boolean;
}

/** Scena importata da Blender: il file intero resta nel progetto. */
export interface BlenderScene {
  id: string;
  fileName: string;
  /** contenuto del file in base64; vuoto finché non è riletto dal salvataggio automatico */
  glb: string;
  bytes: number;
  /** spostamento e rotazione di tutta la scena */
  offset: Vec3;
  yaw: number;
}

/** Cosa rappresenta il soggetto nel video guida (anteprima ed export). */
export type SubjectMode = 'manichino' | 'cilindro' | 'blocco' | 'nessuno';

export interface StyleState {
  subject: SubjectMode;
  grid: 'marcata' | 'leggera' | 'scacchiera';
  bg: 'chiaro' | 'medio' | 'scuro';
  mann: 'grigio' | 'bianco' | 'arancio';
  refs: boolean;
  /** aspetto della scena importata nel video guida */
  sceneLook: 'grigio' | 'colori';
}

export interface HandheldState {
  enabled: boolean;
  /** 0..1 */
  intensity: number;
  /** moltiplicatore di velocità del tremolio, 0.3 (lento) .. 3 (nervoso) */
  frequency: number;
  /** variante del tremolio */
  seed: number;
}

export type Lang = 'it' | 'en';

/** Lingua salvata, altrimenti quella del browser (italiano se il browser è in italiano). */
function initialLang(): Lang {
  try {
    const saved = localStorage.getItem('stage:lang');
    if (saved === 'it' || saved === 'en') return saved;
  } catch {
    // archiviazione non disponibile
  }
  return (globalThis.navigator?.language ?? 'en').toLowerCase().startsWith('it') ? 'it' : 'en';
}

const LANG = initialLang();

export type Aspect = '16:9' | '9:16';
export type GizmoMode = 'translate' | 'rotate' | 'scale';

/** Curva del tratto che parte da un keyframe e arriva al successivo. */
export type Easing = 'linear' | 'in' | 'out' | 'inout' | 'hold';
/**
 * Arco: la camera gira attorno al target (orbite). Lineare: linea retta (dolly, truck, crane).
 * Panoramica: la camera ruota su se stessa (pan, tilt).
 */
export type PathMode = 'arc' | 'linear' | 'pan';

export interface Keyframe {
  id: string;
  /** secondi */
  time: number;
  camera: CameraState;
  easing: Easing;
  path: PathMode;
  /** panoramica: giri completi in più rispetto alla via breve (positivo = verso sinistra) */
  extraTurns?: number;
}

export interface AppState {
  /** lingua dell'interfaccia (preferenza del browser, non fa parte del progetto) */
  lang: Lang;
  projectName: string;
  exportRes: 720 | 1080;
  /** traccia audio muta nel video esportato */
  exportAudio: boolean;
  // timeline
  duration: number;
  fps: number;
  keyframes: Keyframe[];
  time: number;
  playing: boolean;
  loop: boolean;
  selectedKey: string | null;
  /** la camera è stata mossa e differisce dalla timeline nel punto corrente */
  dirty: boolean;

  aspect: Aspect;
  thirds: boolean;
  /** croce al centro dell'inquadratura (solo anteprima) */
  center: boolean;
  /** aree di sicurezza azione 93% e titoli 90% (solo anteprima) */
  safe: boolean;
  handheld: HandheldState;
  /** altezza del soggetto in metri (manichino, cilindro, blocco) */
  subjectHeight: number;
  camera: CameraState;
  /** moltiplicatore di velocità per tastiera e pulsanti */
  speed: number;
  objects: SceneObject[];
  blenderScene: BlenderScene | null;
  selectedId: string | null;
  gizmo: GizmoMode;
  style: StyleState;
}

export const MANNEQUIN_ID = 'manichino';
/** altezza del modello del manichino: l'altezza del soggetto la scala in proporzione */
export const MANNEQUIN_HEIGHT = 1.8;
export const SUBJECT_HEIGHT_MIN = 1.0;
export const SUBJECT_HEIGHT_MAX = 2.1;

/** Fattore di scala del soggetto rispetto al modello del manichino. */
export const subjectScale = (s: { subjectHeight: number }) => s.subjectHeight / MANNEQUIN_HEIGHT;

export const DEFAULT_STYLE: StyleState = { subject: 'manichino', grid: 'marcata', bg: 'chiaro', mann: 'grigio', refs: false, sceneLook: 'grigio' };

export const DEFAULT_CAMERA: CameraState = { pos: [0, 1.5, 5], target: [0, 1.1, 0], roll: 0, focal: 35 };

export const store = createStore<AppState>()(() => ({
  lang: LANG,
  projectName: LANG === 'it' ? 'Nuovo movimento' : 'New shot',
  exportRes: 1080,
  exportAudio: true,
  duration: 5,
  fps: 24,
  keyframes: [],
  time: 0,
  playing: false,
  loop: true,
  selectedKey: null,
  dirty: false,
  aspect: '16:9',
  thirds: false,
  center: false,
  safe: false,
  handheld: { enabled: false, intensity: 0.35, frequency: 1, seed: 1 },
  subjectHeight: MANNEQUIN_HEIGHT,
  camera: DEFAULT_CAMERA,
  speed: 1,
  objects: [
    { id: MANNEQUIN_ID, kind: 'manichino', name: 'Manichino', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], tone: 0.6 },
  ],
  blenderScene: null,
  selectedId: null,
  gizmo: 'translate',
  style: DEFAULT_STYLE,
}));

export const useApp = <T,>(selector: (s: AppState) => T): T => useStore(store, selector);

export const setState = store.setState;

export function setStyle(patch: Partial<StyleState>) {
  setState(s => ({ style: { ...s.style, ...patch } }));
}

export function setCamera(patch: Partial<CameraState>) {
  setState(s => ({ camera: { ...s.camera, ...patch } }));
}

export function updateObject(id: string, patch: Partial<SceneObject>) {
  setState(s => ({ objects: s.objects.map(o => (o.id === id ? { ...o, ...patch } : o)) }));
}

const PRIMITIVE_NAMES: Record<PrimitiveKind, string> = {
  cubo: 'Cubo',
  sfera: 'Sfera',
  cilindro: 'Cilindro',
  pannello: 'Pannello',
};

export function addPrimitive(kind: PrimitiveKind) {
  const objects = store.getState().objects;
  const n = objects.filter(o => o.kind === kind).length + 1;
  const angle = objects.length * 0.9;
  const pos: Vec3 = [Math.sin(angle) * 2.2, kind === 'pannello' ? 1 : 0.5, -Math.abs(Math.cos(angle)) * 2.2 - 0.5];
  const obj: SceneObject = {
    id: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
    kind,
    name: `${PRIMITIVE_NAMES[kind]} ${n}`,
    pos,
    rot: [0, 0, 0],
    scale: [1, 1, 1],
    tone: 0.55,
  };
  setState(s => ({ objects: [...s.objects, obj], selectedId: obj.id }));
}

export function removeObject(id: string) {
  if (id === MANNEQUIN_ID) return;
  setState(s => ({
    objects: s.objects.filter(o => o.id !== id),
    selectedId: s.selectedId === id ? null : s.selectedId,
  }));
}
