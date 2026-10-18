import { useRef, useState } from 'react';
import { setState, store, useApp } from '../store';
import { pause } from '../timeline';
import { exportSize, exportVideo, videoSupported, type Resolution } from '../export/video';
import { generatePrompt } from '../export/prompt';
import { pickSaveTarget, sanitizeFileName } from '../export/files';
import { useT } from '../i18n';
import { SubjectPicker } from './Panel';

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const aspect = useApp(s => s.aspect);
  const res = useApp(s => s.exportRes);
  const silentAudio = useApp(s => s.exportAudio);
  const duration = useApp(s => s.duration);
  const fps = useApp(s => s.fps);
  const keyCount = useApp(s => s.keyframes.length);
  const projectName = useApp(s => s.projectName);
  const t = useT();

  const [prompt, setPrompt] = useState(() => generatePrompt(store.getState()));
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const abort = useRef<AbortController | null>(null);

  const [w, h] = exportSize(aspect, res);
  const baseName = `${sanitizeFileName(projectName)}_${aspect.replace(':', 'x')}_${res}p_${duration}s`;
  const busy = progress !== null;

  const runExport = async () => {
    pause();
    const target = await pickSaveTarget(baseName + '.mp4', t('file.video'), 'video/mp4', '.mp4');
    if (!target) return;
    const ctrl = new AbortController();
    abort.current = ctrl;
    setProgress(0);
    setStatus(t('ex.rendering', { w, h }));
    try {
      const blob = await exportVideo({ res, silentAudio, signal: ctrl.signal, onProgress: setProgress });
      await target.write(blob);
      setStatus(t('ex.saved', { name: baseName + '.mp4', mb: (blob.size / 1e6).toFixed(1) }));
    } catch (e) {
      const err = e as Error;
      setStatus(err.name === 'AbortError' ? t('ex.cancelled') : t('ex.error', { msg: err.message }));
    } finally {
      setProgress(null);
      abort.current = null;
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setStatus(t('ex.copied'));
    } catch {
      setStatus(t('ex.copyFail'));
    }
  };

  const savePrompt = async () => {
    const target = await pickSaveTarget(baseName + '.txt', t('file.text'), 'text/plain', '.txt');
    if (!target) return;
    await target.write(new Blob([prompt], { type: 'text/plain' }));
    setStatus(t('ex.promptSaved'));
  };

  return (
    <div className="modal-backdrop" onPointerDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="modal" role="dialog" aria-label={t('ex.title')}>
        <header>
          <h2>{t('ex.title')}</h2>
          <button onClick={onClose} disabled={busy} aria-label={t('ex.close')}>✕</button>
        </header>

        <section>
          <h3>{t('ex.video')}</h3>
          <div className="row">
            <div className="seg">
              {([720, 1080] as Resolution[]).map(r => (
                <button key={r} className={r === res ? 'on' : ''} disabled={busy} onClick={() => setState({ exportRes: r })}>{r}p</button>
              ))}
            </div>
            <span className="muted">{w}×{h} · {aspect} · {fps} fps · {duration} s · {Math.round(duration * fps)} {t('ex.frames')}</span>
          </div>
          <SubjectPicker disabled={busy} />
          <label className="check">
            <input type="checkbox" checked={silentAudio} disabled={busy} onChange={e => setState({ exportAudio: e.target.checked })} />
            {t('ex.audio')}
          </label>
          {keyCount < 2 && <p className="warn">{keyCount === 0 ? t('ex.noKeys') : t('ex.oneKey')}</p>}
          {!videoSupported() && <p className="warn">{t('ex.noVideo')}</p>}
          <div className="row">
            {busy ? (
              <>
                <div className="progress"><div style={{ width: `${(progress ?? 0) * 100}%` }} /></div>
                <button onClick={() => abort.current?.abort()}>{t('ex.cancel')}</button>
              </>
            ) : (
              <button className="primary" disabled={!videoSupported()} onClick={runExport}>{t('ex.exportMp4')}</button>
            )}
          </div>
        </section>

        <section>
          <h3>{t('ex.prompt')}</h3>
          <p className="muted">{t('ex.promptNote')}</p>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} rows={9} spellCheck={false} />
          <div className="row">
            <button onClick={copyPrompt}>{t('ex.copy')}</button>
            <button onClick={savePrompt}>{t('ex.saveTxt')}</button>
            <span className="spacer" />
            <button onClick={() => setPrompt(generatePrompt(store.getState()))} title={t('ex.regenTitle')}>{t('ex.regen')}</button>
          </div>
        </section>

        <p className="status">{status}</p>
      </div>
    </div>
  );
}
