import { useRef, useState, type ReactNode } from 'react';
import {
  addObject, CAMERA_SEL, COLOR_HEX, COLOR_IDS, colorCss, DEFAULT_CAMERA, isMannequin, MANNEQUIN_HEIGHT, objectHeight, removeObject, setCamera,
  setState, setStyle, store, subjectObject, subjectScale, SUBJECT_HEIGHT_MAX, SUBJECT_HEIGHT_MIN, TARGET_SEL, updateObject, useApp,
  type AddableKind, type BlenderScene, type ObjectPose, type SceneObject, type SubjectMode, type Vec3,
} from '../store';
import {
  distance, FOCAL_MAX, FOCAL_MIN, frame, MIN_HEIGHT, moveCameraTo, pitchDegrees, ROLL_MAX, setHeight, type Action, type Framing,
} from '../engine/cameraOps';
import { press, release } from '../engine/input';
import { currentPose, currentSubject, effectiveCamera, lockTarget } from '../engine/subjectMotion';
import { moveObject, setLock } from '../timeline';
import { importBlenderFile, removeBlenderScene } from '../engine/blenderImport';
import { objectLabel, useT, type TKey } from '../i18n';

function Seg<T extends string | number>({ value, options, onChange, disabled }: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} disabled={disabled} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

function readOpen(id: string) {
  try {
    return localStorage.getItem('stage:sec:' + id) !== 'closed';
  } catch {
    return true;
  }
}

/** Sezione richiudibile: lo stato aperto/chiuso resta salvato nel browser. */
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => readOpen(id));
  const toggle = () => {
    setOpen(!open);
    try {
      localStorage.setItem('stage:sec:' + id, open ? 'closed' : 'open');
    } catch {
      // preferenza non salvabile
    }
  };
  return (
    <section className={open ? 'open' : 'closed'}>
      <h2>
        <button className="sec-toggle" onClick={toggle} aria-expanded={open}>
          <span className="chev" aria-hidden="true">{open ? '▾' : '▸'}</span>{title}
        </button>
      </h2>
      {open && children}
    </section>
  );
}

/** Pulsante "tieni premuto" per un movimento continuo di camera. */
function Jog({ action, sign, label, keyHint }: { action: Action; sign: number; label: string; keyHint: string }) {
  const id = `ui:${action}:${sign}`;
  return (
    <button
      className="jog"
      onPointerDown={e => { e.currentTarget.setPointerCapture(e.pointerId); press(id, action, sign); }}
      onPointerUp={() => release(id)}
      onPointerCancel={() => release(id)}
      onLostPointerCapture={() => release(id)}
    >
      {label}<kbd>{keyHint}</kbd>
    </button>
  );
}

const MOVES: { action: Action; minus: [string, string]; plus: [string, string] }[] = [
  { action: 'orbitAz', minus: ['◀', '←'], plus: ['▶', '→'] },
  { action: 'orbitEl', minus: ['▼', '↓'], plus: ['▲', '↑'] },
  { action: 'dolly', minus: ['Out', 'S'], plus: ['In', 'W'] },
  { action: 'truck', minus: ['◀', 'A'], plus: ['▶', 'D'] },
  { action: 'pedestal', minus: ['▼', 'F'], plus: ['▲', 'R'] },
  { action: 'crane', minus: ['▼', 'G'], plus: ['▲', 'T'] },
  { action: 'pan', minus: ['◀', 'J'], plus: ['▶', 'L'] },
  { action: 'tilt', minus: ['▼', 'K'], plus: ['▲', 'I'] },
  { action: 'roll', minus: ['↺', 'U'], plus: ['↻', 'O'] },
  { action: 'zoom', minus: ['Out', 'X'], plus: ['In', 'Z'] },
];

// Pan e roll hanno il segno "positivo" verso sinistra/antiorario
const PLUS_SIGN: Partial<Record<Action, number>> = { pan: -1, roll: 1 };

function NumField({ label, value, step, onChange, min, max }: {
  label: string; value: number; step: number; onChange: (v: number) => void; min?: number; max?: number;
}) {
  return (
    <label className="num">
      <span>{label}</span>
      <input type="number" step={step} min={min} max={max} value={Number(value.toFixed(3))}
        onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} />
    </label>
  );
}

function CameraSection() {
  const camera = useApp(s => s.camera);
  const speed = useApp(s => s.speed);
  const t = useT();
  const pitch = pitchDegrees(camera);
  const look = pitch < -1 ? t('cam.lookDown') : pitch > 1 ? t('cam.lookUp') : t('cam.level');

  const applyFraming = (kind: Framing) => {
    const s = store.getState();
    // senza soggetto si inquadra il centro della scena
    setState({ camera: frame(s.camera, currentSubject(s)?.pos ?? [0, 0, 0], kind, s.aspect, subjectScale(s)) });
  };

  return (
    <Section id="camera" title={t('cam.title')}>
      <div className="readout">
        <div><span>{t('cam.focalShort')}</span><b>{camera.focal.toFixed(0)} mm</b></div>
        <div><span>{t('cam.distance')}</span><b>{distance(camera).toFixed(2)} m</b></div>
        <div className="editable" title={t('cam.heightField')}>
          <span>{t('cam.height')}</span>
          <input type="number" step={0.05} min={MIN_HEIGHT} value={Number(camera.pos[1].toFixed(2))} aria-label={t('cam.heightField')}
            onChange={e => {
              const y = Number(e.target.value);
              if (Number.isFinite(y)) setState({ camera: setHeight(store.getState().camera, Math.max(MIN_HEIGHT, y)) });
            }} />
          <b>m</b>
        </div>
        <div><span>{t('cam.roll')}</span><b>{camera.roll.toFixed(0)}°</b></div>
      </div>
      <p className="tilt-line">{t('cam.tilt')} <b>{pitch.toFixed(0)}°</b> · {look}</p>

      <div className="jogs">
        {MOVES.map(m => {
          const plus = PLUS_SIGN[m.action] ?? 1;
          return (
            <div className="jog-row" key={m.action}>
              <span>{t(`move.${m.action}` as TKey)}</span>
              <Jog action={m.action} sign={-plus} label={m.minus[0]} keyHint={m.minus[1]} />
              <Jog action={m.action} sign={plus} label={m.plus[0]} keyHint={m.plus[1]} />
            </div>
          );
        })}
      </div>

      <label className="field">
        <span>{t('cam.speed')} <output>{speed.toFixed(2)}×</output></span>
        <input type="range" min={0.1} max={3} step={0.05} value={speed}
          onChange={e => setState({ speed: Number(e.target.value) })} />
      </label>
      <label className="field">
        <span>{t('cam.focal')} <output>{camera.focal.toFixed(0)} mm</output></span>
        <input type="range" min={Math.log(FOCAL_MIN)} max={Math.log(FOCAL_MAX)} step={0.001} value={Math.log(camera.focal)}
          onChange={e => setCamera({ focal: Math.exp(Number(e.target.value)) })} />
      </label>
      <div className="seg small">
        {[14, 24, 35, 50, 85, 135].map(f => (
          <button key={f} className={Math.round(camera.focal) === f ? 'on' : ''} onClick={() => setCamera({ focal: f })}>{f}</button>
        ))}
      </div>
      <label className="field">
        <span>{t('cam.roll')} <output>{camera.roll.toFixed(0)}°</output></span>
        <input type="range" min={-ROLL_MAX} max={ROLL_MAX} step={1} value={camera.roll}
          onChange={e => setCamera({ roll: Number(e.target.value) })} />
      </label>

      <h3>{t('cam.frame')}</h3>
      <div className="seg">
        <button onClick={() => applyFraming('intera')}>{t('frame.full')}</button>
        <button onClick={() => applyFraming('mezza')}>{t('frame.medium')}</button>
        <button onClick={() => applyFraming('primo')}>{t('frame.close')}</button>
      </div>
      <button className="wide" onClick={() => setState({ camera: DEFAULT_CAMERA })}>{t('cam.reset')}</button>
      <p className="note">{t('cam.note')}</p>
      <LockControls />
    </Section>
  );
}

// altezza dei punti rapidi in proporzione all'altezza del soggetto
const LOCK_POINTS: [TKey, number][] = [['lock.head', 0.92], ['lock.chest', 0.72], ['lock.waist', 0.55]];

function LockControls() {
  const lock = useApp(s => s.lock);
  const objects = useApp(s => s.objects);
  const subject = useApp(subjectObject);
  const target = useApp(lockTarget);
  const t = useT();
  const height = target ? objectHeight(target) : MANNEQUIN_HEIGHT;
  // manichino: parti del corpo; altri oggetti: il loro centro
  const points: [TKey, number][] = isMannequin(target) ? LOCK_POINTS : [['lock.center', 0]];
  const chooseTarget = (id: string) => {
    const s = store.getState();
    const next = id ? s.objects.find(o => o.id === id) ?? null : subjectObject(s);
    // punto di partenza sensato per il nuovo oggetto: il petto di un manichino, il centro degli altri
    const y = isMannequin(next) ? Number((objectHeight(next!) * 0.72).toFixed(2)) : 0;
    setLock({ targetId: id || null, offset: [0, y, 0] });
  };
  return (
    <>
      <h3>{t('lock.title')}</h3>
      <label className="check">
        <input type="checkbox" checked={lock.enabled && !!target} disabled={!target && !objects.length} onChange={e => setLock({ enabled: e.target.checked })} />
        {t('lock.enable')}
      </label>
      {lock.enabled && (
        <label className="field">
          <span>{t('lock.target')}</span>
          <select value={lock.targetId ?? ''} onChange={e => chooseTarget(e.target.value)}>
            <option value="">{t('lock.subject')}{subject ? ` (${objectLabel(subject)})` : ''}</option>
            {objects.map(o => <option key={o.id} value={o.id}>{objectLabel(o)}</option>)}
          </select>
        </label>
      )}
      {lock.enabled && !target && <p className="note">{t('lock.noSubject')}</p>}
      {lock.enabled && target && (
        <>
          <div className="seg small">
            {points.map(([key, k]) => {
              const y = Number((height * k).toFixed(2));
              const on = Math.abs(lock.offset[1] - y) < 0.01 && Math.abs(lock.offset[0]) < 0.01 && Math.abs(lock.offset[2]) < 0.01;
              return <button key={key} className={on ? 'on' : ''} onClick={() => setLock({ offset: [0, y, 0] })}>{t(key)}</button>;
            })}
          </div>
          <Vec3Fields label={t('lock.point')} value={lock.offset} step={0.05} onChange={offset => setLock({ offset })} />
        </>
      )}
      <p className="note">{t('lock.note')}</p>
    </>
  );
}

function Vec3Fields({ label, value, step, onChange, only }: {
  label: string; value: Vec3; step: number; onChange: (v: Vec3) => void; only?: number[];
}) {
  const axes = ['X', 'Y', 'Z'];
  return (
    <div className="vec">
      <span className="vec-label">{label}</span>
      {axes.map((a, i) => (only && !only.includes(i)) ? null : (
        <NumField key={a} label={a} value={value[i]} step={step}
          onChange={v => { const next = [...value] as Vec3; next[i] = v; onChange(next); }} />
      ))}
    </div>
  );
}

function ObjectEditor({ obj }: { obj: SceneObject }) {
  const gizmo = useApp(s => s.gizmo);
  const isSubject = useApp(s => s.subjectId === obj.id);
  // posa del momento: può venire dalla timeline dell'oggetto o essere stata spostata a mano
  const poseJson = useApp(s => {
    const o = s.objects.find(x => x.id === obj.id);
    return o ? JSON.stringify(currentPose(s, o)) : 'null';
  });
  const t = useT();
  const pose = (JSON.parse(poseJson) as ObjectPose | null) ?? obj;
  const mann = obj.kind === 'manichino';
  const color = obj.color ?? 'grigio';
  const modes: ['translate' | 'rotate' | 'scale', string][] = [['translate', t('gizmo.translate')], ['rotate', t('gizmo.rotate')]];
  if (!mann) modes.push(['scale', t('gizmo.scale')]);
  const move = (p: Partial<ObjectPose>) => moveObject(obj.id, p);

  return (
    <div className="editor">
      <label className="field">
        <span>{t('obj.name')}</span>
        <input type="text" className="obj-rename" value={obj.label ?? ''} placeholder={objectLabel({ ...obj, label: undefined })}
          onChange={e => updateObject(obj.id, { label: e.target.value || undefined })} />
      </label>
      <p className="note">{t('obj.nameHint')}</p>
      {!mann && (
        <>
          <label className="check">
            <input type="checkbox" checked={!!obj.mapped} onChange={e => updateObject(obj.id, { mapped: e.target.checked || undefined })} />
            {t('obj.mapped')}
          </label>
          <p className="note">{t('obj.mappedHint')}</p>
        </>
      )}
      <Seg value={mann && gizmo === 'scale' ? 'translate' : gizmo} options={modes} onChange={g => setState({ gizmo: g })} />
      <Vec3Fields label={t('obj.position')} value={pose.pos} step={0.1} onChange={pos => move({ pos })} only={mann ? [0, 2] : undefined} />
      <Vec3Fields label={t('obj.rotation')} value={pose.rot} step={5} onChange={rot => move({ rot: mann ? [0, rot[1], 0] : rot })} only={mann ? [1] : undefined} />
      {mann ? (
        <div className="vec">
          <span className="vec-label">{t('obj.height')}</span>
          <NumField label="m" value={objectHeight(obj)} step={0.05} min={SUBJECT_HEIGHT_MIN} max={SUBJECT_HEIGHT_MAX}
            onChange={h => updateObject(obj.id, { height: Math.min(SUBJECT_HEIGHT_MAX, Math.max(SUBJECT_HEIGHT_MIN, h)) })} />
        </div>
      ) : (
        <Vec3Fields label={t('obj.scale')} value={pose.scale} step={0.1} onChange={scale => move({ scale: scale.map(v => Math.max(0.05, v)) as Vec3 })} />
      )}
      <h3>{t('obj.color')}</h3>
      <div className="swatches">
        {COLOR_IDS.map(c => (
          <button key={c} className={c === color ? 'on' : ''} title={t(`color.${c}` as TKey)} aria-label={t(`color.${c}` as TKey)}
            style={{ background: c === 'grigio' ? colorCss({ tone: obj.tone }) : COLOR_HEX[c] }}
            onClick={() => updateObject(obj.id, { color: c })} />
        ))}
      </div>
      {color === 'grigio' && (
        <label className="field">
          <span>{t('obj.tone')}</span>
          <input type="range" min={0} max={1} step={0.01} value={obj.tone} onChange={e => updateObject(obj.id, { tone: Number(e.target.value) })} />
        </label>
      )}
      <label className="check">
        <input type="checkbox" checked={isSubject} onChange={e => setState({ subjectId: e.target.checked ? obj.id : null })} />
        {t('obj.isSubject')}
      </label>
      <p className="note">{t(obj.keys?.length ? 'obj.animated' : 'obj.animateHint')}</p>
      <button className="wide danger" onClick={() => removeObject(obj.id)}>{t('obj.delete')}</button>
    </div>
  );
}

/** Camera o target selezionati in vista regia: modo del gizmo e coordinate. */
function CameraSelEditor({ onTarget }: { onTarget: boolean }) {
  const gizmo = useApp(s => s.gizmo);
  const locked = useApp(s => s.lock.enabled);
  const camJson = useApp(s => JSON.stringify(effectiveCamera(s)));
  const t = useT();
  const cam = JSON.parse(camJson) as ReturnType<typeof effectiveCamera>;
  const set = (patch: Partial<typeof cam>) => setState({ camera: { ...store.getState().camera, ...patch } });
  if (onTarget && locked) return <div className="editor"><p className="note">{t('camsel.targetLocked')}</p></div>;
  return (
    <div className="editor">
      {!onTarget && (
        <Seg value={gizmo === 'rotate' ? 'rotate' : 'translate'} options={[['translate', t('gizmo.translate')], ['rotate', t('gizmo.rotate')]]}
          onChange={g => setState({ gizmo: g })} />
      )}
      <p className="note">{t(onTarget ? 'camsel.targetHint' : locked ? 'camsel.lockedHint' : 'camsel.cameraHint')}</p>
      <Vec3Fields label={t('camsel.position')} value={cam.pos} step={0.1}
        onChange={pos => setState({ camera: moveCameraTo(store.getState().camera, pos) })} />
      {!locked && <Vec3Fields label={t('camsel.target')} value={cam.target} step={0.1} onChange={target => set({ target })} />}
      <p className="note">{t('camsel.keyHint')}</p>
    </div>
  );
}

const ADDABLE: AddableKind[] = ['manichino', 'cubo', 'sfera', 'cilindro', 'pannello'];

function SceneSection() {
  const objects = useApp(s => s.objects);
  const selectedId = useApp(s => s.selectedId);
  const subjectId = useApp(s => s.subjectId);
  const selected = objects.find(o => o.id === selectedId);
  const t = useT();

  return (
    <Section id="scene" title={t('scene.title')}>
      <h3>{t('scene.add')}</h3>
      <div className="seg small wrap">
        {ADDABLE.map(k => <button key={k} onClick={() => addObject(k)}>{t(`kind.${k}` as TKey)}</button>)}
      </div>
      <ul className="objects">
        {[CAMERA_SEL, TARGET_SEL].map(id => (
          <li key={id} className={id === selectedId ? 'on cam-row' : 'cam-row'} onClick={() => setState({ selectedId: id === selectedId ? null : id })}>
            <span className="obj-name">{id === CAMERA_SEL ? '🎥 ' + t('camsel.camera') : '◇ ' + t('camsel.targetRow')}</span>
          </li>
        ))}
        {objects.map(o => (
          <li key={o.id} className={o.id === selectedId ? 'on' : ''} onClick={() => setState({ selectedId: o.id === selectedId ? null : o.id })}>
            <span className={o.hidden ? 'obj-name off' : 'obj-name'}>
              <i className="obj-dot" style={{ background: colorCss(o) }} />
              {objectLabel(o)}{o.id === subjectId ? ' ★' : ''}{o.keys?.length ? ' ◆' : ''}
            </span>
            <button className="obj-eye" title={t(o.hidden ? 'obj.show' : 'obj.hide')} aria-label={t(o.hidden ? 'obj.show' : 'obj.hide')}
              onClick={e => { e.stopPropagation(); updateObject(o.id, { hidden: !o.hidden || undefined }); }}>
              {o.hidden ? '○' : '●'}
            </button>
          </li>
        ))}
      </ul>
      {selectedId === CAMERA_SEL || selectedId === TARGET_SEL ? <CameraSelEditor onTarget={selectedId === TARGET_SEL} />
        : selected ? <ObjectEditor obj={selected} /> : <p className="note">{t(objects.length ? 'scene.selectHint' : 'scene.empty')}</p>}
    </Section>
  );
}

function BlenderSection() {
  const scene = useApp(s => s.blenderScene);
  const look = useApp(s => s.style.sceneLook);
  const [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const t = useT();
  const patch = (p: Partial<BlenderScene>) => setState(s => ({ blenderScene: s.blenderScene && { ...s.blenderScene, ...p } }));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setStatus(t('blender.loading'));
    try {
      const r = await importBlenderFile(file);
      setStatus(t('blender.done', { n: r.objects }) + (r.subject ? t('blender.doneSubject') : '') + (r.camera ? t('blender.doneCamera') : ''));
    } catch (err) {
      setStatus(t('blender.error', { msg: (err as Error).message }));
    }
  };

  return (
    <Section id="blender" title={t('blender.title')}>
      <input ref={input} type="file" accept=".glb,.gltf" hidden aria-label={t('blender.import')}
        onChange={e => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
      <button className="wide" onClick={() => input.current?.click()}>{t(scene ? 'blender.reimport' : 'blender.import')}</button>
      {status && <p className="note">{status}</p>}
      {scene ? (
        <>
          <p className="note">{scene.fileName} · {(scene.bytes / 1048576).toFixed(2)} MB</p>
          <h3>{t('blender.look')}</h3>
          <Seg value={look} options={[['grigio', t('blender.gray')], ['colori', t('blender.colors')]]} onChange={sceneLook => setStyle({ sceneLook })} />
          <Vec3Fields label={t('blender.moveAll')} value={scene.offset} step={0.1} onChange={offset => patch({ offset })} />
          <div className="vec">
            <span className="vec-label">{t('blender.turnAll')}</span>
            <NumField label="Y" value={scene.yaw} step={5} onChange={yaw => patch({ yaw })} />
          </div>
          <button className="wide danger" onClick={removeBlenderScene}>{t('blender.remove')}</button>
        </>
      ) : <p className="note">{t('blender.note')}</p>}
    </Section>
  );
}

const SUBJECTS: SubjectMode[] = ['manichino', 'cilindro', 'blocco', 'nessuno'];

/** Scelta del soggetto nel video guida: usata nel pannello Soggetto e nella finestra Esporta. */
export function SubjectPicker({ disabled }: { disabled?: boolean }) {
  const subject = useApp(s => s.style.subject);
  const t = useT();
  return (
    <>
      <h3>{t('style.subject')}</h3>
      <div className="seg grid2">
        {SUBJECTS.map(v => (
          <button key={v} className={v === subject ? 'on' : ''} disabled={disabled} onClick={() => setStyle({ subject: v })}>{t(`subject.${v}`)}</button>
        ))}
      </div>
      {subject !== 'manichino' && (
        <p className="note">{t(subject === 'nessuno' ? 'subject.note.none' : 'subject.note.proxy')}</p>
      )}
    </>
  );
}

const HEIGHT_PRESETS: [number, TKey][] = [[1.2, 'subject.h.child'], [1.65, 'subject.h.woman'], [1.78, 'subject.h.man'], [1.9, 'subject.h.tall']];

function SubjectSection() {
  const objects = useApp(s => s.objects);
  const subjectId = useApp(s => s.subjectId);
  const t = useT();
  const subject = objects.find(o => o.id === subjectId);
  const height = subject ? objectHeight(subject) : MANNEQUIN_HEIGHT;
  const set = (h: number) => subject && updateObject(subject.id, { height: Math.min(SUBJECT_HEIGHT_MAX, Math.max(SUBJECT_HEIGHT_MIN, h)) });
  return (
    <Section id="subject" title={t('subject.title')}>
      <label className="field">
        <span>{t('subject.main')}</span>
        <select value={subjectId ?? ''} onChange={e => setState({ subjectId: e.target.value || null })}>
          <option value="">{t('subject.noMain')}</option>
          {objects.map(o => <option key={o.id} value={o.id}>{objectLabel(o)}</option>)}
        </select>
      </label>
      <SubjectPicker />
      {isMannequin(subject) && (
        <>
          <label className="field">
            <span>{t('subject.height')} <output>{height.toFixed(2)} m</output></span>
            <input type="range" min={SUBJECT_HEIGHT_MIN} max={SUBJECT_HEIGHT_MAX} step={0.01} value={height}
              onChange={e => set(Number(e.target.value))} />
          </label>
          <div className="seg small">
            {HEIGHT_PRESETS.map(([h, key]) => (
              <button key={h} className={Math.abs(height - h) < 0.005 ? 'on' : ''} onClick={() => set(h)} title={`${h.toFixed(2)} m`}>{t(key)}</button>
            ))}
          </div>
        </>
      )}
      <p className="note">{t('subject.mainNote')}</p>
    </Section>
  );
}

function StyleSection() {
  const style = useApp(s => s.style);
  const t = useT();
  return (
    <Section id="style" title={t('style.title')}>
      <h3>{t('style.floor')}</h3>
      <Seg value={style.grid} options={(['marcata', 'leggera', 'scacchiera'] as const).map(v => [v, t(`grid.${v}`)])} onChange={grid => setStyle({ grid })} />
      <h3>{t('style.bg')}</h3>
      <Seg value={style.bg} options={(['chiaro', 'medio', 'scuro'] as const).map(v => [v, t(`bg.${v}`)])} onChange={bg => setStyle({ bg })} />
      <label className="check">
        <input type="checkbox" checked={style.refs || style.subject === 'nessuno'} disabled={style.subject === 'nessuno'}
          onChange={e => setStyle({ refs: e.target.checked })} />
        {t('style.refs')}
      </label>
      {style.subject === 'nessuno' && <p className="note">{t('style.refsForced')}</p>}
    </Section>
  );
}

function HandheldSection() {
  const h = useApp(s => s.handheld);
  const t = useT();
  const set = (patch: Partial<typeof h>) => setState(s => ({ handheld: { ...s.handheld, ...patch } }));
  const pace = h.frequency < 0.7 ? t('hh.slow') : h.frequency > 1.6 ? t('hh.nervous') : t('hh.natural');
  return (
    <Section id="handheld" title={t('hh.title')}>
      <label className="check">
        <input type="checkbox" checked={h.enabled} onChange={e => set({ enabled: e.target.checked })} />
        {t('hh.enable')}
      </label>
      <fieldset className="plain" disabled={!h.enabled}>
        <label className="field">
          <span>{t('hh.intensity')} <output>{Math.round(h.intensity * 100)}%</output></span>
          <input type="range" min={0} max={1} step={0.01} value={h.intensity} onChange={e => set({ intensity: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>{t('hh.frequency')} <output>{pace} ({h.frequency.toFixed(2)}×)</output></span>
          <input type="range" min={0.3} max={3} step={0.05} value={h.frequency} onChange={e => set({ frequency: Number(e.target.value) })} />
        </label>
        <button className="wide" onClick={() => set({ seed: h.seed + 1 })}>{t('hh.variant', { n: h.seed })}</button>
      </fieldset>
      <p className="note">{t('hh.note')}</p>
    </Section>
  );
}

function FormatSection() {
  const aspect = useApp(s => s.aspect);
  const thirds = useApp(s => s.thirds);
  const center = useApp(s => s.center);
  const safe = useApp(s => s.safe);
  const t = useT();
  return (
    <Section id="format" title={t('fmt.title')}>
      <Seg value={aspect} options={[['16:9', '16:9'], ['9:16', '9:16']]} onChange={a => setState({ aspect: a })} />
      <label className="check">
        <input type="checkbox" checked={thirds} onChange={e => setState({ thirds: e.target.checked })} />
        {t('overlay.thirds')}
      </label>
      <label className="check">
        <input type="checkbox" checked={center} onChange={e => setState({ center: e.target.checked })} />
        {t('overlay.center')}
      </label>
      <label className="check">
        <input type="checkbox" checked={safe} onChange={e => setState({ safe: e.target.checked })} />
        {t('overlay.safe')}
      </label>
      <p className="note">{t('overlay.note')}</p>
    </Section>
  );
}

/** Pannello sinistro: tutto ciò che riguarda la camera. */
export function Panel() {
  return (
    <aside className="panel left">
      <h1>Stage</h1>
      <FormatSection />
      <CameraSection />
      <HandheldSection />
    </aside>
  );
}

/** Pannello destro: soggetto, oggetti della scena, stile del video guida. */
export function RightPanel() {
  return (
    <aside className="panel right">
      <SubjectSection />
      <BlenderSection />
      <SceneSection />
      <StyleSection />
    </aside>
  );
}
