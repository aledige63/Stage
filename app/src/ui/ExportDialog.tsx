import { useRef, useState, type ReactNode } from 'react';
import { setState, store, useApp } from '../store';
import { pause } from '../timeline';
import { exportSize, exportVideo, videoSupported, type Resolution } from '../export/video';
import { DEFAULT_TOKENS, generatePrompt, generateRef2vaPrompt } from '../export/prompt';
import { pickSaveTarget, sanitizeFileName } from '../export/files';
import { useT, type TKey } from '../i18n';
import { SubjectPicker } from './Panel';

function readTokens(): typeof DEFAULT_TOKENS {
  try {
    return { ...DEFAULT_TOKENS, ...JSON.parse(localStorage.getItem('stage:tokens') ?? '{}') };
  } catch {
    return DEFAULT_TOKENS;
  }
}

/** Testo del prompt modificabile, con copia, salvataggio e rigenerazione. */
function PromptBox({ title, note, make, fileName, rows, setStatus, children, collapsed }: {
  title: TKey; note: TKey; make: () => string; fileName: string; rows: number; collapsed?: boolean;
  setStatus: (s: string) => void; children?: ReactNode;
}) {
  const t = useT();
  const [text, setText] = useState(make);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(t('ex.copied'));
    } catch {
      setStatus(t('ex.copyFail'));
    }
  };

  const save = async () => {
    const target = await pickSaveTarget(fileName, t('file.text'), 'text/plain', '.txt');
    if (!target) return;
    await target.write(new Blob([text], { type: 'text/plain' }));
    setStatus(t('ex.promptSaved'));
  };

  const body = (
    <>
      <p className="muted">{t(note)}</p>
      {children}
      <textarea value={text} onChange={e => setText(e.target.value)} rows={rows} spellCheck={false} aria-label={t(title)} />
      <div className="row">
        <button onClick={copy}>{t('ex.copy')}</button>
        <button onClick={save}>{t('ex.saveTxt')}</button>
        <span className="spacer" />
        <button onClick={() => setText(make())} title={t('ex.regenTitle')}>{t('ex.regen')}</button>
      </div>
    </>
  );
  // richiuso: un esempio da aprire solo se serve
  return collapsed ? (
    <section>
      <details>
        <summary><h3>{t(title)}</h3></summary>
        {body}
      </details>
    </section>
  ) : (
    <section>
      <h3>{t(title)}</h3>
      {body}
    </section>
  );
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const aspect = useApp(s => s.aspect);
  const res = useApp(s => s.exportRes);
  const silentAudio = useApp(s => s.exportAudio);
  const duration = useApp(s => s.duration);
  const fps = useApp(s => s.fps);
  const keyCount = useApp(s => s.keyframes.length);
  const projectName = useApp(s => s.projectName);
  const t = useT();

  const [tokens, setTokens] = useState(readTokens);
  const [ref2vaKey, setRef2vaKey] = useState(0);
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

  const setToken = (key: keyof typeof DEFAULT_TOKENS, value: string) => {
    const next = { ...tokens, [key]: value };
    setTokens(next);
    try {
      localStorage.setItem('stage:tokens', JSON.stringify(next));
    } catch {
      // preferenza non salvabile
    }
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

        <PromptBox title="ex.prompt" note="ex.promptNote" rows={9} fileName={baseName + '.txt'}
          make={() => generatePrompt(store.getState())} setStatus={setStatus} />
        {/* la chiave ricrea il testo quando cambiano i segnaposto */}
        <PromptBox key={ref2vaKey} collapsed title="ex.ref2va" note="ex.ref2vaNote" rows={12} fileName={baseName + '_ref2va.txt'}
          make={() => generateRef2vaPrompt(store.getState(), tokens)} setStatus={setStatus}>
          <div className="row tokens">
            <label>{t('ex.tokenSubject')} <input value={tokens.subject} onChange={e => setToken('subject', e.target.value)} onBlur={() => setRef2vaKey(k => k + 1)} /></label>
            <label>{t('ex.tokenVideo')} <input value={tokens.video} onChange={e => setToken('video', e.target.value)} onBlur={() => setRef2vaKey(k => k + 1)} /></label>
          </div>
        </PromptBox>

        <p className="status">{status}</p>
      </div>
    </div>
  );
}
