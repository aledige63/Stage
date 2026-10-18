import * as THREE from 'three';

/**
 * Manichino neutro alto 1,8 m, piedi a y=0, guarda verso +Z.
 * Contiene anche le sagome che possono sostituirlo nel video guida (userData.part).
 */
export function buildMannequin(mat: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.4 });

  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, opts: { mat?: THREE.Material; rz?: number; scale?: Vec } = {}) => {
    const m = new THREE.Mesh(geo, opts.mat ?? mat);
    m.position.set(x, y, z);
    if (opts.rz) m.rotation.z = opts.rz;
    if (opts.scale) m.scale.set(...opts.scale);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  };
  const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 16);

  // testa con "visiera" per leggere la direzione dello sguardo
  add(new THREE.SphereGeometry(0.11, 32, 16), 0, 1.66, 0, { scale: [0.9, 1.1, 1] });
  add(new THREE.BoxGeometry(0.13, 0.04, 0.05), 0, 1.68, 0.09, { mat: visorMat });
  add(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 16), 0, 1.52, 0);
  // busto e bacino
  add(cap(0.16, 0.28), 0, 1.27, 0, { scale: [1.15, 1, 0.7] });
  add(cap(0.14, 0.08), 0, 0.98, 0, { scale: [1.1, 1, 0.75] });
  for (const s of [-1, 1]) {
    // gambe
    add(cap(0.07, 0.36), s * 0.1, 0.71, 0);
    add(cap(0.055, 0.34), s * 0.1, 0.3, 0);
    add(new THREE.BoxGeometry(0.1, 0.06, 0.24), s * 0.1, 0.03, 0.05);
    // braccia
    add(cap(0.05, 0.24), s * 0.26, 1.28, 0, { rz: s * 0.12 });
    add(cap(0.042, 0.22), s * 0.29, 0.99, 0.02, { rz: s * 0.05 });
    add(new THREE.SphereGeometry(0.045, 16, 12), s * 0.3, 0.83, 0.02, { scale: [0.8, 1.2, 1] });
  }
  for (const child of g.children) child.userData.part = 'manichino';

  // sagome sostitutive: segnano solo posizione e ingombro (il blocco anche la direzione)
  const proxies: [string, THREE.BufferGeometry][] = [
    ['cilindro', new THREE.CylinderGeometry(0.25, 0.25, 1.8, 40)],
    ['blocco', new THREE.BoxGeometry(0.5, 1.8, 0.3)],
  ];
  for (const [part, geo] of proxies) {
    const m = new THREE.Mesh(geo, mat);
    m.position.y = 0.9;
    m.castShadow = m.receiveShadow = true;
    m.userData.part = part;
    m.visible = false;
    g.add(m);
  }
  return g;
}

type Vec = [number, number, number];
