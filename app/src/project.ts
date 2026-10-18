import { DEFAULT_CAMERA, DEFAULT_STYLE, MANNEQUIN_ID, setState, store, type AppState } from './store';
import { pickSaveTarget, sanitizeFileName } from './export/files';
import { t } from './i18n';

// Formato del file di progetto (.stage.json). Contiene solo i dati, non lo stato
// temporaneo dell'interfaccia (testina, selezione, riproduzione).

const FORMAT = 'stage-project';
const VERSION = 1;
const AUTOSAVE_KEY = 'stage:autosave';

const SAVED_KEYS = [
  'projectName', 'exportRes', 'exportAudio', 'duration', 'fps', 'keyframes', 'loop',
  'aspect', 'thirds', 'center', 'safe', 'handheld', 'camera', 'speed', 'objects', 'style',
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
function validate(raw: unknown): SavedState {
  const f = raw as Partial<ProjectFile>;
  if (!f || f.format !== FORMAT || typeof f.data !== 'object' || f.data === null) {
    throw new Error(t('err.notProject'));
  }
  if (typeof f.version === 'number' && f.version > VERSION) {
    throw new Error(t('err.newerVersion'));
  }
  const d = f.data as Partial<SavedState>;
  if (!Array.isArray(d.objects) || !d.objects.some(o => o.id === MANNEQUIN_ID)) throw new Error(t('err.noMannequin'));
  if (!Array.isArray(d.keyframes)) throw new Error(t('err.noKeyframes'));
  for (const o of d.objects) if (!isVec3(o.pos) || !isVec3(o.rot) || !isVec3(o.scale)) throw new Error(t('err.badObject', { name: o.name }));
  for (const k of d.keyframes) {
    if (typeof k.time !== 'number' || !isVec3(k.camera?.pos) || !isVec3(k.camera?.target)) throw new Error(t('err.badKeyframe'));
  }
  return d as SavedState;
}

function applyData(d: SavedState) {
  setState({
    ...d,
    exportAudio: d.exportAudio ?? true,
    center: d.center ?? false,
    safe: d.safe ?? false,
    handheld: d.handheld ?? store.getState().handheld,
    // progetti salvati prima dell'opzione "soggetto": manichino
    style: { ...DEFAULT_STYLE, ...d.style },
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
}

export function newProject() {
  setState({
    projectName: t('project.defaultName'),
    keyframes: [],
    objects: store.getState().objects.filter(o => o.id === MANNEQUIN_ID).map(o => ({ ...o, pos: [0, 0, 0], rot: [0, 0, 0] })),
    camera: DEFAULT_CAMERA,
    time: 0,
    playing: false,
    selectedId: null,
    selectedKey: null,
    dirty: false,
  });
}

// ---------------------------------------------------------------------------
// Salvataggio automatico nel browser (resta solo su questo computer e browser)
// ---------------------------------------------------------------------------

export function restoreAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) applyData(validate(JSON.parse(raw)));
  } catch {
    // salvataggio assente o illeggibile: si parte da un progetto vuoto
  }
}

export function startAutosave() {
  let timer = 0;
  let last = '';
  return store.subscribe(s => {
    // durante la riproduzione cambia solo la testina: niente da salvare
    if (s.playing) return;
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      try {
        const json = JSON.stringify(snapshot());
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
