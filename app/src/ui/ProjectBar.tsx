import { useRef, useState } from 'react';
import { setState, useApp, type Lang } from '../store';
import { newProject, openProject, saveProject } from '../project';
import { LANGS, setLang, useT } from '../i18n';
import { ExportDialog } from './ExportDialog';

export function ProjectBar() {
  const name = useApp(s => s.projectName);
  const lang = useApp(s => s.lang);
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');

  const flash = (m: string) => {
    setMessage(m);
    window.setTimeout(() => setMessage(''), 3000);
  };

  return (
    <div className="project-bar">
      <input
        className="project-name"
        value={name}
        onChange={e => setState({ projectName: e.target.value })}
        aria-label={t('pb.nameAria')}
        spellCheck={false}
      />
      <button onClick={() => { if (confirm(t('pb.newConfirm'))) newProject(); }}>{t('pb.new')}</button>
      <button onClick={() => fileInput.current?.click()}>{t('pb.open')}</button>
      <button onClick={async () => { if (await saveProject()) flash(t('pb.saved')); }}>{t('pb.save')}</button>
      <input
        ref={fileInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          try {
            await openProject(file);
            flash(t('pb.opened'));
          } catch (err) {
            alert(t('pb.openError', { msg: (err as Error).message }));
          }
        }}
      />
      {message && <span className="flash">{message}</span>}
      <span className="spacer" />
      <label className="inline" title={t('lang.label')}>
        <span aria-hidden="true">🌐</span>
        <select value={lang} onChange={e => setLang(e.target.value as Lang)} aria-label={t('lang.label')}>
          {LANGS.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
        </select>
      </label>
      <button className="primary" onClick={() => setExporting(true)}>{t('pb.export')}</button>
      {exporting && <ExportDialog onClose={() => setExporting(false)} />}
    </div>
  );
}
