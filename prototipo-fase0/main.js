import * as THREE from 'three';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

const V3 = THREE.Vector3;
const lerp = THREE.MathUtils.lerp;

// ---------------------------------------------------------------------------
// Stato
// ---------------------------------------------------------------------------

const state = {
  preset: 'orbita',
  easing: 'inout',
  duration: 5,
  aspect: '16:9',
  res: 720,
  fps: 24,
  grid: 'marcata',
  bg: 'chiaro',
  mann: 'grigio',
  refs: true,
  thirds: false,
};

// ---------------------------------------------------------------------------
// Curve di easing
// ---------------------------------------------------------------------------

const EASING = {
  linear: t => t,
  in: t => t * t * t,
  out: t => 1 - Math.pow(1 - t, 3),
  inout: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

const EASING_TEXT = {
  linear: 'Constant speed, perfectly linear motion with no acceleration.',
  in: 'The movement starts slowly and accelerates progressively (ease-in).',
  out: 'The movement starts at speed and decelerates to a soft stop (ease-out).',
  inout: 'Smooth ease-in and ease-out: gentle start, steady middle, soft stop.',
};

// ---------------------------------------------------------------------------
// Movimenti predefiniti: e = progresso già filtrato dall'easing (0..1)
// Il soggetto è all'origine e guarda verso +Z (la camera "frontale" è su +Z).
// ---------------------------------------------------------------------------

const PRESETS = {
  orbita: {
    camera(e) {
      const a = lerp(-Math.PI / 2, Math.PI / 2, e);
      return { pos: new V3(Math.sin(a) * 4, 1.5, Math.cos(a) * 4), target: new V3(0, 1.1, 0), focal: 35 };
    },
    prompt: 'The camera performs a smooth 180-degree orbit around the subject, travelling from the subject\'s left side, through the front, to the right side, at constant distance and eye-level height, always keeping the subject centered. 35mm lens.',
  },
  push: {
    camera(e) {
      return {
        pos: new V3(0, lerp(1.55, 1.6, e), lerp(6, 1.6, e)),
        target: new V3(0, lerp(1.0, 1.55, e), 0),
        focal: 35,
      };
    },
    prompt: 'Dolly push-in: the camera physically travels forward toward the subject at eye level, from a full-body wide shot to a close-up of the face. 35mm lens, no zoom.',
  },
  crane: {
    camera(e) {
      return { pos: new V3(0, lerp(0.5, 4.5, e), lerp(4, 5, e)), target: new V3(0, 1.0, 0), focal: 28 };
    },
    prompt: 'Crane up shot: the camera rises from a low angle near the ground to a high angle looking down at the subject, pulling slightly back, keeping the subject centered. 28mm lens.',
  },
  zoom: {
    camera(e) {
      // Zoom percettivamente uniforme: interpolazione logaritmica della focale
      return { pos: new V3(0, 1.5, 6), target: new V3(0, 1.5, 0), focal: 24 * Math.pow(85 / 24, e) };
    },
    prompt: 'Static locked-off camera at eye level with an optical zoom-in from 24mm wide angle to 85mm telephoto, going from a full-body shot to a chest-up medium close-up. The camera does not move, only the focal length changes.',
  },
};

function cameraAt(progress) {
  return PRESETS[state.preset].camera(EASING[state.easing](progress));
}

function applyCamera(cam, progress, aspect) {
  const { pos, target, focal } = cameraAt(progress);
  cam.aspect = aspect;
  cam.position.copy(pos);
  cam.lookAt(target);
  cam.setFocalLength(focal);
}

function makeCamera() {
  const cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 200);
  cam.filmGauge = 36; // full frame: le focali corrispondono a quelle reali
  return cam;
}

// ---------------------------------------------------------------------------
// Scena
// ---------------------------------------------------------------------------

const STYLE = {
  bg: {
    chiaro: { sky: 0xd8d8d8, ground: 0xc4c4c4, major: 0x4a4a4a, minor: 0x8c8c8c, check: 0xa8a8a8 },
    medio: { sky: 0x8a8a8a, ground: 0x767676, major: 0x2a2a2a, minor: 0x555555, check: 0x5e5e5e },
    scuro: { sky: 0x262626, ground: 0x2e2e2e, major: 0xb0b0b0, minor: 0x5c5c5c, check: 0x444444 },
  },
  mann: { grigio: 0xa8a8a8, bianco: 0xf2f2f2, arancio: 0xe07b39 },
};

const scene = new THREE.Scene();

scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5a5a, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(4, 8, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 30 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const mannMat = new THREE.MeshStandardMaterial({ color: STYLE.mann.grigio, roughness: 0.6 });
const mannequin = buildMannequin(mannMat);
scene.add(mannequin);

let env = null;

function buildMannequin(mat) {
  const g = new THREE.Group();
  const add = (geo, x, y, z, opts = {}) => {
    const m = new THREE.Mesh(geo, opts.mat || mat);
    m.position.set(x, y, z);
    if (opts.rz) m.rotation.z = opts.rz;
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.scale) m.scale.set(...opts.scale);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 6, 16);

  // testa con "visiera" per leggere la direzione dello sguardo
  add(new THREE.SphereGeometry(0.11, 32, 16), 0, 1.66, 0, { scale: [0.9, 1.1, 1] });
  add(new THREE.BoxGeometry(0.13, 0.04, 0.05), 0, 1.68, 0.09, { mat: new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4 }) });
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 16), 0, 1.52, 0);
  // busto e bacino
  add(cap(0.16, 0.28), 0, 1.27, 0, { scale: [1.15, 1, 0.7] });
  add(cap(0.14, 0.08), 0, 0.98, 0, { scale: [1.1, 1, 0.75] });
  // gambe
  for (const s of [-1, 1]) {
    add(cap(0.07, 0.36), s * 0.1, 0.71, 0);
    add(cap(0.055, 0.34), s * 0.1, 0.3, 0);
    add(new THREE.BoxGeometry(0.1, 0.06, 0.24), s * 0.1, 0.03, 0.05);
  }
  // braccia
  for (const s of [-1, 1]) {
    add(cap(0.05, 0.24), s * 0.26, 1.28, 0, { rz: s * 0.12 });
    add(cap(0.042, 0.22), s * 0.29, 0.99, 0.02, { rz: s * 0.05 });
    add(new THREE.SphereGeometry(0.045, 16, 12), s * 0.3, 0.83, 0.02, { scale: [0.8, 1.2, 1] });
  }
  return g;
}

function checkerTexture(a, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const ca = '#' + new THREE.Color(a).getHexString();
  const cb = '#' + new THREE.Color(b).getHexString();
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    ctx.fillStyle = (x + y) % 2 ? cb : ca;
    ctx.fillRect(x * 64, y * 64, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30); // 60 m di pavimento, quadri da 1 m
  tex.anisotropy = 8;
  return tex;
}

function rebuildEnvironment() {
  if (env) {
    scene.remove(env);
    env.traverse(o => {
      o.geometry?.dispose();
      o.material?.map?.dispose();
      o.material?.dispose();
    });
  }
  env = new THREE.Group();
  const s = STYLE.bg[state.bg];

  scene.background = new THREE.Color(s.sky);
  scene.fog = new THREE.Fog(s.sky, 25, 45);
  mannMat.color.set(STYLE.mann[state.mann]);

  const groundMat = new THREE.MeshStandardMaterial({ color: s.ground, roughness: 1 });
  if (state.grid === 'scacchiera') {
    groundMat.color.set(0xffffff);
    groundMat.map = checkerTexture(s.ground, s.check);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  env.add(ground);

  if (state.grid !== 'scacchiera') {
    const minor = new THREE.GridHelper(60, 60, s.minor, s.minor);
    minor.position.y = 0.002;
    if (state.grid === 'leggera') {
      minor.material.transparent = true;
      minor.material.opacity = 0.35;
    }
    env.add(minor);
    if (state.grid === 'marcata') {
      const major = new THREE.GridHelper(60, 12, s.major, s.major);
      major.position.y = 0.004;
      env.add(major);
    }
  }

  if (state.refs) {
    const refMat = new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 0.8 });
    const refMat2 = new THREE.MeshStandardMaterial({ color: 0x6e6e6e, roughness: 0.8 });
    // colonne in cerchio, lontane
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.4), i % 2 ? refMat : refMat2);
      col.position.set(Math.sin(a) * 9, 1.5, Math.cos(a) * 9);
      col.castShadow = col.receiveShadow = true;
      env.add(col);
    }
    // qualche volume dietro al soggetto, per la parallasse
    const boxes = [[-1.6, -2.2, 0.8], [1.8, -2.6, 1.1], [0.2, -4, 0.6], [-3, 0.5, 0.5]];
    for (const [x, z, size] of boxes) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), refMat);
      b.position.set(x, size / 2, z);
      b.rotation.y = x * 0.7;
      b.castShadow = b.receiveShadow = true;
      env.add(b);
    }
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.45, 32, 16), refMat2);
    sphere.position.set(2.6, 0.45, 0.8);
    sphere.castShadow = sphere.receiveShadow = true;
    env.add(sphere);
  }

  scene.add(env);
}

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true });
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.shadowMap.enabled = true;
  r.shadowMap.type = THREE.PCFSoftShadowMap;
  return r;
}

// ---------------------------------------------------------------------------
// Anteprima
// ---------------------------------------------------------------------------

const $ = id => document.getElementById(id);
const viewCanvas = $('view');
const renderer = makeRenderer(viewCanvas);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const previewCam = makeCamera();

let playing = true;
let time = 0;
let last = performance.now();
const LOOP_PAUSE = 0.6; // secondi di pausa a fine movimento prima di ripartire

function aspectValue() {
  return state.aspect === '16:9' ? 16 / 9 : 9 / 16;
}

function exportSize() {
  const short = state.res;
  const long = state.res === 720 ? 1280 : 1920;
  return state.aspect === '16:9' ? [long, short] : [short, long];
}

function fitPreview() {
  const area = $('area');
  const pad = 40;
  const aw = area.clientWidth - pad;
  const ah = area.clientHeight - pad;
  const a = aspectValue();
  let w = aw, h = aw / a;
  if (h > ah) { h = ah; w = ah * a; }
  renderer.setSize(Math.floor(w), Math.floor(h));
}

function tick(now) {
  const dt = (now - last) / 1000;
  last = now;
  if (playing && !exporting) {
    time += dt;
    if (time > state.duration + LOOP_PAUSE) time = 0;
    updateTransport();
  }
  applyCamera(previewCam, Math.min(time / state.duration, 1), aspectValue());
  renderer.render(scene, previewCam);
  requestAnimationFrame(tick);
}

function updateTransport() {
  const t = Math.min(time, state.duration);
  $('scrub').value = Math.round((t / state.duration) * 1000);
  $('time').textContent = t.toFixed(2) + ' s';
}

// ---------------------------------------------------------------------------
// Export MP4 (fotogramma per fotogramma, indipendente dalla velocità del PC)
// ---------------------------------------------------------------------------

let exporting = false;
let exportRenderer = null;

async function pickEncoderConfig(width, height, fps) {
  const bitrate = width * height > 1e6 ? 12e6 : 6e6;
  for (const codec of ['avc1.640028', 'avc1.4d0028', 'avc1.42002a']) {
    const config = { codec, width, height, bitrate, framerate: fps, avc: { format: 'avc' } };
    const { supported } = await VideoEncoder.isConfigSupported(config);
    if (supported) return config;
  }
  return null;
}

async function exportMP4() {
  if (!('VideoEncoder' in window)) {
    setStatus('Questo browser non supporta WebCodecs. Usa Chrome o Edge aggiornati.');
    return;
  }
  const [W, H] = exportSize();
  const fps = state.fps;
  const total = Math.round(state.duration * fps);

  const config = await pickEncoderConfig(W, H, fps);
  if (!config) {
    setStatus(`Codifica H.264 ${W}×${H} non supportata da questo browser.`);
    return;
  }

  setExporting(true);
  setStatus(`Rendering ${W}×${H}, ${total} fotogrammi…`);

  if (!exportRenderer) {
    exportRenderer = makeRenderer(document.createElement('canvas'));
    exportRenderer.setPixelRatio(1);
  }
  exportRenderer.setSize(W, H, false);
  const cam = makeCamera();

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({ target, video: { codec: 'avc', width: W, height: H, frameRate: fps }, fastStart: 'in-memory' });
  let encodeError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { encodeError = e; },
  });
  encoder.configure(config);

  try {
    const frameDur = 1e6 / fps;
    for (let i = 0; i < total; i++) {
      if (encodeError) throw encodeError;
      // l'ultimo fotogramma coincide con la fine del movimento
      applyCamera(cam, total > 1 ? i / (total - 1) : 0, W / H);
      exportRenderer.render(scene, cam);
      const frame = new VideoFrame(exportRenderer.domElement, { timestamp: Math.round(i * frameDur), duration: Math.round(frameDur) });
      encoder.encode(frame, { keyFrame: i % fps === 0 });
      frame.close();

      while (encoder.encodeQueueSize > 6) await sleep(2);
      if (i % 3 === 0) {
        setProgress((i + 1) / total);
        await sleep(0);
      }
    }
    await encoder.flush();
    if (encodeError) throw encodeError;
    muxer.finalize();
    encoder.close();

    const name = `stage_${state.preset}_${state.aspect.replace(':', 'x')}_${state.res}p_${state.duration}s_${state.grid}-${state.bg}-${state.mann}.mp4`;
    download(new Blob([target.buffer], { type: 'video/mp4' }), name);
    setProgress(1);
    setStatus(`Esportato: ${name}`);
  } catch (e) {
    console.error(e);
    setStatus('Errore durante l\'export: ' + e.message);
    if (encoder.state !== 'closed') encoder.close();
  } finally {
    setExporting(false);
  }
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const setStatus = msg => { $('status').textContent = msg; };
const setProgress = p => { $('progress').firstElementChild.style.width = (p * 100).toFixed(1) + '%'; };

function setExporting(on) {
  exporting = on;
  document.querySelectorAll('#panel button, #panel input, #transport button, #transport input')
    .forEach(el => { el.disabled = on; });
}

// ---------------------------------------------------------------------------
// Prompt testuale
// ---------------------------------------------------------------------------

function buildPrompt() {
  const format = state.aspect === '16:9' ? 'Horizontal 16:9 framing.' : 'Vertical 9:16 framing.';
  return [
    'Camera motion guide (follow the camera movement of the reference video):',
    PRESETS[state.preset].prompt,
    EASING_TEXT[state.easing],
    `Duration ${state.duration} seconds. ${format}`,
  ].join(' ');
}

// ---------------------------------------------------------------------------
// Interfaccia
// ---------------------------------------------------------------------------

const STYLE_KEYS = ['grid', 'bg', 'mann'];

function syncUI() {
  document.querySelectorAll('.seg').forEach(seg => {
    const key = seg.dataset.key;
    seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(state[key])));
  });
  $('duration').value = state.duration;
  $('durOut').textContent = state.duration.toFixed(1) + ' s';
  $('refs').checked = state.refs;
  $('thirdsToggle').checked = state.thirds;
  $('thirds').classList.toggle('on', state.thirds);
  $('prompt').value = buildPrompt();
}

document.querySelectorAll('.seg').forEach(seg => {
  seg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const key = seg.dataset.key;
    state[key] = 'num' in seg.dataset ? Number(b.dataset.v) : b.dataset.v;
    if (STYLE_KEYS.includes(key)) rebuildEnvironment();
    if (key === 'aspect') fitPreview();
    if (key === 'preset' || key === 'easing') time = 0;
    syncUI();
  });
});

$('duration').addEventListener('input', e => {
  state.duration = Number(e.target.value);
  time = Math.min(time, state.duration);
  syncUI();
  updateTransport();
});

$('refs').addEventListener('change', e => { state.refs = e.target.checked; rebuildEnvironment(); });
$('thirdsToggle').addEventListener('change', e => { state.thirds = e.target.checked; syncUI(); });

$('playBtn').addEventListener('click', () => {
  playing = !playing;
  if (playing && time >= state.duration) time = 0;
  $('playBtn').textContent = playing ? '❚❚' : '▶';
});

$('scrub').addEventListener('input', e => {
  playing = false;
  $('playBtn').textContent = '▶';
  time = (Number(e.target.value) / 1000) * state.duration;
  updateTransport();
});

$('copyPrompt').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('prompt').value);
  setStatus('Prompt copiato negli appunti.');
});

$('exportBtn').addEventListener('click', exportMP4);
window.addEventListener('resize', fitPreview);

rebuildEnvironment();
syncUI();
fitPreview();
requestAnimationFrame(tick);
