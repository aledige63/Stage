import { DEFAULT_CAMERA, DEFAULT_LOCK, DEFAULT_MANNEQUIN, DEFAULT_STYLE, MANNEQUIN_ID, setState, store, type AppState, type ColorId, type ObjectKey, type SceneObject, type Vec3 } from './store';
import { pickSaveTarget, sanitizeFileName } from './export/files';
import { t } from './i18n';
import { clearHistory } from './history';

// Formato del file di progetto (.stage.json). Contiene solo i dati, non lo stato
// temporaneo dell'interfaccia (testina, selezione, riproduzione).

const FORMAT = 'stage-project';
const VERSION = 3;
const AUTOSAVE_KEY = 'stage:autosave';
// il file della scena può superare il limite di localStorage: nel salvataggio automatico sta in IndexedDB
const SCENE_DB = 'stage';
const SCENE_STORE = 'scene';

const SAVED_KEYS = [
  'projectName', 'exportRes', 'exportAudio', 'duration', 'fps', 'keyframes', 'lock', 'subjectId', 'loop',
  'aspect', 'thirds', 'center', 'safe', 'handheld', 'camera', 'speed', 'objects', 'blenderScene', 'style',
] as const;

type SavedState = Pick<AppState, (typeof SAVED_KEYS)[number]>;

interface ProjectFile {
  format: typeof FORMAT;
  version: number;
  savedAt: string;
  data: SavedState;
}

function snapshot(): ProjectFile {
  const s = store.getState();
  const data = Object.fromEntries(SAVED_KEYS.map(k => [k, s[k]])) as SavedState;
  return { format: FORMAT, version: VERSION, savedAt: new Date().toISOString(), data };
}

function isVec3(x: unknown): boolean {
  return Array.isArray(x) && x.length === 3 && x.every(n => typeof n === 'number' && Number.isFinite(n));
}

/** Controlli minimi: un file sbagliato non deve rompere la scena. */
export function validate(raw: unknown): SavedState {
  const f = raw as Partial<ProjectFile>;
  if (!f || f.format !== FORMAT || typeof f.data !== 'object' || f.data === null) {
    throw new Error(t('err.notProject'));
  }
  if (typeof f.version === 'number' && f.version > VERSION) {
    throw new Error(t('err.newerVersion'));
  }
  const d = f.data as Partial<SavedState> & Legacy;
  // la scena può anche non avere manichini (dalla versione 3)
  if (!Array.isArray(d.objects)) throw new Error(t('err.badObject', { name: '?' }));
  if (!Array.isArray(d.keyframes)) throw new Error(t('err.noKeyframes'));
  if (d.subjectKeys !== undefined) {
    if (!Array.isArray(d.subjectKeys)) throw new Error(t('err.badKeyframe'));
    for (const k of d.subjectKeys) if (typeof k.time !== 'number' || !isVec3(k.pos) || typeof k.yaw !== 'number') throw new Error(t('err.badKeyframe'));
  }
  for (const o of d.objects) {
    for (const k of o.keys ?? []) {
      if (typeof k.time !== 'number' || !isVec3(k.pos) || !isVec3(k.rot) || !isVec3(k.scale)) throw new Error(t('err.badKeyframe'));
    }
  }
  if (d.lock !== undefined && !isVec3(d.lock?.offset)) throw new Error(t('err.badKeyframe'));
  const b = d.blenderScene;
  if (b && (typeof b.id !== 'string' || typeof b.glb !== 'string' || !isVec3(b.offset))) throw new Error(t('err.badScene'));
  for (const o of d.objects) if (!isVec3(o.pos) || !isVec3(o.rot) || !isVec3(o.scale)) throw new Error(t('err.badObject', { name: o.name }));
  for (const k of d.keyframes) {
    if (typeof k.time !== 'number' || !isVec3(k.camera?.pos) || !isVec3(k.camera?.target)) throw new Error(t('err.badKeyframe'));
  }
  return d as SavedState;
}

/** Campi dei progetti precedenti (versioni 1 e 2), convertiti all'apertura. */
interface Legacy {
  subjectHeight?: number;
  subjectKeys?: { id: string; time: number; pos: Vec3; yaw: number; easing: ObjectKey['easing'] }[];
}

const LEGACY_MANN_COLORS: Record<string, ColorId> = { grigio: 'grigio', bianco: 'bianco', arancio: 'arancio' };

function migrateObjects(d: SavedState & Legacy): SceneObject[] {
  const mann = LEGACY_MANN_COLORS[(d.style as { mann?: string } | undefined)?.mann ?? ''] ?? 'grigio';
  return d.objects.map(o => {
    if (o.id !== MANNEQUIN_ID || o.color) return o;
    // il vecchio manichino unico: colore dallo stile, altezza e keyframe del soggetto
    const keys = d.subjectKeys?.map(k => ({ id: k.id, time: k.time, easing: k.easing, pos: k.pos, rot: [0, k.yaw, 0] as Vec3, scale: [1, 1, 1] as Vec3 }));
    return { ...o, color: mann, height: d.subjectHeight, keys: keys?.length ? keys : undefined };
  });
}

function applyData(raw: SavedState) {
  const d = raw as SavedState & Legacy;
  const objects = migrateObjects(d);
  const { subjectHeight: _h, subjectKeys: _k, ...rest } = d;
  const { mann: _m, ...style } = { ...DEFAULT_STYLE, ...d.style } as typeof DEFAULT_STYLE & { mann?: string };
  setState({
    ...rest,
    blenderScene: d.blenderScene ?? null,
    lock: { ...DEFAULT_LOCK, ...d.lock },
    subjectId: d.subjectId !== undefined ? d.subjectId : objects.some(o => o.id === MANNEQUIN_ID) ? MANNEQUIN_ID : null,
    selectedObjKey: null,
    pendingPoses: {},
    objects: d.blenderScene ? objects : objects.filter(o => o.kind !== 'importato'),
    exportAudio: d.exportAudio ?? true,
    center: d.center ?? false,
    safe: d.safe ?? false,
    handheld: d.handheld ?? store.getState().handheld,
    // progetti salvati prima dell'opzione "soggetto": manichino
    style,
    camera: d.camera ?? d.keyframes[0]?.camera ?? DEFAULT_CAMERA,
    time: 0,
    playing: false,
    selectedId: null,
    selectedKey: null,
    dirty: false,
  });
}

export async function saveProject() {
  const s = store.getState();
  const name = sanitizeFileName(s.projectName) + '.stage.json';
  const target = await pickSaveTarget(name, t('file.project'), 'application/json', '.json');
  if (!target) return false;
  const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: 'application/json' });
  await target.write(blob);
  return true;
}

export async function openProject(file: File) {
  const data = validate(JSON.parse(await file.text()));
  applyData(data);
  clearHistory();
}

export function newProject() {
  setState({
    projectName: t('project.defaultName'),
    keyframes: [],
    objects: [DEFAULT_MANNEQUIN],
    subjectId: DEFAULT_MANNEQUIN.id,
    blenderScene: null,
    selectedObjKey: null,
    pendingPoses: {},
    lock: DEFAULT_LOCK,
    camera: DEFAULT_CAMERA,
    time: 0,
    playing: false,
    selectedId: null,
    selectedKey: null,
    dirty: false,
  });
  clearHistory();
}

// ---------------------------------------------------------------------------
// Salvataggio automatico nel browser (resta solo su questo computer e browser)
// ---------------------------------------------------------------------------

function withSceneStore<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(SCENE_DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(SCENE_STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = run(open.result.transaction(SCENE_STORE, mode).objectStore(SCENE_STORE));
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        open.result.close();
        resolve(req.result);
      };
    };
  });
}

/** Riporta il file della scena nel progetto ripristinato; se manca, la scena viene tolta. */
async function restoreSceneFile(id: string) {
  let glb: string | undefined;
  try {
    glb = await withSceneStore<string | undefined>('readonly', s => s.get(id));
  } catch {
    // archivio non disponibile: come se il file mancasse
  }
  setState(s => {
    if (s.blenderScene?.id !== id) return s;
    return glb
      ? { blenderScene: { ...s.blenderScene, glb } }
      : { blenderScene: null, objects: s.objects.filter(o => o.kind !== 'importato') };
  });
  clearHistory();
}

export function restoreAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return;
    const data = validate(JSON.parse(raw));
    applyData(data);
    if (data.blenderScene) void restoreSceneFile(data.blenderScene.id);
  } catch {
    // salvataggio assente o illeggibile: si parte da un progetto vuoto
  }
}

export function startAutosave() {
  let timer = 0;
  let last = '';
  let lastScene: string | null = null;
  return store.subscribe(s => {
    // durante la riproduzione cambia solo la testina: niente da salvare
    if (s.playing) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      try {
        const file = snapshot();
        const scene = file.data.blenderScene;
        if (scene?.glb && scene.id !== lastScene) {
          lastScene = scene.id;
          void withSceneStore('readwrite', st => {
            st.clear();
            return st.put(scene.glb, scene.id);
          }).catch(() => {
            // archiviazione non disponibile: la scena resta nei file di progetto salvati
          });
        }
        if (scene) file.data = { ...file.data, blenderScene: { ...scene, glb: '' } };
        const json = JSON.stringify(file);
        if (json.length && json.slice(json.indexOf('"data"')) !== last) {
          last = json.slice(json.indexOf('"data"'));
          localStorage.setItem(AUTOSAVE_KEY, json);
        }
      } catch {
        // archiviazione non disponibile (navigazione privata): si continua senza
      }
    }, 800);
  });
}
