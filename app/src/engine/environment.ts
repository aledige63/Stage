import * as THREE from 'three';
import type { StyleState } from '../store';

export const PALETTE = {
  chiaro: { sky: 0xd8d8d8, ground: 0xc4c4c4, major: 0x4a4a4a, minor: 0x8c8c8c, check: 0xa8a8a8 },
  medio: { sky: 0x8a8a8a, ground: 0x767676, major: 0x2a2a2a, minor: 0x555555, check: 0x5e5e5e },
  scuro: { sky: 0x262626, ground: 0x2e2e2e, major: 0xb0b0b0, minor: 0x5c5c5c, check: 0x444444 },
};

export const MANNEQUIN_COLORS = { grigio: 0xa8a8a8, bianco: 0xf2f2f2, arancio: 0xe07b39 };

function checkerTexture(a: number, b: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    ctx.fillStyle = '#' + new THREE.Color((x + y) % 2 ? b : a).getHexString();
    ctx.fillRect(x * 64, y * 64, 64, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(30, 30); // 60 m di pavimento, quadri da 1 m
  tex.anisotropy = 8;
  return tex;
}

function dispose(root: THREE.Object3D) {
  root.traverse(o => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      (mat as THREE.MeshStandardMaterial).map?.dispose();
      mat.dispose();
    }
  });
}

/** Pavimento, griglia, sfondo ed elementi di riferimento fissi. */
export function buildEnvironment(scene: THREE.Scene, style: StyleState, previous: THREE.Group | null): THREE.Group {
  if (previous) {
    scene.remove(previous);
    dispose(previous);
  }
  const env = new THREE.Group();
  const p = PALETTE[style.bg];

  scene.background = new THREE.Color(p.sky);
  scene.fog = new THREE.Fog(p.sky, 25, 45);

  const groundMat = new THREE.MeshStandardMaterial({ color: p.ground, roughness: 1 });
  if (style.grid === 'scacchiera') {
    groundMat.color.set(0xffffff);
    groundMat.map = checkerTexture(p.ground, p.check);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  env.add(ground);

  if (style.grid !== 'scacchiera') {
    const minor = new THREE.GridHelper(60, 60, p.minor, p.minor);
    minor.position.y = 0.002;
    if (style.grid === 'leggera') {
      const m = minor.material as THREE.LineBasicMaterial;
      m.transparent = true;
      m.opacity = 0.35;
    }
    env.add(minor);
    if (style.grid === 'marcata') {
      const major = new THREE.GridHelper(60, 12, p.major, p.major);
      major.position.y = 0.004;
      env.add(major);
    }
  }

  // senza soggetto le colonne restano sempre: danno al modello i riferimenti di spazio
  if (style.refs || style.subject === 'nessuno') {
    const matA = new THREE.MeshStandardMaterial({ color: 0x8f8f8f, roughness: 0.8 });
    const matB = new THREE.MeshStandardMaterial({ color: 0x6e6e6e, roughness: 0.8 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.3;
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.4, 3, 0.4), i % 2 ? matA : matB);
      col.position.set(Math.sin(a) * 9, 1.5, Math.cos(a) * 9);
      col.castShadow = col.receiveShadow = true;
      env.add(col);
    }
  }

  scene.add(env);
  return env;
}
