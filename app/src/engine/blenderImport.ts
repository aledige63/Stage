import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { setState, store, subjectHeight, subjectObject, type CameraState, type SceneObject, type Vec3 } from '../store';
import { FILM_GAUGE, FOCAL_MAX, FOCAL_MIN, MIN_HEIGHT } from './cameraOps';
import { t } from '../i18n';

// Import di scene da Blender (GLB / glTF). Il file resta intero nel progetto; a ogni apertura
// viene riletto e i suoi oggetti di primo livello diventano oggetti di Stage.

export const SUBJECT_NODE = 'Stage_Subject';
export const CAMERA_NODE = 'Stage_Camera';
const MAX_BYTES = 100 * 1024 * 1024;
const DEG = Math.PI / 180;

export interface SubjectPlacement {
  /** punto a terra del soggetto */
  pos: Vec3;
  /** gradi: direzione in cui guarda */
  yaw: number;
}

export interface ParsedScene {
  roots: THREE.Object3D[];
  subject: SubjectPlacement | null;
  camera: THREE.PerspectiveCamera | null;
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

const hasMesh = (o: THREE.Object3D) => {
  let found = false;
  o.traverse(c => { if ((c as THREE.Mesh).isMesh) found = true; });
  return found;
};

/** Posizione e orientamento da Stage_Subject: una mesh conta per il suo ingombro, a terra. */
function subjectPlacement(node: THREE.Object3D): SubjectPlacement {
  node.updateWorldMatrix(true, true);
  const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(node.getWorldQuaternion(new THREE.Quaternion()));
  const yaw = Math.atan2(facing.x, facing.z) / DEG;
  if (!hasMesh(node)) {
    const p = node.getWorldPosition(new THREE.Vector3());
    return { pos: [p.x, p.y, p.z], yaw };
  }
  const box = new THREE.Box3().setFromObject(node);
  const c = box.getCenter(new THREE.Vector3());
  return { pos: [c.x, box.min.y, c.z], yaw };
}

/** Separa gli oggetti della scena dai segnaposto con i nomi convenzionali. */
export function analyzeScene(root: THREE.Object3D): ParsedScene {
  root.updateMatrixWorld(true);
  const subjectNode = root.getObjectByName(SUBJECT_NODE) ?? null;
  const subject = subjectNode ? subjectPlacement(subjectNode) : null;

  const named = root.getObjectByName(CAMERA_NODE);
  let camera: THREE.PerspectiveCamera | null = null;
  named?.traverse(c => { if (!camera && (c as THREE.PerspectiveCamera).isPerspectiveCamera) camera = c as THREE.PerspectiveCamera; });

  subjectNode?.removeFromParent();
  // le altre camere e gli oggetti vuoti non si vedono: restano solo quelli con una mesh
  return { roots: root.children.filter(hasMesh), subject, camera };
}

const cache = new Map<string, Promise<ParsedScene>>();

/** Legge il file una sola volta per ogni import: annulla/ripeti ritrovano gli stessi oggetti. */
export function parseScene(id: string, glb: string): Promise<ParsedScene> {
  let parsed = cache.get(id);
  if (!parsed) {
    const bytes = fromBase64(glb);
    parsed = new GLTFLoader()
      .parseAsync(bytes.buffer as ArrayBuffer, '')
      .then(gltf => analyzeScene(gltf.scene));
    parsed.catch(() => cache.delete(id));
    cache.set(id, parsed);
  }
  return parsed;
}

/**
 * Inquadratura da una camera di Blender: il sensore di 36 mm sta sul lato lungo, come in Stage.
 * Il target serve da perno per le orbite: va alla distanza del punto indicato, lungo la vista.
 */
export function cameraFromNode(node: THREE.PerspectiveCamera, lookPoint: Vec3): CameraState {
  node.updateWorldMatrix(true, false);
  const pos = node.getWorldPosition(new THREE.Vector3());
  const quat = node.getWorldQuaternion(new THREE.Quaternion());
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
  const dist = Math.max(1, new THREE.Vector3(...lookPoint).sub(pos).dot(forward));
  const target = pos.clone().addScaledVector(forward, dist);

  // differenza tra la camera in bolla e quella reale: è il roll
  const level = new THREE.PerspectiveCamera();
  level.position.copy(pos);
  level.lookAt(target);
  const rel = level.quaternion.invert().multiply(quat);
  const roll = (-2 * Math.atan2(rel.z, rel.w)) / DEG;

  const longSideTan = Math.tan((node.fov * DEG) / 2) * Math.max(node.aspect, 1);
  const focal = FILM_GAUGE / 2 / longSideTan;
  return {
    pos: [pos.x, Math.max(MIN_HEIGHT, pos.y), pos.z],
    target: [target.x, target.y, target.z],
    roll: ((roll + 540) % 360) - 180,
    focal: THREE.MathUtils.clamp(focal, FOCAL_MIN, FOCAL_MAX),
  };
}

export interface ImportResult {
  objects: number;
  subject: boolean;
  camera: boolean;
}

/**
 * Primo import: applica anche Stage_Subject e Stage_Camera (la camera solo senza keyframe).
 * Reimportazione: sostituisce gli oggetti, mantenendo soggetto, camera e keyframe.
 */
export async function importBlenderFile(file: File): Promise<ImportResult> {
  if (file.size > MAX_BYTES) throw new Error(t('blender.tooBig'));
  const glb = toBase64(new Uint8Array(await file.arrayBuffer()));
  const id = crypto.randomUUID();
  let parsed: ParsedScene;
  try {
    parsed = await parseScene(id, glb);
  } catch {
    throw new Error(t('blender.badFile'));
  }
  if (!parsed.roots.length) throw new Error(t('blender.empty'));

  const s = store.getState();
  const first = !s.blenderScene;
  const hidden = new Set(s.objects.filter(o => o.kind === 'importato' && o.hidden).map(o => o.name));
  const imported: SceneObject[] = parsed.roots.map((node, source) => ({
    id: `blender-${id.slice(0, 8)}-${source}`,
    kind: 'importato',
    name: node.name || `Blender ${source + 1}`,
    pos: [node.position.x, node.position.y, node.position.z],
    rot: [node.rotation.x / DEG, node.rotation.y / DEG, node.rotation.z / DEG],
    scale: [node.scale.x, node.scale.y, node.scale.z],
    tone: 0.55,
    source,
    hidden: hidden.has(node.name) || undefined,
  }));

  // Stage_Subject posiziona il soggetto principale, se c'è e non ha una sua timeline
  const subject = subjectObject(s);
  const applySubject = first && parsed.subject !== null && subject !== null && !subject.keys?.length;
  const kept = s.objects.filter(o => o.kind !== 'importato').map(o =>
    applySubject && o.id === subject!.id ? { ...o, pos: parsed.subject!.pos, rot: [0, parsed.subject!.yaw, 0] as Vec3 } : o);
  const look = (applySubject ? parsed.subject!.pos : subject?.pos) ?? [0, 0, 0];
  const applyCamera = first && parsed.camera !== null && s.keyframes.length === 0;

  setState({
    blenderScene: {
      id,
      fileName: file.name,
      glb,
      bytes: file.size,
      offset: s.blenderScene?.offset ?? [0, 0, 0],
      yaw: s.blenderScene?.yaw ?? 0,
    },
    objects: [...kept, ...imported],
    selectedId: null,
    ...(applyCamera ? {
      camera: cameraFromNode(parsed.camera!, [look[0], look[1] + subjectHeight(s) * 0.6, look[2]]),
      dirty: false,
    } : {}),
  });
  return { objects: imported.length, subject: applySubject, camera: applyCamera };
}

export function removeBlenderScene() {
  setState(s => ({
    blenderScene: null,
    objects: s.objects.filter(o => o.kind !== 'importato'),
    selectedId: null,
  }));
}
