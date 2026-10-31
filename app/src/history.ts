import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { setState, store, type AppState } from './store';
import { seek } from './timeline';

// Annulla / ripeti sul "documento": keyframe, oggetti, soggetto, stile, impostazioni della timeline.
// La posizione corrente della camera è esclusa (come la navigazione nei programmi 3D): conta ciò
// che è salvato nei keyframe.

const DOC_KEYS = [
  'keyframes', 'objects', 'style', 'handheld', 'subjectHeight', 'duration', 'fps', 'aspect', 'loop',
] as const;

type Doc = Pick<AppState, (typeof DOC_KEYS)[number]>;

const LIMIT = 100;
/** modifiche più ravvicinate di così (trascinamenti, cursori) diventano un solo passo */
const GROUP_MS = 400;

const past: Doc[] = [];
const future: Doc[] = [];
let pending: Doc | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let applying = false;

/** Stato reattivo per i pulsanti dell'interfaccia. */
const historyState = createStore(() => ({ canUndo: false, canRedo: false }));
export const useHistory = () => useStore(historyState);

function pick(s: AppState): Doc {
  return Object.fromEntries(DOC_KEYS.map(k => [k, s[k]])) as Doc;
}

function refresh() {
  historyState.setState({ canUndo: past.length > 0 || pending !== null, canRedo: future.length > 0 });
}

function commitPending() {
  clearTimeout(timer);
  if (!pending) return;
  past.push(pending);
  if (past.length > LIMIT) past.shift();
  pending = null;
  refresh();
}

store.subscribe((s, prev) => {
  if (applying) return;
  if (!DOC_KEYS.some(k => s[k] !== prev[k])) return;
  if (!pending) pending = pick(prev);
  future.length = 0;
  clearTimeout(timer);
  timer = setTimeout(commitPending, GROUP_MS);
  refresh();
});

function apply(doc: Doc) {
  applying = true;
  try {
    const s = store.getState();
    const selectedId = doc.objects.some(o => o.id === s.selectedId) ? s.selectedId : null;
    const selectedKey = doc.keyframes.some(k => k.id === s.selectedKey) ? s.selectedKey : null;
    setState({ ...doc, selectedId, selectedKey, playing: false });
    // la camera segue la timeline ripristinata
    seek(Math.min(store.getState().time, doc.duration));
  } finally {
    applying = false;
  }
  refresh();
}

export function undo() {
  commitPending();
  const doc = past.pop();
  if (!doc) return;
  future.push(pick(store.getState()));
  apply(doc);
}

export function redo() {
  commitPending();
  const doc = future.pop();
  if (!doc) return;
  past.push(pick(store.getState()));
  apply(doc);
}

/** Dopo Nuovo / Apri progetto la cronologia riparte da zero. */
export function clearHistory() {
  clearTimeout(timer);
  past.length = 0;
  future.length = 0;
  pending = null;
  refresh();
}

/** true se il tasto arriva da un campo di testo (l'origine può anche non essere un elemento). */
export function isTextField(target: EventTarget | null) {
  return target instanceof Element && target.closest('input, textarea, select') !== null;
}

export function bindHistoryShortcuts(signal: AbortSignal) {
  window.addEventListener('keydown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    // nei campi di testo vale l'annulla del browser
    if (isTextField(e.target)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) undo();
    else if (k === 'y' || (k === 'z' && e.shiftKey)) redo();
    else return;
    e.preventDefault();
  }, { signal });
}
