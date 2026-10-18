import type { ReactNode } from 'react';
import {
  addPrimitive, DEFAULT_CAMERA, MANNEQUIN_ID, removeObject, setCamera, setState, setStyle, store, updateObject, useApp,
  type PrimitiveKind, type SceneObject, type SubjectMode, type Vec3,
} from '../store';
import { distance, FOCAL_MAX, FOCAL_MIN, frame, type Action, type Framing } from '../engine/cameraOps';
import { press, release } from '../engine/input';
import { objectLabel, useT, type TKey } from '../i18n';

function Seg<T extends string | number>({ value, options, onChange }: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map(([v, label]) => (
        <button key={String(v)} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2>{title}</h2>
      {children}
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

function CameraSection() {
  const camera = useApp(s => s.camera);
  const speed = useApp(s => s.speed);
  const t = useT();

  const applyFraming = (kind: Framing) => {
    const s = store.getState();
    const subject = s.objects.find(o => o.id === MANNEQUIN_ID)!.pos;
    setState({ camera: frame(s.camera, subject, kind, s.aspect) });
  };

  return (
    <Section title={t('cam.title')}>
      <div className="readout">
        <div><span>{t('cam.focalShort')}</span><b>{camera.focal.toFixed(0)} mm</b></div>
        <div><span>{t('cam.distance')}</span><b>{distance(camera).toFixed(2)} m</b></div>
        <div><span>{t('cam.height')}</span><b>{camera.pos[1].toFixed(2)} m</b></div>
        <div><span>{t('cam.roll')}</span><b>{camera.roll.toFixed(0)}°</b></div>
      </div>

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
        <input type="range" min={-45} max={45} step={0.5} value={camera.roll}
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
    </Section>
  );
}

function NumField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="num">
      <span>{label}</span>
      <input type="number" step={step} value={Number(value.toFixed(3))}
        onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }} />
    </label>
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
  const t = useT();
  const isMannequin = obj.id === MANNEQUIN_ID;
  const modes: ['translate' | 'rotate' | 'scale', string][] = [['translate', t('gizmo.translate')], ['rotate', t('gizmo.rotate')]];
  if (!isMannequin) modes.push(['scale', t('gizmo.scale')]);
  const set = (patch: Partial<SceneObject>) => updateObject(obj.id, patch);

  return (
    <div className="editor">
      <h3>{objectLabel(obj)}</h3>
      <Seg value={isMannequin && gizmo === 'scale' ? 'translate' : gizmo} options={modes} onChange={g => setState({ gizmo: g })} />
      <Vec3Fields label={t('obj.position')} value={obj.pos} step={0.1} onChange={pos => set({ pos })} only={isMannequin ? [0, 2] : undefined} />
      <Vec3Fields label={t('obj.rotation')} value={obj.rot} step={5} onChange={rot => set({ rot })} only={isMannequin ? [1] : undefined} />
      {!isMannequin && (
        <>
          <Vec3Fields label={t('obj.scale')} value={obj.scale} step={0.1} onChange={scale => set({ scale: scale.map(v => Math.max(0.05, v)) as Vec3 })} />
          <label className="field">
            <span>{t('obj.tone')}</span>
            <input type="range" min={0} max={1} step={0.01} value={obj.tone} onChange={e => set({ tone: Number(e.target.value) })} />
          </label>
          <button className="wide danger" onClick={() => removeObject(obj.id)}>{t('obj.delete')}</button>
        </>
      )}
    </div>
  );
}

const PRIMITIVES: PrimitiveKind[] = ['cubo', 'sfera', 'cilindro', 'pannello'];

function SceneSection() {
  const objects = useApp(s => s.objects);
  const selectedId = useApp(s => s.selectedId);
  const selected = objects.find(o => o.id === selectedId);
  const t = useT();

  return (
    <Section title={t('scene.title')}>
      <h3>{t('scene.add')}</h3>
      <div className="seg">
        {PRIMITIVES.map(k => <button key={k} onClick={() => addPrimitive(k)}>{t(`kind.${k}` as TKey)}</button>)}
      </div>
      <ul className="objects">
        {objects.map(o => (
          <li key={o.id} className={o.id === selectedId ? 'on' : ''} onClick={() => setState({ selectedId: o.id === selectedId ? null : o.id })}>
            {objectLabel(o)}
          </li>
        ))}
      </ul>
      {selected ? <ObjectEditor obj={selected} /> : <p className="note">{t('scene.selectHint')}</p>}
    </Section>
  );
}

function StyleSection() {
  const style = useApp(s => s.style);
  const t = useT();
  return (
    <Section title={t('style.title')}>
      <SubjectPicker />
      <h3>{t('style.floor')}</h3>
      <Seg value={style.grid} options={(['marcata', 'leggera', 'scacchiera'] as const).map(v => [v, t(`grid.${v}`)])} onChange={grid => setStyle({ grid })} />
      <h3>{t('style.bg')}</h3>
      <Seg value={style.bg} options={(['chiaro', 'medio', 'scuro'] as const).map(v => [v, t(`bg.${v}`)])} onChange={bg => setStyle({ bg })} />
      <h3>{t('style.mann')}</h3>
      <Seg value={style.mann} options={(['grigio', 'bianco', 'arancio'] as const).map(v => [v, t(`mann.${v}`)])} onChange={mann => setStyle({ mann })} />
      <label className="check">
        <input type="checkbox" checked={style.refs || style.subject === 'nessuno'} disabled={style.subject === 'nessuno'}
          onChange={e => setStyle({ refs: e.target.checked })} />
        {t('style.refs')}
      </label>
      {style.subject === 'nessuno' && <p className="note">{t('style.refsForced')}</p>}
    </Section>
  );
}

const SUBJECTS: SubjectMode[] = ['manichino', 'cilindro', 'blocco', 'nessuno'];

/** Scelta del soggetto nel video guida: usata nel pannello Stile e nella finestra Esporta. */
export function SubjectPicker({ disabled }: { disabled?: boolean }) {
  const subject = useApp(s => s.style.subject);
  const t = useT();
  return (
    <>
      <h3>{t('style.subject')}</h3>
      <div className="seg">
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

function HandheldSection() {
  const h = useApp(s => s.handheld);
  const t = useT();
  const set = (patch: Partial<typeof h>) => setState(s => ({ handheld: { ...s.handheld, ...patch } }));
  const pace = h.frequency < 0.7 ? t('hh.slow') : h.frequency > 1.6 ? t('hh.nervous') : t('hh.natural');
  return (
    <Section title={t('hh.title')}>
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

export function Panel() {
  const aspect = useApp(s => s.aspect);
  const thirds = useApp(s => s.thirds);
  const center = useApp(s => s.center);
  const safe = useApp(s => s.safe);
  const t = useT();
  return (
    <aside className="panel">
      <h1>Stage</h1>
      <Section title={t('fmt.title')}>
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
      <CameraSection />
      <HandheldSection />
      <SceneSection />
      <StyleSection />
    </aside>
  );
}
