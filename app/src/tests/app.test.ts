import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { CAMERA_SEL, DEFAULT_CAMERA, DEFAULT_STYLE, MANNEQUIN_ID, setState, store, type Vec3 } from '../store';
import { analyzeScene, CAMERA_NODE, cameraFromNode, fromBase64, SUBJECT_NODE, toBase64 } from '../engine/blenderImport';
import { applyToCamera, cameraQuaternion, moveCameraTo, rollCameraTo, rotateCameraTo } from '../engine/cameraOps';
import { addObject } from '../store';
import { applyPreset, clearKeyframes, duplicateKeyframe, duplicateObjectKey, moveObject, refreshKeyframe, refreshObjectKey, seek, setKeyframe, setLock, setObjectKey } from '../timeline';
import { cameraAt, evaluatePose, objectAt } from '../engine/subjectMotion';
import { COMPILER_LIMIT, generateCompilerPrompt, generatePrompt, generateRef2vaPrompt } from '../export/prompt';
import { validate } from '../project';
import { clearHistory, redo, undo } from '../history';

const mannequin = { id: MANNEQUIN_ID, kind: 'manichino' as const, name: 'Manichino', pos: [0, 0, 0] as Vec3, rot: [0, 0, 0] as Vec3, scale: [1, 1, 1] as Vec3, tone: 0.6, color: 'grigio' as const };

beforeEach(() => {
  setState({
    keyframes: [], pendingPoses: {}, selectedObjKey: null, objects: [mannequin], subjectId: MANNEQUIN_ID, camera: DEFAULT_CAMERA, style: DEFAULT_STYLE,
    lock: { enabled: false, offset: [0, 1.3, 0] }, duration: 5, time: 0, playing: false, selectedKey: null, selectedId: null,
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

describe('soggetto in movimento', () => {
  const walk = (id = MANNEQUIN_ID) => {
    seek(0);
    setObjectKey(id);
    seek(4);
    moveObject(id, { pos: [0, 0, 3] });
    setObjectKey(id);
  };
  const obj = (id: string) => store.getState().objects.find(o => o.id === id)!;

  it('salva i keyframe e interpola la posa con la curva', () => {
    walk();
    const keys = obj(MANNEQUIN_ID).keys!;
    expect(keys.map(k => k.time)).toEqual([0, 4]);
    expect(evaluatePose(keys, 2).pos[2]).toBeCloseTo(1.5);
    expect(evaluatePose(keys, 1).pos[2]).toBeLessThan(0.75);
  });

  it('senza keyframe lo spostamento cambia la posizione fissa', () => {
    moveObject(MANNEQUIN_ID, { pos: [1, 0, 2], rot: [0, 45, 0] });
    expect(obj(MANNEQUIN_ID).pos).toEqual([1, 0, 2]);
    expect(obj(MANNEQUIN_ID).rot[1]).toBe(45);
    expect(store.getState().pendingPoses).toEqual({});
  });

  it('ogni oggetto ha la sua timeline e il suo colore nel prompt', () => {
    addObject('cubo');
    const cube = store.getState().selectedId!;
    store.setState({ objects: store.getState().objects.map(o => (o.id === cube ? { ...o, color: 'rosso', pos: [0, 0.5, 0] } : o)) });
    seek(0);
    setObjectKey(cube);
    seek(5);
    moveObject(cube, { pos: [2, 0.5, 0] });
    setObjectKey(cube);
    expect(objectAt(obj(cube), 5).pos[0]).toBeCloseTo(2);
    expect(obj(MANNEQUIN_ID).keys).toBeUndefined();
    expect(generatePrompt(store.getState())).toMatch(/the red cube moves 2\.0 m to the right of the frame/);
  });

  it('svuota lascia gli oggetti dove si trovano', () => {
    walk();
    seek(4);
    clearKeyframes();
    expect(obj(MANNEQUIN_ID).keys).toBeUndefined();
    expect(obj(MANNEQUIN_ID).pos[2]).toBeCloseTo(3);
  });

  it('il target si aggancia a qualsiasi oggetto e il nome scelto va nel prompt', () => {
    addObject('cubo');
    const cube = store.getState().selectedId!;
    store.setState({ objects: store.getState().objects.map(o => (o.id === cube ? { ...o, label: 'the car', pos: [0, 0.5, 0] } : o)) });
    seek(0);
    setObjectKey(cube);
    seek(4);
    moveObject(cube, { pos: [3, 0.5, 0] });
    setObjectKey(cube);
    setLock({ enabled: true, targetId: cube, offset: [0, 0, 0] });
    expect(cameraAt(store.getState(), 4).target).toEqual([3, 0.5, 0]);
    const p = generatePrompt(store.getState());
    expect(p).toMatch(/the car moves 3\.0 m to the right of the frame/);
    expect(p).toMatch(/stays aimed at the car, following its movement/);
    expect(p).toMatch(/The camera body stays in place/);
  });

  it('una scena senza manichino né soggetto funziona', () => {
    setState({ objects: [], subjectId: null });
    applyPreset('orbita90');
    const p = generatePrompt(store.getState());
    expect(p).toMatch(/the floor grid is only a motion guide/);
    expect(p).toMatch(/orbits 90 degrees around the center of the scene/);
    expect(p).not.toMatch(/mannequin/);
  });

  it('il target agganciato segue il soggetto, solo se attivo', () => {
    walk();
    const s = store.getState();
    expect(cameraAt(s, 4).target).toEqual(DEFAULT_CAMERA.target);
    setLock({ enabled: true });
    const t = cameraAt(store.getState(), 4).target;
    expect(t[1]).toBeCloseTo(1.3);
    expect(t[2]).toBeCloseTo(3);
  });

  it('il prompt descrive il soggetto e l\'aggancio', () => {
    walk();
    setLock({ enabled: true, offset: [0, 1.65, 0] });
    const p = generatePrompt(store.getState());
    expect(p).toMatch(/From 0\.0s to 4\.0s the subject moves 3\.0 m toward the camera/);
    expect(p).toMatch(/stays aimed at the subject's head, following its movement/);
    expect(p).toMatch(/The camera body stays in place/);
  });

  it('una rotazione del soggetto non diventa un\'orbita della camera', () => {
    seek(0);
    setObjectKey(MANNEQUIN_ID);
    seek(5);
    moveObject(MANNEQUIN_ID, { rot: [0, 90, 0] });
    setObjectKey(MANNEQUIN_ID);
    applyPreset('push');
    const p = generatePrompt(store.getState());
    expect(p).toMatch(/the subject turns 90 degrees to its left/);
    expect(p).not.toMatch(/orbits/);
  });
});

describe('prompt per Ref2VA', () => {
  it('usa i segnaposto e la durata nei tre pezzi', () => {
    setState({ duration: 8 });
    applyPreset('orbita180');
    const p = generateRef2vaPrompt(store.getState());
    expect(p).toMatch(/^subject_definitions:\n<Video 1> is the declared motion guide, used as the camera-movement guide \(8s\)\./);
    expect(p).toMatch(/retention_analysis:\n<Video 1> \(camera-movement guide\): fully_preserved/);
    expect(p).toMatch(/detailed_description:\nUse only the camera movement from <Video 1>; the mannequin/);
    expect(p).toMatch(/of <Subject 1>, profile view from <Subject 1>'s right/);
    expect(p).toMatch(/around <Subject 1>, moving to/);
    expect(p).not.toMatch(/the subject|reference video;/);
  });

  it('toglie le precisazioni superflue, che restano nel prompt originale', () => {
    setState({ keyframes: [], camera: { ...DEFAULT_CAMERA, pos: [0, 2.5, 6] } });
    applyPreset('push');
    const s = store.getState();
    expect(generateRef2vaPrompt(s)).not.toMatch(/physical push-in|staying aimed/);
    expect(generatePrompt(s)).toMatch(/physical push-in/);
  });

  it('accetta segnaposto personalizzati', () => {
    applyPreset('orbita90');
    const p = generateRef2vaPrompt(store.getState(), { subject: 'Anna', video: '<Video 2>' });
    expect(p).toMatch(/from <Video 2>;/);
    expect(p).toMatch(/around Anna/);
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
    setState({ objects: [{ ...mannequin, height: 1.2 }] });
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

  it('converte i progetti precedenti: colore, altezza e keyframe del manichino', async () => {
    const { openProject } = await import('../project');
    const old = {
      format: 'stage-project', version: 2, savedAt: '', data: {
        objects: [{ ...mannequin, color: undefined }], keyframes: [], subjectHeight: 1.6, style: { ...DEFAULT_STYLE, mann: 'arancio' },
        subjectKeys: [{ id: 's1', time: 0, pos: [0, 0, 0], yaw: 0, easing: 'linear' }, { id: 's2', time: 2, pos: [1, 0, 0], yaw: 30, easing: 'linear' }],
      },
    };
    await openProject(new File([JSON.stringify(old)], 'old.stage.json'));
    const m = store.getState().objects[0];
    expect(m.color).toBe('arancio');
    expect(m.height).toBe(1.6);
    expect(m.keys?.[1].rot[1]).toBe(30);
    expect(store.getState().subjectId).toBe(MANNEQUIN_ID);
  });

  it('accetta un progetto valido', () => {
    expect(() => validate(good())).not.toThrow();
  });

  it('rifiuta file estranei, versioni future e dati rotti', () => {
    expect(() => validate({ ciao: 1 })).toThrow();
    expect(() => validate({ ...good(), version: 99 })).toThrow();
    const noObjects = good() as { data: { objects?: unknown } };
    delete noObjects.data.objects;
    expect(() => validate(noObjects)).toThrow();
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
    setState({ duration: 6 });
    setState({ duration: 7 });
    setState({ duration: 8 });
    undo();
    expect(store.getState().duration).toBe(5);
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

describe('menu dei keyframe', () => {
  const cam = (x: number) => ({ ...DEFAULT_CAMERA, pos: [x, 1.6, 5] as Vec3 });

  it('duplica un keyframe della camera alla testina e sostituisce quello che c\'è', () => {
    setState({ camera: cam(0) }); setKeyframe();
    seek(2); setState({ camera: cam(3) }); setKeyframe();
    const [a, b] = store.getState().keyframes;
    seek(2);
    expect(duplicateKeyframe(a.id)).not.toBeNull();
    const ks = store.getState().keyframes;
    expect(ks).toHaveLength(2);
    expect(ks[1].time).toBe(2);
    expect(ks[1].camera.pos[0]).toBe(0);
    expect(ks.some(k => k.id === b.id)).toBe(false);
    // sul keyframe stesso non fa niente
    seek(0);
    expect(duplicateKeyframe(a.id)).toBeNull();
  });

  it('duplica un keyframe di un oggetto', () => {
    setState({ selectedId: MANNEQUIN_ID }); setObjectKey();
    seek(1); moveObject(MANNEQUIN_ID, { pos: [2, 0, 0] }); setObjectKey();
    const first = store.getState().objects[0].keys![0];
    seek(3);
    duplicateObjectKey(MANNEQUIN_ID, first.id);
    const keys = store.getState().objects[0].keys!;
    expect(keys.map(k => k.time)).toEqual([0, 1, 3]);
    expect(keys[2].pos).toEqual([0, 0, 0]);
  });

  it('aggiorna un keyframe con la camera modificata dopo averlo selezionato', () => {
    setState({ camera: cam(0) }); setKeyframe();
    seek(2); setState({ camera: cam(3) }); setKeyframe();
    const id = store.getState().keyframes[1].id;
    setState({ camera: cam(5) });
    refreshKeyframe(id);
    const s = store.getState();
    expect(s.keyframes[1].camera.pos[0]).toBe(5);
    expect(s.dirty).toBe(false);
  });

  it('aggiorna un keyframe di oggetto con la posa spostata a mano', () => {
    setState({ selectedId: MANNEQUIN_ID }); setObjectKey();
    seek(1); moveObject(MANNEQUIN_ID, { pos: [2, 0, 0] }); setObjectKey();
    const id = store.getState().objects[0].keys![1].id;
    moveObject(MANNEQUIN_ID, { pos: [4, 0, 1] });
    refreshObjectKey(MANNEQUIN_ID, id);
    const s = store.getState();
    expect(s.objects[0].keys![1].pos).toEqual([4, 0, 1]);
    expect(s.pendingPoses[MANNEQUIN_ID]).toBeUndefined();
  });
});

describe('camera trascinata in vista regia', () => {
  const c0 = { ...DEFAULT_CAMERA, pos: [0, 1.6, 5] as Vec3, target: [0, 1.6, 0] as Vec3, roll: 0 };

  it('spostandola trasla anche il target e non scende sotto il pavimento', () => {
    const c = moveCameraTo(c0, [2, 1.6, 5]);
    expect(c.target).toEqual([2, 1.6, 0]);
    expect(moveCameraTo(c0, [0, -1, 5]).pos[1]).toBeGreaterThan(0);
  });

  it('l\'orientamento della camera è quello usato per il rendering', () => {
    const c = { ...c0, roll: 20 };
    const cam = new THREE.PerspectiveCamera();
    applyToCamera(cam, c, 1.5);
    expect(cameraQuaternion(c).angleTo(cam.quaternion)).toBeLessThan(1e-6);
  });

  it('ruotarla sul proprio asse fa panoramica e roll mantenendo la distanza', () => {
    const q = cameraQuaternion(c0);
    // panoramica di 90° a sinistra attorno all'asse verticale della camera
    const panned = rotateCameraTo(c0, q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)));
    expect(panned.target[0]).toBeCloseTo(-5);
    expect(panned.target[2]).toBeCloseTo(5);
    expect(panned.roll).toBeCloseTo(0);
    // roll di 30°
    const rolled = rotateCameraTo(c0, cameraQuaternion({ ...c0, roll: 30 }));
    expect(rolled.roll).toBeCloseTo(30);
    expect(rolled.target[2]).toBeCloseTo(0);
    // vicino al roll di partenza, senza salti di 360°
    expect(rollCameraTo({ ...c0, roll: 350 }, cameraQuaternion({ ...c0, roll: 355 })).roll).toBeCloseTo(355);
  });

  it('la selezione della camera sopravvive ad annulla', () => {
    setState({ selectedId: CAMERA_SEL });
    setState({ duration: 6 });
    undo();
    expect(store.getState().selectedId).toBe(CAMERA_SEL);
  });
});

describe('soggetto che entra in campo (test H3 dell\'utente)', () => {
  // camera ferma fino a 2,2 s che guarda dritto davanti a sé; il soggetto arriva da destra
  const cam = (x: number, z: number) => ({ pos: [x, 1.7, z] as Vec3, target: [x, 1.65, 0] as Vec3, roll: 0, focal: 50 });
  const setup = () => setState({
    duration: 8,
    keyframes: [
      { id: 'a', time: 2.1666, camera: cam(1.55, 0.67), easing: 'inout', path: 'arc' },
      { id: 'b', time: 6, camera: { ...cam(-0.36, 3), pos: [-0.36, 1.9, 3] as Vec3, target: [-0.36, 1.645, 0] as Vec3 }, easing: 'inout', path: 'arc' },
    ],
    camera: cam(1.55, 0.67),
    objects: [{
      ...mannequin, color: 'rosso', height: 1.65, label: 'Anna', pos: [4.5, 0, -6.05], rot: [0, -54, 0],
      keys: [
        { id: 'o1', time: 0, pos: [4.5, 0, -6.05], rot: [0, -54, 0], scale: [1, 1, 1], easing: 'linear' },
        { id: 'o2', time: 3, pos: [1.94, 0, -3.61], rot: [0, -47, 0], scale: [1, 1, 1], easing: 'linear' },
        { id: 'o3', time: 6, pos: [-0.14, 0, -2.54], rot: [0, -94, 0], scale: [1, 1, 1], easing: 'inout' },
      ],
    }],
  });

  it('l\'apertura inquadra la scena e dice che il soggetto non c\'è ancora', () => {
    setup();
    const p = generatePrompt(store.getState());
    expect(p).toContain('Opening frame: static view of the scene, eye level, 50mm lens; the subject is not in frame yet.');
    expect(p).not.toMatch(/Opening frame: close-up/);
    expect(p).toContain('From 0.0s to 2.2s the camera holds still.');
    expect(p).toMatch(/At \d\.\ds the subject enters the frame from the right\./);
  });

  it('le frasi sono in ordine di tempo', () => {
    setup();
    const times = generateRef2vaPrompt(store.getState()).split('\n')
      .map(l => /^(?:From|At) (\d+\.\d)s/.exec(l)?.[1]).filter(Boolean).map(Number);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('la grandezza dell\'inquadratura dipende dalla distanza del soggetto, non del punto mirato', () => {
    setup();
    // a fine movimento Anna è a circa 5,5 m: quasi intera (piedi fuori dal bordo), non primo piano
    expect(generatePrompt(store.getState())).toMatch(/Final frame: medium full shot with the lower legs and feet extending beyond the bottom edge/);
  });

  it('versione per il Compiler: corpo narrativo senza sezioni né segnaposto', () => {
    setup();
    // un blocco di scena fermo, come l'"Auto" del test
    const st = store.getState();
    setState({ objects: [...st.objects, { ...st.objects[0], id: 'auto', kind: 'cubo', keys: undefined, label: 'Auto', pos: [-2, 0.6, -2.8] }] });
    const p = generateCompilerPrompt(store.getState());
    expect(p).toMatch(/^Use the reference video as a combined guide for camera movement and the movement of the mapped character\./);
    expect(p).toContain("The red mannequin represents its assigned character's movement, position and orientation.");
    expect(p).toContain('Render the assigned character, not the mannequin shape.');
    expect(p).toContain('An 8-second continuous shot in horizontal 16:9 framing, with no cuts.');
    expect(p).toContain('Opening: a static eye-level view with a 50mm lens. The mapped character is initially outside the frame.');
    expect(p).toMatch(/At approximately 0\.\ds, the character begins entering the frame from the right\./);
    expect(p).toContain('From 3.0s to 6.0s, the character continues along the reference trajectory, approaching the camera, and gradually turns approximately 47 degrees to its own right. Preserve its changing screen position and distance from the camera as shown in the reference.');
    // a camera ferma la direzione resta
    expect(p).toContain('approaching the camera while crossing the scene from right toward left');
    expect(p).toContain("Exclude the floor grid and the simple 3D blocks and do not transfer the reference video's audio.");
    expect(p).toContain('From 6.0s to 8.0s, both the camera and the character remain stationary.');
    expect(p).toMatch(/Final composition: .*facing the left of the frame/);
    expect(p).not.toMatch(/<Subject|<Video|subject_definitions|detailed_description|Anna/);
  });

  it('versione per il Compiler: un blocco segnato come soggetto (l’auto che arriva e si ferma)', () => {
    setup();
    const st = store.getState();
    const box = { pos: [-2, 0.6, -7.86] as Vec3, rot: [0, 0, 0] as Vec3, scale: [2.37, 0.93, 3.88] as Vec3 };
    setState({ objects: [...st.objects, { ...st.objects[0], ...box, id: 'auto', kind: 'cubo', color: 'bianco', label: 'Auto', mapped: true, height: undefined,
      keys: [
        { id: 'c1', time: 0, ...box, easing: 'inout' },
        { id: 'c2', time: 4.4167, ...box, pos: [-2, 0.6, -3.09] as Vec3, easing: 'inout' },
      ] }] });
    const p = generateCompilerPrompt(store.getState());
    expect(p).toContain('combined guide for camera movement and the movement of the mapped subjects');
    expect(p).toContain("The red mannequin and white box represent their assigned subjects' movement, position and orientation.");
    expect(p).toContain('Render the assigned subjects, not the mannequin or box shapes.');
    expect(p).toContain('Exclude the floor grid and do not transfer');
    expect(p).not.toMatch(/simple 3D blocks|Auto/);
    expect(p).toMatch(/From 0\.0s to 4\.4s, the subject mapped to the white box follows the reference trajectory, approaching the camera/);
    // ferma nella scena mentre la camera si muove ancora
    expect(p).toContain('From 4.4s onward, the subject mapped to the white box remains stationary in the scene while the camera continues moving until 6.0s.');
    expect(p).toContain('From 6.0s to 8.0s, the camera and the character remain stationary.');
    expect(p).toContain('profile view from its left');
    // a sinistra, non al centro (come nella clip)
    expect(p).toContain('The subject mapped to the white box remains partly visible on the left, to the left of the character, matching the reference.');
    expect(p.length).toBeLessThanOrEqual(COMPILER_LIMIT);
  });

  it('versione per il Compiler senza figure in movimento: solo camera', () => {
    setup();
    setState({ objects: store.getState().objects.map(o => ({ ...o, keys: undefined })) });
    const p = generateCompilerPrompt(store.getState());
    expect(p).toMatch(/combined guide for camera movement and the mapped character\. Follow its timing and evolving framing, and the character’s position and orientation\./);
    expect(p).not.toMatch(/Transfer the character/);
  });
});
