import { useRef } from 'react';
import { setState, store, useApp, type Easing, type Keyframe } from '../store';
import { EASING_LABELS } from '../engine/interpolation';
import {
  applyPreset, clearKeyframes, deleteKeyframe, DURATION_MAX, DURATION_MIN, FPS_OPTIONS, jumpKey, pause, PRESETS, seek,
  setDuration, setFps, setKeyframe, togglePlay, updateKeyframe, type PresetId,
} from '../timeline';
import { useT, type TKey } from '../i18n';

const EASINGS: Easing[] = ['linear', 'in', 'out', 'inout', 'hold'];

function Track() {
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
    pause();
    e.currentTarget.setPointerCapture(e.pointerId);
    seek(timeAt(e.clientX));
  };

  const onKeyDown = (e: React.PointerEvent, k: Keyframe) => {
    e.stopPropagation();
    pause();
    e.currentTarget.setPointerCapture(e.pointerId);
    setState({ selectedKey: k.id });
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
        return (
          <div
            key={k.id + '-seg'}
            className={`tl-seg ${k.easing}`}
            style={{ left: pct(k.time), width: pct(next.time - k.time) }}
            title={`${EASING_LABELS[k.easing]} · ${k.path === 'arc' ? t('tl.segArc') : t('tl.segLinear')}`}
            onPointerDown={() => setState({ selectedKey: k.id })}
          >
            <span>{EASING_LABELS[k.easing]}{k.path === 'arc' ? ' ⌒' : ''}</span>
          </div>
        );
      })}
      {keyframes.map(k => (
        <div
          key={k.id}
          className={`tl-key ${k.id === selectedKey ? 'on' : ''}`}
          style={{ left: pct(k.time) }}
          onPointerDown={e => onKeyDown(e, k)}
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

function KeyEditor({ k }: { k: Keyframe }) {
  const keyframes = useApp(s => s.keyframes);
  const t = useT();
  const isLast = keyframes[keyframes.length - 1]?.id === k.id;
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
            <button className={k.path === 'arc' ? 'on' : ''} onClick={() => updateKeyframe(k.id, { path: 'arc' })} title={t('tl.arcTitle')}>{t('tl.arc')}</button>
            <button className={k.path === 'linear' ? 'on' : ''} onClick={() => updateKeyframe(k.id, { path: 'linear' })} title={t('tl.linearTitle')}>{t('tl.linear')}</button>
          </div>
        </>
      )}
      <span className="spacer" />
      <button onClick={() => { seek(k.time); setKeyframe(); }} title={t('tl.updateTitle')}>{t('tl.update')}</button>
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
  const t = useT();
  const selected = keyframes.find(k => k.id === selectedKey);
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
        {dirty && <span className="dirty">{t('tl.dirty')}</span>}
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
        <button className="danger" disabled={!keyframes.length}
          onClick={() => { if (confirm(t('tl.clearConfirm'))) clearKeyframes(); }}>{t('tl.clear')}</button>
      </div>
      <Track />
      {selected ? <KeyEditor k={selected} /> : (
        <div className="tl-editor muted">
          {keyframes.length ? t('tl.hintKeys') : t('tl.hintEmpty')}
        </div>
      )}
    </div>
  );
}

// Esposto per test e debug dalla console
(window as unknown as { stage: unknown }).stage = { store };
