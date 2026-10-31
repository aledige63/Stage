import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA, DEFAULT_STYLE, MANNEQUIN_HEIGHT, MANNEQUIN_ID, setState, store } from '../store';
import { applyPreset } from '../timeline';
import { generatePrompt } from '../export/prompt';
import { validate } from '../project';
import { clearHistory, redo, undo } from '../history';

const mannequin = { id: MANNEQUIN_ID, kind: 'manichino' as const, name: 'Manichino', pos: [0, 0, 0] as [number, number, number], rot: [0, 0, 0] as [number, number, number], scale: [1, 1, 1] as [number, number, number], tone: 0.6 };

beforeEach(() => {
  setState({
    keyframes: [], objects: [mannequin], camera: DEFAULT_CAMERA, style: DEFAULT_STYLE,
    subjectHeight: MANNEQUIN_HEIGHT, duration: 5, time: 0, playing: false, selectedKey: null, selectedId: null,
    handheld: { enabled: false, intensity: 0.35, frequency: 1, seed: 1 },
  });
  clearHistory();
});

describe('prompt', () => {
  it('descrive un\'orbita di 90 gradi', () => {
    applyPreset('orbita90');
    const p = generatePrompt(store.getState());
    expect(p).toMatch(/orbits 90 degrees around the subject/);
    expect(p).toMatch(/From 0\.0s to 5\.0s/);
  });

  it('riconosce uno zoom ottico a camera ferma', () => {
    applyPreset('zoom');
    expect(generatePrompt(store.getState())).toMatch(/zooms in optically from 24mm to 85mm.*does not move/);
  });

  it('adatta la riga sulla scena guida al soggetto', () => {
    setState({ style: { ...DEFAULT_STYLE, subject: 'nessuno' } });
    expect(generatePrompt(store.getState())).toMatch(/only a floor grid and reference columns/);
  });

  it('i preset seguono l\'altezza del soggetto', () => {
    applyPreset('push');
    const tall = store.getState().keyframes[1].camera.target[1];
    setState({ subjectHeight: 1.2 });
    applyPreset('push');
    const short = store.getState().keyframes[1].camera.target[1];
    expect(short).toBeCloseTo(tall * (1.2 / 1.8), 9);
  });
});

describe('validazione dei progetti', () => {
  const good = () => ({
    format: 'stage-project', version: 1, savedAt: '', data: {
      objects: [mannequin], keyframes: [{ id: 'k', time: 0, camera: DEFAULT_CAMERA, easing: 'linear', path: 'arc' }],
    },
  });

  it('accetta un progetto valido', () => {
    expect(() => validate(good())).not.toThrow();
  });

  it('rifiuta file estranei, versioni future e dati rotti', () => {
    expect(() => validate({ ciao: 1 })).toThrow();
    expect(() => validate({ ...good(), version: 99 })).toThrow();
    const noMannequin = good();
    noMannequin.data.objects = [];
    expect(() => validate(noMannequin)).toThrow();
    const badKey = good();
    (badKey.data.keyframes[0] as { camera: unknown }).camera = { pos: [0, 'x', 0] };
    expect(() => validate(badKey)).toThrow();
  });
});

describe('annulla / ripeti', () => {
  it('annulla e ripete l\'applicazione di un preset', () => {
    applyPreset('orbita180');
    expect(store.getState().keyframes).toHaveLength(2);
    undo();
    expect(store.getState().keyframes).toHaveLength(0);
    redo();
    expect(store.getState().keyframes).toHaveLength(2);
  });

  it('raggruppa le modifiche ravvicinate in un solo passo', () => {
    setState({ subjectHeight: 1.5 });
    setState({ subjectHeight: 1.6 });
    setState({ subjectHeight: 1.7 });
    undo();
    expect(store.getState().subjectHeight).toBe(MANNEQUIN_HEIGHT);
  });

  it('i movimenti di camera dal vivo non entrano nella cronologia', () => {
    setState({ camera: { ...DEFAULT_CAMERA, focal: 85 } });
    undo();
    expect(store.getState().camera.focal).toBe(85);
  });
});
