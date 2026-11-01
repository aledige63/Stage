import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { MANNEQUIN_ID, subjectScale, store, updateObject, setState, type AppState, type CameraState, type ObjectKind, type SceneObject, type StyleState } from '../store';
import { applyToCamera, aspectValue, crane, distance, dolly, orbit, pan, pedestal, roll, step, tilt, truck, zoom } from './cameraOps';
import { buildEnvironment, MANNEQUIN_COLORS } from './environment';
import { buildMannequin } from './mannequin';
import { held, KEYMAP } from './input';
import { samplePath } from './interpolation';
import { handheldShake, type Shake } from './handheld';
import { parseScene } from './blenderImport';
import { advance, bindTimelineShortcuts, pause } from '../timeline';
import { bindHistoryShortcuts } from '../history';

const DEG = Math.PI / 180;

export interface EngineElements {
  shotArea: HTMLElement;
  shotFrame: HTMLElement;
  shotCanvas: HTMLCanvasElement;
  dirArea: HTMLElement;
  dirCanvas: HTMLCanvasElement;
}

/** Engine attivo, usato dall'export per disegnare i fotogrammi. */
export let currentEngine: Engine | null = null;

export interface FrameRenderer {
  canvas: HTMLCanvasElement;
  render(camera: CameraState, shake?: Shake): void;
  dispose(): void;
}

function makeRenderer(canvas: HTMLCanvasElement) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  // PCFSoftShadowMap è deprecato da Three.js r186: PCFShadowMap dà lo stesso risultato
  r.shadowMap.type = THREE.PCFShadowMap;
  return r;
}

function makePrimitive(kind: Exclude<ObjectKind, 'manichino' | 'importato'>): THREE.Mesh {
  const geo = {
    cubo: () => new THREE.BoxGeometry(1, 1, 1),
    sfera: () => new THREE.SphereGeometry(0.5, 48, 24),
    cilindro: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 48),
    pannello: () => new THREE.BoxGeometry(2, 2, 0.05),
  }[kind]();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8 }));
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** Materiali originali di Blender o grigio neutro, con il tono dell'oggetto. */
function applySceneLook(node: THREE.Object3D, tone: number, look: StyleState['sceneLook']) {
  node.traverse(c => {
    const mesh = c as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.original ??= mesh.material;
    mesh.userData.gray ??= new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide });
    const gray = mesh.userData.gray as THREE.MeshStandardMaterial;
    const g = 0.15 + tone * 0.8;
    gray.color.setRGB(g, g, g, THREE.SRGBColorSpace);
    mesh.material = look === 'grigio' ? gray : mesh.userData.original;
  });
}

/** Un raggio colpisce anche ciò che è nascosto: conta solo quel che si vede. */
function isShown(o: THREE.Object3D | null) {
  for (; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/**
 * Scena 3D con due viste:
 * - vista camera: l'inquadratura finale (quella che verrà esportata)
 * - vista regia: navigazione libera, mostra la camera e permette di spostare gli oggetti
 */
export class Engine {
  private scene = new THREE.Scene();
  private shotCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 300);
  private dirCam = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
  private shotR: THREE.WebGLRenderer;
  private dirR: THREE.WebGLRenderer;
  private orbitControls: OrbitControls;
  private gizmo: TransformControls;
  private gizmoHelper: THREE.Object3D;

  // elementi visibili solo in vista regia
  private helpers = new THREE.Group();
  private proxyCam = new THREE.PerspectiveCamera();
  private camHelper: THREE.CameraHelper;
  private camBody: THREE.Mesh;
  private aimLine: THREE.Line;
  private targetMark: THREE.Mesh;
  private pathLine: THREE.Line;
  // altezza della camera da terra, in vista regia
  private heightLine: THREE.Line;
  private heightLabel: THREE.Sprite;
  private heightCanvas = document.createElement('canvas');
  private heightText = '';
  private keyMarks = new THREE.Group();

  private env: THREE.Group | null = null;
  private nodes = new Map<string, THREE.Object3D>();
  private mannMat = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  // scena importata: si sposta e ruota tutta insieme
  private blenderRoot = new THREE.Group();
  private blenderRoots: THREE.Object3D[] | null = null;
  private blenderId: string | null = null;

  private els: EngineElements;
  private abort = new AbortController();
  private resizeObserver: ResizeObserver;
  private unsubscribe: () => void;
  private raf = 0;
  private last = performance.now();
  private fast = false;
  /** durante l'export l'anteprima si ferma per lasciare la GPU all'encoder */
  suspended = false;

  constructor(els: EngineElements) {
    this.els = els;
    const s = store.getState();

    // luci
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5a5a, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 30 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    this.env = buildEnvironment(this.scene, s.style, null);
    this.mannMat.color.set(MANNEQUIN_COLORS[s.style.mann]);

    // renderer
    this.shotR = makeRenderer(els.shotCanvas);
    this.dirR = makeRenderer(els.dirCanvas);

    // vista regia
    this.dirCam.position.set(7, 6, 9);
    this.orbitControls = new OrbitControls(this.dirCam, els.dirCanvas);
    this.orbitControls.target.set(0, 0.8, 0);
    this.orbitControls.enableDamping = true;
    this.orbitControls.maxPolarAngle = Math.PI / 2 - 0.02;

    this.gizmo = new TransformControls(this.dirCam, els.dirCanvas);
    this.gizmo.setSize(0.8);
    this.gizmoHelper = this.gizmo.getHelper();
    this.scene.add(this.gizmoHelper);
    this.gizmo.addEventListener('dragging-changed', e => {
      this.orbitControls.enabled = !(e as unknown as { value: boolean }).value;
    });
    this.gizmo.addEventListener('objectChange', () => this.writeBackSelected());

    // camera disegnata in vista regia
    this.proxyCam.far = 1.2;
    this.camHelper = new THREE.CameraHelper(this.proxyCam);
    this.camHelper.setColors(
      new THREE.Color(0xf0a050), new THREE.Color(0xf0a050), new THREE.Color(0xffffff),
      new THREE.Color(0xf0a050), new THREE.Color(0x888888),
    );
    this.camBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.18, 0.2, 0.32),
      new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.5 }),
    );
    this.aimLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xf0a050, dashSize: 0.15, gapSize: 0.1 }),
    );
    this.targetMark = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.07),
      new THREE.MeshBasicMaterial({ color: 0xf0a050, wireframe: true }),
    );
    this.pathLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: 0xf0a050 }),
    );
    this.heightLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.08, gapSize: 0.06 }),
    );
    this.heightCanvas.width = 256;
    this.heightCanvas.height = 96;
    const labelTex = new THREE.CanvasTexture(this.heightCanvas);
    labelTex.colorSpace = THREE.SRGBColorSpace;
    this.heightLabel = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTex, depthTest: false, transparent: true }));
    this.heightLabel.scale.set(0.6, 0.225, 1);
    this.heightLabel.renderOrder = 10;
    this.helpers.add(this.camHelper, this.camBody, this.aimLine, this.targetMark, this.pathLine, this.keyMarks,
      this.heightLine, this.heightLabel);
    this.scene.add(this.helpers);

    this.scene.add(this.blenderRoot);
    this.syncBlender(s);
    this.syncObjects(s);
    this.rebuildPath(s);
    this.bindShotInput();
    this.bindDirectorInput();
    bindTimelineShortcuts(this.abort.signal);
    bindHistoryShortcuts(this.abort.signal);

    this.unsubscribe = store.subscribe((next, prev) => this.onStateChange(next, prev));
    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(els.shotArea);
    this.resizeObserver.observe(els.dirArea);
    this.layout();
    this.raf = requestAnimationFrame(this.tick);
    currentEngine = this;
  }

  dispose() {
    if (currentEngine === this) currentEngine = null;
    this.blenderId = null;
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.unsubscribe();
    this.resizeObserver.disconnect();
    this.gizmo.dispose();
    this.orbitControls.dispose();
    this.shotR.dispose();
    this.dirR.dispose();
    held.clear();
  }

  // -------------------------------------------------------------------------
  // Stato → scena
  // -------------------------------------------------------------------------

  private onStateChange(s: AppState, prev: AppState) {
    if (s.style !== prev.style) {
      this.env = buildEnvironment(this.scene, s.style, this.env);
      this.mannMat.color.set(MANNEQUIN_COLORS[s.style.mann]);
    }
    if (s.blenderScene !== prev.blenderScene) this.syncBlender(s);
    if (s.objects !== prev.objects || s.selectedId !== prev.selectedId || s.gizmo !== prev.gizmo || s.subjectHeight !== prev.subjectHeight || s.style !== prev.style) {
      this.syncObjects(s);
    }
    if (s.aspect !== prev.aspect) this.layout();
    if (s.keyframes !== prev.keyframes || s.selectedKey !== prev.selectedKey) this.rebuildPath(s);
  }

  /** Percorso della camera e posizioni dei keyframe, visibili in vista regia. */
  private rebuildPath(s: AppState) {
    const pts = samplePath(s.keyframes, 200).map(p => new THREE.Vector3(...p));
    this.pathLine.geometry.dispose();
    this.pathLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);

    for (const m of [...this.keyMarks.children] as THREE.Mesh[]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      this.keyMarks.remove(m);
    }
    for (const k of s.keyframes) {
      const selected = k.id === s.selectedKey;
      const m = new THREE.Mesh(
        new THREE.OctahedronGeometry(selected ? 0.09 : 0.06),
        new THREE.MeshBasicMaterial({ color: selected ? 0xffffff : 0xf0a050 }),
      );
      m.position.set(...k.camera.pos);
      this.keyMarks.add(m);
    }
  }

  private syncBlender(s: AppState) {
    const b = s.blenderScene;
    this.blenderRoot.position.set(...(b?.offset ?? [0, 0, 0]));
    this.blenderRoot.rotation.y = (b?.yaw ?? 0) * DEG;
    const id = b?.glb ? b.id : null;
    if (id === this.blenderId) return;
    this.blenderId = id;
    this.blenderRoots = null;
    if (!id) return;
    parseScene(id, b!.glb).then(parsed => {
      if (this.blenderId !== id) return;
      this.blenderRoots = parsed.roots;
      this.syncObjects(store.getState());
    }).catch(err => console.error(err));
  }

  private syncObjects(s: AppState) {
    const ids = new Set(s.objects.map(o => o.id));
    for (const [id, node] of this.nodes) {
      if (ids.has(id)) continue;
      if (this.gizmo.object === node) this.gizmo.detach();
      node.removeFromParent();
      this.nodes.delete(id);
      // gli oggetti importati restano disponibili per annulla/ripeti
      if (node.userData.imported) continue;
      const mesh = node as THREE.Mesh;
      mesh.geometry?.dispose();
      (mesh.material as THREE.Material | undefined)?.dispose();
    }

    for (const o of s.objects) {
      let node = this.nodes.get(o.id);
      if (!node) {
        if (o.kind === 'importato') {
          // il file è ancora in lettura: l'oggetto arriverà alla fine di syncBlender
          node = this.blenderRoots?.[o.source ?? -1];
          if (!node) continue;
          node.userData.imported = true;
          this.blenderRoot.add(node);
        } else {
          node = o.kind === 'manichino' ? buildMannequin(this.mannMat) : makePrimitive(o.kind);
          this.scene.add(node);
        }
        node.userData.id = o.id;
        this.nodes.set(o.id, node);
      }
      node.visible = !o.hidden;
      node.position.set(...o.pos);
      node.rotation.set(o.rot[0] * DEG, o.rot[1] * DEG, o.rot[2] * DEG);
      if (o.kind === 'manichino') {
        node.scale.setScalar(subjectScale(s));
      } else if (o.kind === 'importato') {
        node.scale.set(...o.scale);
        applySceneLook(node, o.tone, s.style.sceneLook);
      } else {
        node.scale.set(...o.scale);
        const g = 0.15 + o.tone * 0.8;
        ((node as THREE.Mesh).material as THREE.MeshStandardMaterial).color.setRGB(g, g, g, THREE.SRGBColorSpace);
      }
    }

    const selected = s.selectedId ? this.nodes.get(s.selectedId) : undefined;
    if (selected) {
      if (this.gizmo.object !== selected) this.gizmo.attach(selected);
      const isMannequin = s.selectedId === 'manichino';
      const mode = isMannequin && s.gizmo === 'scale' ? 'translate' : s.gizmo;
      this.gizmo.setMode(mode);
      // il manichino ruota solo attorno all'asse verticale
      const onlyY = isMannequin && mode === 'rotate';
      this.gizmo.showX = !onlyY;
      this.gizmo.showZ = !onlyY;
      this.gizmo.showY = true;
    } else if (this.gizmo.object) {
      this.gizmo.detach();
    }
  }

  private writeBackSelected() {
    const node = this.gizmo.object;
    if (!node) return;
    const id = node.userData.id as string;
    const patch: Partial<SceneObject> = {
      pos: [node.position.x, node.position.y, node.position.z],
      rot: [node.rotation.x / DEG, node.rotation.y / DEG, node.rotation.z / DEG],
    };
    if (id !== 'manichino') patch.scale = [node.scale.x, node.scale.y, node.scale.z];
    updateObject(id, patch);
  }

  // -------------------------------------------------------------------------
  // Input vista camera: mouse, rotella, tastiera
  // -------------------------------------------------------------------------

  private bindShotInput() {
    const area = this.els.shotArea;
    const signal = this.abort.signal;
    let drag: { button: number; x: number; y: number } | null = null;

    const cam = () => store.getState().camera;
    const setCam = (camera: AppState['camera']) => setState({ camera });

    area.addEventListener('contextmenu', e => e.preventDefault(), { signal });
    area.addEventListener('pointerdown', e => {
      area.focus();
      pause();
      area.setPointerCapture(e.pointerId);
      drag = { button: e.button, x: e.clientX, y: e.clientY };
      e.preventDefault();
    }, { signal });
    area.addEventListener('pointermove', e => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.x = e.clientX;
      drag.y = e.clientY;
      const c = cam();
      const fine = e.shiftKey ? 0.25 : 1;
      if (drag.button === 0) {
        setCam(orbit(c, -dx * 0.3 * DEG * fine, dy * 0.3 * DEG * fine));
      } else if (drag.button === 2) {
        // pan/tilt più fini a focali lunghe
        const k = (35 / c.focal) * 0.12 * DEG * fine;
        setCam(tilt(pan(c, dx * k), dy * k));
      } else if (drag.button === 1) {
        const k = distance(c) * 0.002 * fine;
        setCam(pedestal(truck(c, -dx * k), dy * k));
      }
    }, { signal });
    const endDrag = () => { drag = null; };
    area.addEventListener('pointerup', endDrag, { signal });
    area.addEventListener('pointercancel', endDrag, { signal });

    area.addEventListener('wheel', e => {
      e.preventDefault();
      pause();
      const c = cam();
      const delta = Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100);
      if (e.altKey) setCam(roll(c, delta * 0.03));
      else if (e.shiftKey) setCam(zoom(c, -delta * 0.002));
      else if (e.ctrlKey) setCam(crane(c, -delta * 0.004));
      else setCam(dolly(c, -delta * 0.0015 * Math.max(1, distance(c))));
    }, { signal, passive: false });

    area.addEventListener('keydown', e => {
      if (e.key === 'Shift') this.fast = true;
      // Ctrl/Cmd + tasto è una scorciatoia (es. Ctrl+Z annulla), non un movimento di camera
      if (e.ctrlKey || e.metaKey) return;
      const m = KEYMAP[e.code];
      if (!m) return;
      e.preventDefault();
      held.set('key:' + e.code, m);
    }, { signal });
    area.addEventListener('keyup', e => {
      if (e.key === 'Shift') this.fast = false;
      held.delete('key:' + e.code);
    }, { signal });
    area.addEventListener('blur', () => {
      this.fast = false;
      for (const k of [...held.keys()]) if (k.startsWith('key:')) held.delete(k);
    }, { signal });
  }

  // -------------------------------------------------------------------------
  // Input vista regia: selezione oggetti con click
  // -------------------------------------------------------------------------

  private bindDirectorInput() {
    const canvas = this.els.dirCanvas;
    const signal = this.abort.signal;
    const raycaster = new THREE.Raycaster();
    let down: { x: number; y: number; onGizmo: boolean } | null = null;

    canvas.addEventListener('pointerdown', e => {
      down = { x: e.clientX, y: e.clientY, onGizmo: this.gizmo.axis !== null || this.gizmo.dragging };
    }, { signal });

    canvas.addEventListener('pointerup', e => {
      if (!down || down.onGizmo || e.button !== 0) { down = null; return; }
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > 4) return;
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, this.dirCam);
      const hit = raycaster.intersectObjects([...this.nodes.values()], true).find(h => isShown(h.object));
      let obj: THREE.Object3D | null = hit?.object ?? null;
      while (obj && obj.userData.id === undefined) obj = obj.parent;
      setState({ selectedId: (obj?.userData.id as string | undefined) ?? null });
    }, { signal });
  }

  // -------------------------------------------------------------------------
  // Ciclo di rendering
  // -------------------------------------------------------------------------

  private layout() {
    const s = store.getState();
    const a = aspectValue(s.aspect);
    const { shotArea, shotFrame, dirArea } = this.els;
    const pad = 24;
    const aw = Math.max(50, shotArea.clientWidth - pad);
    const ah = Math.max(50, shotArea.clientHeight - pad);
    let w = aw;
    let h = aw / a;
    if (h > ah) { h = ah; w = ah * a; }
    w = Math.floor(w);
    h = Math.floor(h);
    shotFrame.style.width = w + 'px';
    shotFrame.style.height = h + 'px';
    this.shotR.setSize(w, h, false);

    const dw = Math.max(50, dirArea.clientWidth);
    const dh = Math.max(50, dirArea.clientHeight);
    this.dirR.setSize(dw, dh, false);
    this.dirCam.aspect = dw / dh;
    this.dirCam.updateProjectionMatrix();
  }

  /** Renderer fuori schermo alla risoluzione di export, senza aiuti visivi. */
  createFrameRenderer(width: number, height: number): FrameRenderer {
    const canvas = document.createElement('canvas');
    const r = makeRenderer(canvas);
    r.setPixelRatio(1);
    r.setSize(width, height, false);
    const cam = new THREE.PerspectiveCamera(40, width / height, 0.05, 300);
    return {
      canvas,
      render: (camera, shake) => {
        applyToCamera(cam, camera, width / height, shake);
        this.renderClean(r, cam);
      },
      dispose: () => r.dispose(),
    };
  }

  /**
   * Soggetto come appare nel video guida (forDirector=false) o in vista regia.
   * In vista regia, se il soggetto è nascosto, il manichino resta visibile in trasparenza
   * per sapere dove si trova.
   */
  private showSubject(forDirector: boolean) {
    const node = this.nodes.get(MANNEQUIN_ID);
    if (!node) return;
    const mode = store.getState().style.subject;
    const ghost = forDirector && mode === 'nessuno';
    for (const child of node.children) {
      const part = child.userData.part as string;
      child.visible = part === mode || (ghost && part === 'manichino');
    }
    this.mannMat.transparent = ghost;
    this.mannMat.opacity = ghost ? 0.25 : 1;
    this.mannMat.depthWrite = !ghost;
  }

  /** Disegna la scena senza camera, percorso, gizmo. */
  private renderClean(r: THREE.WebGLRenderer, cam: THREE.Camera) {
    this.showSubject(false);
    this.helpers.visible = false;
    this.scene.remove(this.gizmoHelper);
    r.render(this.scene, cam);
    this.helpers.visible = true;
    this.scene.add(this.gizmoHelper);
  }

  private tick = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.raf = requestAnimationFrame(this.tick);
    if (this.suspended) return;

    const playing = store.getState().playing;
    if (playing && held.size) pause();
    if (playing && !held.size) advance(dt);
    else if (held.size) {
      const s = store.getState();
      const k = dt * s.speed * (this.fast ? 3 : 1);
      let c = s.camera;
      for (const [action, sign] of held.values()) c = step(c, action, sign * k);
      setState({ camera: c });
    }

    this.render();
  };

  private updateHelpers() {
    const c = store.getState().camera;
    this.proxyCam.position.copy(this.shotCam.position);
    this.proxyCam.quaternion.copy(this.shotCam.quaternion);
    this.proxyCam.fov = this.shotCam.fov;
    this.proxyCam.aspect = this.shotCam.aspect;
    this.proxyCam.updateProjectionMatrix();
    this.proxyCam.updateMatrixWorld();
    this.camHelper.update();

    this.camBody.position.copy(this.shotCam.position);
    this.camBody.quaternion.copy(this.shotCam.quaternion);
    this.camBody.translateZ(0.18);

    this.targetMark.position.set(...c.target);
    const line = this.aimLine.geometry.attributes.position as THREE.BufferAttribute;
    line.setXYZ(0, c.pos[0], c.pos[1], c.pos[2]);
    line.setXYZ(1, c.target[0], c.target[1], c.target[2]);
    line.needsUpdate = true;
    this.aimLine.computeLineDistances();

    // linea verticale dalla camera al pavimento con la misura
    const p = this.shotCam.position;
    const hl = this.heightLine.geometry.attributes.position as THREE.BufferAttribute;
    hl.setXYZ(0, p.x, p.y, p.z);
    hl.setXYZ(1, p.x, 0.005, p.z);
    hl.needsUpdate = true;
    this.heightLine.computeLineDistances();
    this.heightLabel.position.set(p.x, Math.max(0.15, p.y / 2), p.z);
    const text = p.y.toFixed(2) + ' m';
    if (text !== this.heightText) {
      this.heightText = text;
      const ctx = this.heightCanvas.getContext('2d')!;
      ctx.clearRect(0, 0, 256, 96);
      ctx.fillStyle = 'rgba(22, 24, 28, 0.85)';
      ctx.beginPath();
      ctx.roundRect(8, 14, 240, 68, 14);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 128, 50);
      (this.heightLabel.material.map as THREE.Texture).needsUpdate = true;
    }
  }

  private render() {
    const s = store.getState();
    applyToCamera(this.shotCam, s.camera, aspectValue(s.aspect), handheldShake(s.handheld, s.time));
    this.updateHelpers();

    // vista camera: niente aiuti visivi
    this.renderClean(this.shotR, this.shotCam);

    this.orbitControls.update();
    this.showSubject(true);
    this.dirR.render(this.scene, this.dirCam);
  }
}
