import { useCallback, useRef, useState } from 'react';
import { colorCss, setState, store, useApp, type Easing, type Keyframe, type ObjectKey, type SceneObject } from '../store';
import { EASING_LABELS, panDelta, segmentPath } from '../engine/interpolation';
import {
  applyPreset, clearKeyframes, deleteKeyframe, deleteObjectKey, DURATION_MAX, DURATION_MIN, FPS_OPTIONS, jumpKey, keyOwner, pause, PRESETS, refreshKeyframe, refreshObjectKey,
  seek, setDuration, setFps, setKeyframe, setObjectKey, togglePlay, updateKeyframe, updateObjectKey, type PresetId,
} from '../timeline';
import { objectLabel, useT, type TKey } from '../i18n';
import { KeyMenu, type KeyMenuTarget } from './KeyMenu';

type OpenMenu = (e: React.MouseEvent, key: string, obj?: string) => void;

const EASINGS: Easing[] = ['linear', 'in', 'out', 'inout', 'hold'];

function Track({ onMenu }: { onMenu: OpenMenu }) {
  const ref = useRef<HTMLDivElement>(null);
  const duration = useApp(s => s.duration);
  const time = useApp(s => s.time);
  const keyframes = useApp(s => s.keyframes);
  const selectedKey = useApp(s => s.selectedKey);
  const t = useT();

  const pct = (x: number) => `${(x / duration) * 100}%`;
  const timeAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * duration;
  };

  const onScrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pause();
    e.currentTarget.setPointerCapture(e.pointerId);
    seek(timeAt(e.clientX));
  };

  const onKeyDown = (e: React.PointerEvent, k: Keyframe) => {
    e.stopPropagation();
    pause();
    // clic destro: seleziona senza spostare la testina (serve a "duplica qui")
    if (e.button === 2) { setState({ selectedKey: k.id, selectedObjKey: null }); return; }
    e.currentTarget.setPointerCapture(e.pointerId);
    setState({ selectedKey: k.id, selectedObjKey: null });
    seek(k.time);
  };

  const ticks = [];
  for (let s = 0; s <= Math.floor(duration); s++) ticks.push(s);

  return (
    <div
      className="tl-track"
      ref={ref}
      onPointerDown={onScrub}
      onPointerMove={e => { if (e.buttons === 1 && e.currentTarget.hasPointerCapture(e.pointerId)) seek(timeAt(e.clientX)); }}
    >
      {ticks.map(s => (
        <div key={s} className="tl-tick" style={{ left: pct(s) }}><span>{s}s</span></div>
      ))}
      {keyframes.slice(0, -1).map((k, i) => {
        const next = keyframes[i + 1];
        const path = segmentPath(k.camera, next.camera, k.path);
        return (
          <div
            key={k.id + '-seg'}
            className={`tl-seg ${k.easing}`}
            style={{ left: pct(k.time), width: pct(next.time - k.time) }}
            title={`${EASING_LABELS[k.easing]} · ${path === 'pan' ? t('tl.segPan') : path === 'arc' ? t('tl.segArc') : t('tl.segLinear')}`}
            onPointerDown={e => { if (e.button === 2) e.stopPropagation(); setState({ selectedKey: k.id, selectedObjKey: null }); }}
            onContextMenu={e => onMenu(e, k.id)}
          >
            <span>{EASING_LABELS[k.easing]}{path === 'pan' ? ' ⟳' : path === 'arc' ? ' ⌒' : ''}</span>
          </div>
        );
      })}
      {keyframes.map(k => (
        <div
          key={k.id}
          className={`tl-key ${k.id === selectedKey ? 'on' : ''}`}
          style={{ left: pct(k.time) }}
          onPointerDown={e => onKeyDown(e, k)}
          onContextMenu={e => onMenu(e, k.id)}
          onPointerMove={e => {
            if (e.buttons === 1 && e.currentTarget.hasPointerCapture(e.pointerId)) updateKeyframe(k.id, { time: timeAt(e.clientX) });
          }}
          title={t('tl.dragKey', { t: k.time.toFixed(2) })}
        />
      ))}
      <div className="tl-head" style={{ left: pct(time) }} />
    </div>
  );
}

/** Traccia di un oggetto, sotto quella della camera. */
function ObjectTrack({ obj, onMenu }: { obj: SceneObject; onMenu: OpenMenu }) {
  const ref = useRef<HTMLDivElement>(null);
  const duration = useApp(s => s.duration);
  const time = useApp(s => s.time);
  const selected = useApp(s => s.selectedObjKey);
  const t = useT();
  const keys = obj.keys ?? [];
  const label = objectLabel(obj);

  const pct = (x: number) => `${(x / duration) * 100}%`;
  const timeAt = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * duration;
  };

  return (
    <div
      className="tl-track obj"
      ref={ref}
      style={{ '--obj': colorCss(obj) } as React.CSSProperties}
      onPointerDown={e => { if (e.button !== 0) return; pause(); e.currentTarget.setPointerCapture(e.pointerId); seek(timeAt(e.clientX)); }}
      onPointerMove={e => { if (e.buttons === 1 && e.currentTarget.hasPointerCapture(e.pointerId)) seek(timeAt(e.clientX)); }}
    >
      <span className="tl-lane"><i className="obj-dot" style={{ background: colorCss(obj) }} />{label}</span>
      {keys.slice(0, -1).map((k, i) => {
        const next = keys[i + 1];
        return (
          <div key={k.id + '-seg'} className={`tl-seg ${k.easing}`} style={{ left: pct(k.time), width: pct(next.time - k.time) }}
            title={EASING_LABELS[k.easing]}
            onPointerDown={e => { if (e.button === 2) e.stopPropagation(); setState({ selectedObjKey: k.id, selectedKey: null, selectedId: obj.id }); }}
            onContextMenu={e => onMenu(e, k.id, obj.id)}>
            <span>{EASING_LABELS[k.easing]}</span>
          </div>
        );
      })}
      {keys.map(k => (
        <div
          key={k.id}
          className={`tl-key ${k.id === selected ? 'on' : ''}`}
          style={{ left: pct(k.time) }}
          onPointerDown={e => {
            e.stopPropagation();
            pause();
            setState({ selectedObjKey: k.id, selectedKey: null, selectedId: obj.id });
            if (e.button === 2) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            seek(k.time);
          }}
          onContextMenu={e => onMenu(e, k.id, obj.id)}
          onPointerMove={e => {
            if (e.buttons === 1 && e.currentTarget.hasPointerCapture(e.pointerId)) updateObjectKey(obj.id, k.id, { time: timeAt(e.clientX) });
          }}
          title={t('tl.dragSubjKey', { name: label, t: k.time.toFixed(2) })}
        />
      ))}
      <div className="tl-head" style={{ left: pct(time) }} />
    </div>
  );
}

function ObjectKeyEditor({ obj, k }: { obj: SceneObject; k: ObjectKey }) {
  const t = useT();
  const keys = obj.keys ?? [];
  const isLast = keys[keys.length - 1]?.id === k.id;
  return (
    <div className="tl-editor">
      <b className="obj-label"><i className="obj-dot" style={{ background: colorCss(obj) }} />{objectLabel(obj)} {k.time.toFixed(2)} s</b>
      {isLast ? (
        <span className="muted">{t('tl.lastKey')}</span>
      ) : (
        <>
          <span className="muted">{t('tl.curve')}</span>
          <div className="seg">
            {EASINGS.map(e => (
              <button key={e} className={k.easing === e ? 'on' : ''} onClick={() => updateObjectKey(obj.id, k.id, { easing: e })}>{EASING_LABELS[e]}</button>
            ))}
          </div>
        </>
      )}
      <span className="spacer" />
      <button onClick={() => refreshObjectKey(obj.id, k.id)} title={t('tl.subjUpdateTitle')}>{t('tl.subjUpdate')}</button>
      <button className="danger" onClick={() => deleteObjectKey(obj.id, k.id)}>{t('tl.delete')}</button>
    </div>
  );
}

function KeyEditor({ k }: { k: Keyframe }) {
  const keyframes = useApp(s => s.keyframes);
  const t = useT();
  const isLast = keyframes[keyframes.length - 1]?.id === k.id;
  const next = keyframes[keyframes.findIndex(x => x.id === k.id) + 1];
  const path = next ? segmentPath(k.camera, next.camera, k.path) : k.path;
  // camera ferma: può essere solo una panoramica
  const fixed = next ? segmentPath(k.camera, next.camera, 'arc') === 'pan' : false;
  const turn = next ? (panDelta(k.camera, next.camera, k.extraTurns) * 180) / Math.PI : 0;
  const addTurn = (n: number) => updateKeyframe(k.id, { extraTurns: (k.extraTurns ?? 0) + n });
  return (
    <div className="tl-editor">
      <b>◆ {k.time.toFixed(2)} s</b>
      {isLast ? (
        <span className="muted">{t('tl.lastKey')}</span>
      ) : (
        <>
          <span className="muted">{t('tl.curve')}</span>
          <div className="seg">
            {EASINGS.map(e => (
              <button key={e} className={k.easing === e ? 'on' : ''} onClick={() => updateKeyframe(k.id, { easing: e })}>{EASING_LABELS[e]}</button>
            ))}
          </div>
          <span className="muted">{t('tl.path')}</span>
          <div className="seg">
            <button className={path === 'arc' ? 'on' : ''} disabled={fixed} onClick={() => updateKeyframe(k.id, { path: 'arc' })} title={t('tl.arcTitle')}>{t('tl.arc')}</button>
            <button className={path === 'linear' ? 'on' : ''} disabled={fixed} onClick={() => updateKeyframe(k.id, { path: 'linear' })} title={t('tl.linearTitle')}>{t('tl.linear')}</button>
            <button className={path === 'pan' ? 'on' : ''} onClick={() => updateKeyframe(k.id, { path: 'pan' })} title={t('tl.panTitle')}>{t('tl.pan')}</button>
          </div>
          {path === 'pan' && (
            <>
              <span className="muted">{Math.round(Math.abs(turn))}° {turn > 0 ? t('tl.left') : t('tl.right')}</span>
              <div className="seg">
                <button onClick={() => addTurn(1)} title={t('tl.turnLeft')}>◀ 360°</button>
                <button onClick={() => addTurn(-1)} title={t('tl.turnRight')}>360° ▶</button>
              </div>
            </>
          )}
        </>
      )}
      <span className="spacer" />
      <button onClick={() => refreshKeyframe(k.id)} title={t('tl.updateTitle')}>{t('tl.update')}</button>
      <button className="danger" onClick={() => deleteKeyframe(k.id)}>{t('tl.delete')}</button>
    </div>
  );
}

export function Timeline() {
  const playing = useApp(s => s.playing);
  const time = useApp(s => s.time);
  const duration = useApp(s => s.duration);
  const fps = useApp(s => s.fps);
  const loop = useApp(s => s.loop);
  const dirty = useApp(s => s.dirty);
  const keyframes = useApp(s => s.keyframes);
  const selectedKey = useApp(s => s.selectedKey);
  const objects = useApp(s => s.objects);
  const selectedId = useApp(s => s.selectedId);
  const selectedObjKey = useApp(s => s.selectedObjKey);
  const objectDirty = useApp(s => Object.keys(s.pendingPoses).length > 0);
  const t = useT();
  const [menu, setMenu] = useState<KeyMenuTarget | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const openMenu: OpenMenu = (e, key, obj) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY, key, obj }); };
  const selected = keyframes.find(k => k.id === selectedKey);
  const owner = keyOwner(store.getState(), selectedObjKey);
  const ownerKey = owner?.keys?.find(k => k.id === selectedObjKey);
  const current = objects.find(o => o.id === selectedId);
  // una traccia per ogni oggetto animato, più quella dell'oggetto selezionato
  const lanes = objects.filter(o => o.keys?.length || o.id === selectedId);
  const anyObjectKeys = objects.some(o => o.keys?.length);
  const frame = Math.round(time * fps);

  return (
    <div className="timeline">
      <div className="tl-bar">
        <button onClick={() => { pause(); seek(0); }} title={t('tl.start')}>⏮</button>
        <button onClick={() => jumpKey(-1)} title={t('tl.prevKey')}>◀◆</button>
        <button className="play" onClick={togglePlay} title={t('tl.play')}>{playing ? '❚❚' : '▶'}</button>
        <button onClick={() => jumpKey(1)} title={t('tl.nextKey')}>◆▶</button>
        <span className="tl-time">{time.toFixed(2)} s <small>/ {duration.toFixed(1)} s · {t('tl.frame')} {frame}</small></span>
        <button className={`keybtn ${dirty ? 'pulse' : ''}`} onClick={() => { pause(); setKeyframe(); }} title={t('tl.keyTitle')}>
          ◆ Keyframe
        </button>
        <button className={`keybtn subj ${objectDirty ? 'pulse' : ''}`} disabled={!current} onClick={() => { pause(); setObjectKey(); }} title={t('tl.subjKeyTitle')}>
          ● {current ? objectLabel(current) : t('tl.objNone')}
        </button>
        {dirty && <span className="dirty">{t('tl.dirty')}</span>}
        {objectDirty && <span className="dirty subj">{t('tl.subjDirty')}</span>}
        <span className="spacer" />
        <label className="inline">
          {t('tl.preset')}
          <select value="" onChange={e => { if (e.target.value) applyPreset(e.target.value as PresetId); }}>
            <option value="">{t('tl.choose')}</option>
            {PRESETS.map(p => <option key={p} value={p}>{t(`preset.${p}` as TKey)}</option>)}
          </select>
        </label>
        <label className="inline">
          {t('tl.duration')}
          <input type="number" min={DURATION_MIN} max={DURATION_MAX} step={0.5} value={duration}
            onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) setDuration(v); }} />
          s
        </label>
        <div className="seg">
          {FPS_OPTIONS.map(f => (
            <button key={f} className={f === fps ? 'on' : ''} onClick={() => setFps(f)}>{f}</button>
          ))}
        </div>
        <span className="muted">fps</span>
        <label className="inline">
          <input type="checkbox" checked={loop} onChange={e => setState({ loop: e.target.checked })} /> {t('tl.loop')}
        </label>
        <button className="danger" disabled={!keyframes.length && !anyObjectKeys}
          onClick={() => { if (confirm(t('tl.clearConfirm'))) clearKeyframes(); }}>{t('tl.clear')}</button>
      </div>
      <Track onMenu={openMenu} />
      {lanes.map(o => <ObjectTrack key={o.id} obj={o} onMenu={openMenu} />)}
      {menu && <KeyMenu target={menu} onClose={closeMenu} />}
      {selected ? <KeyEditor k={selected} /> : owner && ownerKey ? <ObjectKeyEditor obj={owner} k={ownerKey} /> : (
        <div className="tl-editor muted">
          {keyframes.length || anyObjectKeys ? t('tl.hintKeys') : t('tl.hintEmpty')}
        </div>
      )}
    </div>
  );
}

// Esposto per test e debug dalla console
(window as unknown as { stage: unknown }).stage = { store };
