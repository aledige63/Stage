import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_CAMERA, DEFAULT_STYLE, MANNEQUIN_HEIGHT, MANNEQUIN_ID, setState, store, type Vec3 } from '../store';
import { analyzeScene, CAMERA_NODE, cameraFromNode, fromBase64, SUBJECT_NODE, toBase64 } from '../engine/blenderImport';
import { applyToCamera } from '../engine/cameraOps';
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

describe('scena da Blender', () => {
  const placeholder = (name: string) => {
    const o = new THREE.Object3D();
    o.name = name;
    return o;
  };
  const mesh = (name: string) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.8, 0.3));
    m.name = name;
    return m;
  };

  it('codifica e decodifica il file senza perdite', () => {
    const bytes = Uint8Array.from({ length: 70000 }, (_, i) => i % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });

  it('tiene solo gli oggetti visibili e toglie i segnaposto', () => {
    const root = new THREE.Group();
    const cam = new THREE.PerspectiveCamera();
    cam.name = CAMERA_NODE;
    root.add(mesh('Tavolo'), mesh(SUBJECT_NODE), cam, placeholder('Vuoto'));
    const parsed = analyzeScene(root);
    expect(parsed.roots.map(o => o.name)).toEqual(['Tavolo']);
    expect(parsed.camera).toBe(cam);
  });

  it('Stage_Subject: una mesh va a terra, centrata, con la sua direzione', () => {
    const root = new THREE.Group();
    const subject = mesh(SUBJECT_NODE);
    subject.position.set(1, 0.9, -2);
    subject.rotation.y = Math.PI / 6;
    root.add(subject);
    const { pos, yaw } = analyzeScene(root).subject!;
    expect(pos[0]).toBeCloseTo(1);
    expect(pos[1]).toBeCloseTo(0);
    expect(pos[2]).toBeCloseTo(-2);
    expect(yaw).toBeCloseTo(30);
  });

  it('Stage_Camera: stessa posizione, direzione, roll e focale', () => {
    const state = { pos: [3, 1.6, 5] as Vec3, target: [0.5, 1.2, 0.5] as Vec3, roll: 12, focal: 50 };
    const node = new THREE.PerspectiveCamera();
    applyToCamera(node, state, 16 / 9);
    node.updateMatrixWorld();
    const c = cameraFromNode(node, state.target);
    expect(c.roll).toBeCloseTo(12);
    expect(c.focal).toBeCloseTo(50);
    expect(c.pos[0]).toBeCloseTo(3);
    const a = new THREE.Vector3(...c.target).sub(new THREE.Vector3(...c.pos)).normalize();
    const b = new THREE.Vector3(...state.target).sub(new THREE.Vector3(...state.pos)).normalize();
    expect(a.distanceTo(b)).toBeLessThan(1e-6);
  });

  it('il prompt cita la scena solo se è visibile', () => {
    const obj = { ...mannequin, id: 'b', kind: 'importato' as const, name: 'Tavolo', source: 0 };
    setState({ objects: [mannequin, obj] });
    expect(generatePrompt(store.getState())).toMatch(/simple 3D blocks/);
    setState({ objects: [mannequin, { ...obj, hidden: true }] });
    expect(generatePrompt(store.getState())).not.toMatch(/simple 3D blocks/);
  });

  it('il progetto rifiuta una scena importata non valida', () => {
    const data = { objects: [mannequin], keyframes: [], blenderScene: { id: 'x' } };
    expect(() => validate({ format: 'stage-project', version: 2, data })).toThrow();
  });

  it('annulla ripristina la scena importata', async () => {
    const scene = { id: 'x', fileName: 'a.glb', glb: '', bytes: 0, offset: [0, 0, 0] as Vec3, yaw: 0 };
    setState({ blenderScene: scene });
    undo();
    expect(store.getState().blenderScene).toBeNull();
    redo();
    expect(store.getState().blenderScene).toEqual(scene);
    setState({ blenderScene: null });
    clearHistory();
  });
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

describe('preset panoramica', () => {
  it('180 e 360 gradi girano verso destra e sono descritti nel prompt', () => {
    applyPreset('pan180');
    expect(generatePrompt(store.getState())).toMatch(/stays fixed in place and pans right 180 degrees/);
    applyPreset('pan360');
    expect(generatePrompt(store.getState())).toMatch(/pans right 360 degrees/);
    const [a, b] = store.getState().keyframes;
    expect(b.camera.pos).toEqual(a.camera.pos);
  });

  it('un roll completo diventa un barrel roll nel prompt', () => {
    setState({ keyframes: [
      { id: 'a', time: 0, camera: DEFAULT_CAMERA, easing: 'linear', path: 'linear' },
      { id: 'b', time: 5, camera: { ...DEFAULT_CAMERA, roll: 360 }, easing: 'linear', path: 'linear' },
    ] });
    expect(generatePrompt(store.getState())).toMatch(/360-degree barrel roll/);
  });
});
