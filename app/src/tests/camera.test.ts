import { describe, expect, it } from 'vitest';
import {
  crane, distance, dolly, frame, MIN_DISTANCE, orbit, pan, pedestal, pitchDegrees, setHeight, tilt, truck, zoom,
  FOCAL_MAX, FOCAL_MIN,
} from '../engine/cameraOps';
import { EASE, evaluate, interpolate, samplePath } from '../engine/interpolation';
import { handheldShake } from '../engine/handheld';
import type { CameraState, Keyframe } from '../store';

const cam: CameraState = { pos: [0, 1.5, 5], target: [0, 1.1, 0], roll: 0, focal: 35 };
const near = (a: number, b: number, eps = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(eps);

describe('operazioni di camera', () => {
  it('orbit mantiene la distanza dal target', () => {
    const c = orbit(cam, 0.7, 0.2);
    near(distance(c), distance(cam), 1e-9);
    expect(c.target).toEqual(cam.target);
  });

  it('dolly avvicina senza superare la distanza minima', () => {
    expect(distance(dolly(cam, 1))).toBeCloseTo(distance(cam) - 1, 9);
    expect(distance(dolly(cam, 100))).toBeCloseTo(MIN_DISTANCE, 9);
  });

  it('truck e pedestal spostano camera e target insieme', () => {
    const t = truck(cam, 1);
    near(t.pos[0] - cam.pos[0], t.target[0] - cam.target[0]);
    const p = pedestal(cam, 0.5);
    near(p.pos[1] - cam.pos[1], 0.5);
    near(p.target[1] - cam.target[1], 0.5);
  });

  it('crane alza solo la camera, pan e tilt la lasciano ferma', () => {
    const c = crane(cam, 1);
    near(c.pos[1], cam.pos[1] + 1);
    expect(c.target).toEqual(cam.target);
    expect(pan(cam, 0.3).pos).toEqual(cam.pos);
    expect(tilt(cam, 0.1).pos).toEqual(cam.pos);
  });

  it('la camera non scende sotto il pavimento', () => {
    expect(crane(cam, -10).pos[1]).toBeGreaterThan(0);
    expect(setHeight(cam, -3).pos[1]).toBeGreaterThan(0);
  });

  it('setHeight cambia solo l\'altezza e resta puntata sul target', () => {
    const c = setHeight(cam, 2.4);
    expect(c.pos).toEqual([0, 2.4, 5]);
    expect(c.target).toEqual(cam.target);
  });

  it('pitchDegrees: negativo quando guarda in basso', () => {
    expect(pitchDegrees(cam)).toBeLessThan(0);
    near(pitchDegrees({ ...cam, target: [0, 1.5, 0] }), 0, 1e-9);
  });

  it('zoom resta nei limiti delle focali', () => {
    expect(zoom(cam, 100).focal).toBe(FOCAL_MAX);
    expect(zoom(cam, -100).focal).toBe(FOCAL_MIN);
  });

  it('frame segue l\'altezza del soggetto', () => {
    const normal = frame(cam, [0, 0, 0], 'primo', '16:9', 1);
    const short = frame(cam, [0, 0, 0], 'primo', '16:9', 1.2 / 1.8);
    expect(short.target[1]).toBeLessThan(normal.target[1]);
    near(short.target[1] / normal.target[1], 1.2 / 1.8, 1e-9);
  });
});

describe('interpolazione', () => {
  it('le curve partono da 0 e arrivano a 1', () => {
    for (const e of ['linear', 'in', 'out', 'inout'] as const) {
      near(EASE[e](0), 0);
      near(EASE[e](1), 1);
    }
    expect(EASE.hold(0.99)).toBe(0);
    expect(EASE.inout(0.25)).toBeLessThan(0.25);
    expect(EASE.out(0.25)).toBeGreaterThan(0.25);
  });

  it('il percorso ad arco mantiene la distanza in un\'orbita', () => {
    const a = cam;
    const b = orbit(cam, Math.PI / 2, 0);
    for (const e of [0.25, 0.5, 0.75]) near(distance(interpolate(a, b, e, 'arc')), distance(cam), 1e-9);
    // in linea retta, a metà la camera taglia verso il soggetto
    expect(distance(interpolate(a, b, 0.5, 'linear'))).toBeLessThan(distance(cam) - 0.5);
  });

  it('lo zoom si interpola su scala logaritmica', () => {
    const z = interpolate({ ...cam, focal: 24 }, { ...cam, focal: 96 }, 0.5, 'linear');
    near(z.focal, 48, 1e-9);
  });

  it('evaluate rispetta keyframe, estremi e hold', () => {
    const keys: Keyframe[] = [
      { id: 'a', time: 1, camera: cam, easing: 'hold', path: 'linear' },
      { id: 'b', time: 3, camera: dolly(cam, 2), easing: 'linear', path: 'linear' },
    ];
    expect(evaluate(keys, 0)).toBe(cam);
    // durante l'hold la camera resta sul primo keyframe
    const held = evaluate(keys, 2.9);
    held.pos.forEach((x, i) => near(x, cam.pos[i], 1e-9));
    near(held.focal, cam.focal, 1e-9);
    expect(evaluate(keys, 5)).toBe(keys[1].camera);
    expect(samplePath(keys, 10)).toHaveLength(11);
  });
});

describe('camera a mano', () => {
  const h = { enabled: true, intensity: 0.8, frequency: 1.3, seed: 2 };

  it('è deterministica e cambia con la variante', () => {
    expect(handheldShake(h, 1.234)).toEqual(handheldShake(h, 1.234));
    expect(handheldShake(h, 1.234)).not.toEqual(handheldShake({ ...h, seed: 3 }, 1.234));
  });

  it('spenta o a intensità zero non fa nulla', () => {
    expect(handheldShake({ ...h, enabled: false }, 1)).toBeUndefined();
    expect(handheldShake({ ...h, intensity: 0 }, 1)).toBeUndefined();
  });

  it('resta entro ampiezze piccole', () => {
    for (let t = 0; t < 10; t += 0.37) {
      const s = handheldShake({ ...h, intensity: 1 }, t)!;
      expect(Math.abs(s.yaw)).toBeLessThan(0.03);
      expect(Math.abs(s.y)).toBeLessThan(0.03);
    }
  });
});
