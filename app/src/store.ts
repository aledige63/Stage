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

/** Colori degli oggetti: il grigio usa il tono, gli altri sono pieni. */
export type ColorId = 'grigio' | 'bianco' | 'nero' | 'rosso' | 'blu' | 'giallo' | 'verde' | 'arancio';

export const COLOR_IDS: ColorId[] = ['grigio', 'bianco', 'nero', 'rosso', 'blu', 'giallo', 'verde', 'arancio'];

export const COLOR_HEX: Record<Exclude<ColorId, 'grigio'>, string> = {
  bianco: '#f2f2f2', nero: '#262626', rosso: '#d33a2c', blu: '#2f6fd6', giallo: '#f2c230', verde: '#3aa655', arancio: '#e07b39',
};

/** Colore CSS di un oggetto (il grigio dipende dal tono). */
export function colorCss(o: { color?: ColorId; tone: number }) {
  if (o.color && o.color !== 'grigio') return COLOR_HEX[o.color];
  const g = Math.round((0.15 + o.tone * 0.8) * 255);
  return `rgb(${g}, ${g}, ${g})`;
}

/** Posa di un oggetto in un istante. */
export interface ObjectPose {
  pos: Vec3;
  /** gradi */
  rot: Vec3;
  scale: Vec3;
}

/** Keyframe di un oggetto: la curva vale per il tratto che parte da qui. */
export interface ObjectKey extends ObjectPose {
  id: string;
  time: number;
  easing: Easing;
}

export interface SceneObject extends ObjectPose {
  id: string;
  kind: ObjectKind;
  name: string;
  /** tono di grigio 0 (scuro) .. 1 (chiaro), per il colore grigio */
  tone: number;
  color?: ColorId;
  /** manichino: altezza in metri */
  height?: number;
  /** nome scelto dall'utente (compare anche nel prompt); senza, tipo e numero */
  label?: string;
  /** forma semplice che nel video finale è un soggetto (un'auto, un animale...): nel prompt per il Compiler va associata */
  mapped?: boolean;
  /** timeline propria; senza keyframe valgono pos, rot e scale */
  keys?: ObjectKey[];
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

/** Posizione a terra e direzione del soggetto (gradi). */
export interface SubjectPose {
  pos: Vec3;
  yaw: number;
}

/** Target della camera agganciato a un punto di un oggetto (facoltativo). */
export interface TargetLock {
  enabled: boolean;
  /** oggetto agganciato; null = il soggetto principale */
  targetId?: string | null;
  /** metri, nel riferimento dell'oggetto: X alla sua sinistra, Y in alto, Z davanti */
  offset: Vec3;
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
  /** keyframe di oggetto selezionato (gli id sono unici in tutta la scena) */
  selectedObjKey: string | null;
  /** oggetti con keyframe spostati a mano e non ancora salvati */
  pendingPoses: Record<string, ObjectPose>;
  /** oggetto che fa da soggetto principale (inquadrature, preset, aggancio, prompt); null = nessuno */
  subjectId: string | null;
  lock: TargetLock;
  /** la camera è stata mossa e differisce dalla timeline nel punto corrente */
  dirty: boolean;

  aspect: Aspect;
  thirds: boolean;
  /** croce al centro dell'inquadratura (solo anteprima) */
  center: boolean;
  /** aree di sicurezza azione 93% e titoli 90% (solo anteprima) */
  safe: boolean;
  handheld: HandheldState;
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

/** Selezioni speciali in vista regia: la camera e il suo punto mirato (non sono oggetti). */
export const CAMERA_SEL = '@camera';
export const TARGET_SEL = '@target';
export const isCameraSel = (id: string | null) => id === CAMERA_SEL || id === TARGET_SEL;
/** altezza del modello del manichino: l'altezza del soggetto la scala in proporzione */
export const MANNEQUIN_HEIGHT = 1.8;
export const SUBJECT_HEIGHT_MIN = 1.0;
export const SUBJECT_HEIGHT_MAX = 2.1;

const BASE_HEIGHT: Record<PrimitiveKind, number> = { cubo: 1, sfera: 1, cilindro: 1, pannello: 2 };

/** Altezza di un oggetto in metri (per inquadrature e prompt). */
export function objectHeight(o: SceneObject) {
  if (o.kind === 'manichino') return o.height ?? MANNEQUIN_HEIGHT;
  if (o.kind === 'importato') return MANNEQUIN_HEIGHT;
  return BASE_HEIGHT[o.kind] * Math.abs(o.scale[1]);
}

export const subjectObject = (s: AppState): SceneObject | null =>
  (s.subjectId ? s.objects.find(o => o.id === s.subjectId) : undefined) ?? null;

/** Altezza del soggetto principale; senza soggetto quella di una persona. */
export function subjectHeight(s: AppState) {
  const o = subjectObject(s);
  return o ? objectHeight(o) : MANNEQUIN_HEIGHT;
}

/** Fattore di scala del soggetto rispetto al modello del manichino. */
export const subjectScale = (s: AppState) => subjectHeight(s) / MANNEQUIN_HEIGHT;

export const isMannequin = (o: SceneObject | null | undefined) => o?.kind === 'manichino';

export const DEFAULT_STYLE: StyleState = { subject: 'manichino', grid: 'marcata', bg: 'chiaro', refs: false, sceneLook: 'grigio' };

export const DEFAULT_MANNEQUIN: SceneObject = {
  id: 'manichino', kind: 'manichino', name: 'Manichino', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], tone: 0.6, color: 'grigio',
};

export const DEFAULT_LOCK: TargetLock = { enabled: false, targetId: null, offset: [0, 1.3, 0] };

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
  selectedObjKey: null,
  pendingPoses: {},
  subjectId: 'manichino',
  lock: DEFAULT_LOCK,
  dirty: false,
  aspect: '16:9',
  thirds: false,
  center: false,
  safe: false,
  handheld: { enabled: false, intensity: 0.35, frequency: 1, seed: 1 },
  camera: DEFAULT_CAMERA,
  speed: 1,
  objects: [DEFAULT_MANNEQUIN],
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

export type AddableKind = PrimitiveKind | 'manichino';

const OBJECT_NAMES: Record<AddableKind, string> = {
  manichino: 'Manichino',
  cubo: 'Cubo',
  sfera: 'Sfera',
  cilindro: 'Cilindro',
  pannello: 'Pannello',
};

export function addObject(kind: AddableKind) {
  const s = store.getState();
  const n = s.objects.filter(o => o.kind === kind).length + 1;
  const angle = s.objects.length * 0.9;
  const y = kind === 'manichino' ? 0 : kind === 'pannello' ? 1 : 0.5;
  const pos: Vec3 = [Math.sin(angle) * 2.2, y, -Math.abs(Math.cos(angle)) * 2.2 - 0.5];
  const obj: SceneObject = {
    id: `${kind}-${crypto.randomUUID().slice(0, 8)}`,
    kind,
    name: `${OBJECT_NAMES[kind]} ${n}`,
    pos,
    rot: [0, 0, 0],
    scale: [1, 1, 1],
    tone: kind === 'manichino' ? 0.6 : 0.55,
    color: 'grigio',
  };
  setState({
    objects: [...s.objects, obj],
    selectedId: obj.id,
    // il primo manichino in una scena senza soggetto lo diventa
    subjectId: s.subjectId ?? (kind === 'manichino' ? obj.id : null),
  });
}

export function removeObject(id: string) {
  setState(s => {
    const objects = s.objects.filter(o => o.id !== id);
    const { [id]: _removed, ...pendingPoses } = s.pendingPoses;
    return {
      objects,
      pendingPoses,
      selectedId: s.selectedId === id ? null : s.selectedId,
      subjectId: s.subjectId === id ? objects.find(o => o.kind === 'manichino')?.id ?? null : s.subjectId,
      lock: s.lock.targetId === id ? { ...s.lock, targetId: null } : s.lock,
    };
  });
}
